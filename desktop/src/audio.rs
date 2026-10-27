use std::{ffi::{c_char,c_void,CStr},sync::mpsc::{sync_channel,SyncSender}};
use serde::Deserialize;
use serde_json::{json,Value};
use tauri::{Manager,State};

#[repr(C)]
#[derive(Default)]
struct Status {
 callbacks:u64,frames:u64,total_ns:u64,max_ns:u64,deadline_misses:u64,oversized:u64,clipped:u64,peak_million:u64,
 position:u64,active:u64,state:u64,fault:u64,admitted:u64,stolen:u64,
 sample_rate:u32,hardware_rate:u32,period_frames:u32,period_count:u32,device_lost:u32,test_backend:u32,
}
unsafe extern "C" {
 fn premidi_audio_create(test:i32)->*mut c_void;
 fn premidi_audio_destroy(host:*mut c_void);
 fn premidi_audio_error(host:*mut c_void)->*const c_char;
 fn premidi_audio_devices(host:*mut c_void)->i32;
 fn premidi_audio_device_name(host:*mut c_void,index:u32)->*const c_char;
 fn premidi_audio_backend(host:*mut c_void)->*const c_char;
 fn premidi_audio_configure(host:*mut c_void,device:u32,rate:u32,frames:u32)->i32;
 fn premidi_audio_play(host:*mut c_void,data:*const u8,length:usize,cycle:f64,seek:f64,looping:i32,preview:i32)->i32;
 fn premidi_audio_control(host:*mut c_void,command:u32,looping:i32)->i32;
 fn premidi_audio_status_get(host:*mut c_void,status:*mut Status)->i32;
}
struct Host(*mut c_void);
// This pointer never leaves its dedicated control thread. COM/backend affinity
// and destruction stay on that thread; it does not need an unsafe Send impl.
impl Drop for Host {fn drop(&mut self){unsafe{premidi_audio_destroy(self.0)}}}
impl Host {
 fn new()->Result<Self,String>{
  let test=std::env::var("PREMIDI_NATIVE_TEST_BACKEND").as_deref()==Ok("null")&&std::env::var_os("PREMIDI_SMOKE_OUTPUT").is_some();
  let pointer=unsafe{premidi_audio_create(i32::from(test))};
  if pointer.is_null(){Err("No native audio backend is available. Connect an output, or explicitly choose Web Audio in Settings.".into())}else{Ok(Self(pointer))}
 }
 fn check(&self,result:i32)->Result<(),String>{if result<0{Err(unsafe{CStr::from_ptr(premidi_audio_error(self.0))}.to_string_lossy().into_owned())}else{Ok(())}}
 fn status(&self)->Result<Value,String>{
  let mut s=Status::default();self.check(unsafe{premidi_audio_status_get(self.0,&mut s)})?;
  let backend=unsafe{CStr::from_ptr(premidi_audio_backend(self.0))}.to_string_lossy();
  let cpu=if s.frames>0&&s.sample_rate>0{s.total_ns as f64*s.sample_rate as f64/(s.frames as f64*10_000_000.)}else{0.};
  Ok(json!({"backend":backend,"testBackend":s.test_backend!=0,"sampleRate":s.sample_rate,"hardwareRate":s.hardware_rate,"periodFrames":s.period_frames,"periods":s.period_count,
   "state":s.state,"positionSeconds":if s.sample_rate>0{s.position as f64/s.sample_rate as f64}else{0.},"active":s.active,"fault":s.fault,"deviceLost":s.device_lost!=0,
   "callbacks":s.callbacks,"frames":s.frames,"renderCpuPercent":cpu,"maxCallbackMs":s.max_ns as f64/1_000_000.,"deadlineMisses":s.deadline_misses,"oversizedCallbacks":s.oversized,
   "peak":s.peak_million as f64/1_000_000.,"clippedSamples":s.clipped,"deviceUnderruns":Value::Null,"measuredLatencyMs":Value::Null}))
 }
}
type Reply=SyncSender<Result<Value,String>>;
pub struct Audio{sender:SyncSender<(Request,Reply)>}
impl Default for Audio{
 fn default()->Self{
  let (sender,receiver)=sync_channel::<(Request,Reply)>(8);
  std::thread::Builder::new().name("pre-midi audio control".into()).spawn(move||{
   let mut host=None;
   while let Ok((request,reply))=receiver.recv(){let _=reply.send(handle(&mut host,request));}
  }).expect("Could not create audio control thread");
  Self{sender}
 }
}
impl Audio{
 fn call(&self,request:Request)->Result<Value,String>{
  let (reply,result)=sync_channel(1);
  self.sender.try_send((request,reply)).map_err(|_|"Native audio control is busy; retry the operation".to_string())?;
  result.recv().map_err(|_|"Native audio control thread stopped".to_string())?
 }
}
#[derive(Deserialize)]
#[serde(tag="action",rename_all="snake_case",deny_unknown_fields)]
pub enum Request {
 Devices,Status,
 Configure{device:Option<u32>,rate:u32,buffer:u32},
 Play{data:Vec<u8>,cycle:f64,seek:f64,looping:bool,preview:bool},
 Control{command:u32,looping:bool},
 Shutdown,
}
#[tauri::command]
pub async fn native_audio(app:tauri::AppHandle,request:Request)->Result<Value,String>{
 if let Request::Play{data,..}=&request {if data.len()>16*1024*1024{return Err("Native session exceeds 16 MiB".into());}}
 tauri::async_runtime::spawn_blocking(move||app.state::<Audio>().call(request)).await.map_err(|e|e.to_string())?
}
fn handle(slot:&mut Option<Host>,request:Request)->Result<Value,String>{
 if matches!(&request,Request::Shutdown){slot.take();return Ok(json!({"closed":true}));}
 if slot.is_none()&&matches!(&request,Request::Control{..}|Request::Status){return Ok(json!({"state":0,"sampleRate":0,"deviceLost":false}));}
 if slot.is_none(){*slot=Some(Host::new()?);}
 let host=slot.as_ref().unwrap();
 match request {
  Request::Devices=>{
   let count=unsafe{premidi_audio_devices(host.0)};host.check(count)?;let mut devices=vec![];
   for index in 0..count as u32{let name=unsafe{CStr::from_ptr(premidi_audio_device_name(host.0,index))}.to_string_lossy().into_owned();devices.push(json!({"id":index,"name":name}));}
   Ok(json!({"devices":devices,"status":host.status()?}))
  },
  Request::Status=>host.status(),
  Request::Configure{device,rate,buffer}=>{host.check(unsafe{premidi_audio_configure(host.0,device.unwrap_or(u32::MAX),rate,buffer)})?;host.status()},
  Request::Play{data,cycle,seek,looping,preview}=>{
   if data.len()>16*1024*1024{return Err("Native session exceeds 16 MiB".into());}
   host.check(unsafe{premidi_audio_play(host.0,data.as_ptr(),data.len(),cycle,seek,i32::from(looping),i32::from(preview))})?;host.status()
  },
  Request::Control{command,looping}=>{host.check(unsafe{premidi_audio_control(host.0,command,i32::from(looping))})?;host.status()},
  Request::Shutdown=>unreachable!(),
 }
}
pub fn shutdown(app:&tauri::AppHandle){let state:State<'_,Audio>=app.state();let _=state.call(Request::Shutdown);}
