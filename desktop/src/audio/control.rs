use std::{ffi::{c_char,c_void,CStr},sync::{mpsc::{sync_channel,SyncSender},Arc,atomic::{AtomicBool,Ordering}}};
use serde::{Deserialize,Serialize};
use std::collections::HashMap;
use serde_json::{json,Value};

#[repr(C)]
#[derive(Default)]
struct Status {
 callbacks:u64,frames:u64,total_ns:u64,max_ns:u64,deadline_misses:u64,oversized:u64,clipped:u64,peak_million:u64,
 position:u64,active:u64,state:u64,fault:u64,admitted:u64,stolen:u64,
 sample_rate:u32,hardware_rate:u32,period_frames:u32,period_count:u32,device_lost:u32,test_backend:u32,
}
#[repr(C)]
#[derive(Default,Clone,Serialize)]
struct SampleInfo {id:u32,rate:u32,channels:u32,frames:u64,normalization:f64}
unsafe extern "C" {
 #[cfg(test)]fn premidi_audio_add_sample(host:*mut c_void,pcm:*const f32,frames:u64,rate:u32,channels:u32,info:*mut SampleInfo)->i32;
 fn premidi_audio_add_sample_rate(host:*mut c_void,pcm:*const f32,frames:u64,rate:u32,channels:u32,info:*mut SampleInfo,target_rate:u32)->i32;
 fn premidi_audio_create(test:i32)->*mut c_void;
 fn premidi_audio_destroy(host:*mut c_void);
 fn premidi_audio_error(host:*mut c_void)->*const c_char;
 fn premidi_audio_devices(host:*mut c_void)->i32;
 fn premidi_audio_device_name(host:*mut c_void,index:u32)->*const c_char;
 fn premidi_audio_backend(host:*mut c_void)->*const c_char;
 fn premidi_audio_configure(host:*mut c_void,device:u32,rate:u32,frames:u32)->i32;
 fn premidi_audio_play(host:*mut c_void,data:*const u8,length:usize,cycle:f64,seek:f64,looping:i32,preview:i32)->i32;
 fn premidi_audio_update(host:*mut c_void,data:*const u8,length:usize,cycle:f64,looping:i32,tempo_ratio:f64)->i32;
 fn premidi_audio_render(host:*mut c_void,data:*const u8,length:usize,cycle:f64,rate:u32,frames:u64,output:*mut u8,output_bytes:usize,format:u32,gain:f64)->i32;
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
enum Work{Json(Request,Reply),Render(RenderRequest,SyncSender<Result<Vec<u8>,String>>)}
pub struct Audio{sender:SyncSender<Work>,closing:Arc<AtomicBool>}
impl Default for Audio{
 fn default()->Self{
  let (sender,receiver)=sync_channel::<Work>(8);
  let closing=Arc::new(AtomicBool::new(false));let worker_closing=closing.clone();
  std::thread::Builder::new().name("pre-midi audio control".into()).spawn(move||{
   let mut host=ControlState::default();
   while let Ok(work)=receiver.recv(){match work{
    Work::Json(request,reply)=>{let result=if worker_closing.load(Ordering::SeqCst)&&!matches!(&request,Request::Shutdown){Err("pre-midi is closing".into())}else{handle(&mut host,request)};let _=reply.send(result);},
    Work::Render(request,reply)=>{let result=if worker_closing.load(Ordering::SeqCst){Err("pre-midi is closing".into())}else{render(&mut host,request)};let _=reply.send(result);},
   }
   }
  }).expect("Could not create audio control thread");
  Self{sender,closing}
 }
}
impl Audio{
 pub(super) fn reopen(&self){self.closing.store(false,Ordering::SeqCst);}
 pub(super) fn call(&self,request:Request)->Result<Value,String>{
  if self.closing.load(Ordering::SeqCst){return Err("pre-midi is closing".into());}
  let (reply,result)=sync_channel(1);
  self.sender.try_send(Work::Json(request,reply)).map_err(|_|"Native audio control is busy; retry the operation".to_string())?;
  result.recv().map_err(|_|"Native audio control thread stopped".to_string())?
 }
 pub(super) fn close(&self){
  self.closing.store(true,Ordering::SeqCst);
  let (reply,result)=sync_channel(1);
  // Final shutdown must not be dropped when ordinary control messages fill the
  // queue. Queued work is rejected by the closing flag; callback state is freed
  // only after the worker has uninitialized and joined the native device.
  if self.sender.send(Work::Json(Request::Shutdown,reply)).is_ok(){let _=result.recv();}
 }
 pub(super) fn render(&self,request:RenderRequest)->Result<Vec<u8>,String>{
  if self.closing.load(Ordering::SeqCst){return Err("pre-midi is closing".into());}
  let (reply,result)=sync_channel(1);self.sender.try_send(Work::Render(request,reply)).map_err(|_|"Native audio control is busy; retry the operation".to_string())?;
  result.recv().map_err(|_|"Native audio control thread stopped".to_string())?
 }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RenderRequest{data:Vec<u8>,cycle:f64,rate:u32,frames:u64,wav:bool,gain:f64}
fn render(state:&mut ControlState,request:RenderRequest)->Result<Vec<u8>,String>{
 let RenderRequest{data,cycle,rate,frames,wav,gain}=request;
 if data.len()>16*1024*1024||!(8000..=192000).contains(&rate)||frames==0||frames>rate as u64*600||!gain.is_finite()||!(0.0..=2.0).contains(&gain){return Err("Invalid native offline render dimensions".into());}
 if state.host.is_none(){state.generation+=1;state.host=Some(Host::new()?);}
 let host=state.host.as_ref().unwrap();let header=if wav{44}else{0};let size=(frames*2*if wav{2}else{4}) as usize;
 let mut bytes=vec![0u8;header+size];
 host.check(unsafe{premidi_audio_render(host.0,data.as_ptr(),data.len(),cycle,rate,frames,bytes[header..].as_mut_ptr(),size,u32::from(wav),gain)})?;
 if wav{
  bytes[0..4].copy_from_slice(b"RIFF");bytes[4..8].copy_from_slice(&((size+36) as u32).to_le_bytes());bytes[8..16].copy_from_slice(b"WAVEfmt ");bytes[16..20].copy_from_slice(&16u32.to_le_bytes());bytes[20..22].copy_from_slice(&1u16.to_le_bytes());bytes[22..24].copy_from_slice(&2u16.to_le_bytes());bytes[24..28].copy_from_slice(&rate.to_le_bytes());bytes[28..32].copy_from_slice(&(rate*4).to_le_bytes());bytes[32..34].copy_from_slice(&4u16.to_le_bytes());bytes[34..36].copy_from_slice(&16u16.to_le_bytes());bytes[36..40].copy_from_slice(b"data");bytes[40..44].copy_from_slice(&(size as u32).to_le_bytes());
 }
 Ok(bytes)
}
#[derive(Deserialize)]
#[serde(tag="action",rename_all="snake_case",deny_unknown_fields)]
pub enum Request {
 Devices,Status,Begin,
 Asset{data:Vec<u8>,#[serde(default)] rate:Option<u32>},
 Configure{device:Option<u32>,rate:u32,buffer:u32},
 Play{data:Vec<u8>,cycle:f64,seek:f64,looping:bool,preview:bool,#[serde(default)] owner:u64},
 Update{data:Vec<u8>,cycle:f64,looping:bool,tempo_ratio:f64,owner:u64},
 Control{command:u32,looping:bool,#[serde(default)] owner:Option<u64>},
 Shutdown,
}
#[derive(Default)]
struct ControlState{host:Option<Host>,issued:u64,cancelled:u64,current:u64,generation:u64,assets:HashMap<(u32,Vec<u8>),SampleInfo>}
impl ControlState{
 fn begin(&mut self)->Result<Value,String>{self.issued=self.issued.checked_add(1).ok_or("Audio session ID exhausted")?;Ok(json!({"owner":self.issued}))}
 fn valid(&self,owner:u64)->bool{owner>self.cancelled&&owner<=self.issued&&owner>=self.current}
 fn status(&self)->Result<Value,String>{
  let mut value=if let Some(host)=&self.host{host.status()?}else{json!({"state":0,"sampleRate":0,"deviceLost":false})};
  value["owner"]=json!(self.current);value["generation"]=json!(self.generation);Ok(value)
 }
}
fn handle(state:&mut ControlState,request:Request)->Result<Value,String>{
 if matches!(&request,Request::Begin){return state.begin();}
 if matches!(&request,Request::Shutdown){state.cancelled=state.issued;state.current=0;state.assets.clear();state.host.take();return Ok(json!({"closed":true}));}
 if let Request::Control{command:1|4,owner,..}=&request{
  let cancelled=owner.unwrap_or(state.issued);if cancelled>state.issued{return Err("Unknown native session".into());}state.cancelled=state.cancelled.max(cancelled);
 }
 if let Request::Play{owner,preview:false,..}=&request{if !state.valid(*owner){return Err("Native playback request cancelled".into());}}
 if let Request::Update{owner,..}=&request{if *owner!=state.current||!state.valid(*owner){return Err("Native edit request cancelled".into());}}
 if matches!(&request,Request::Control{..}|Request::Status)&&state.host.is_none(){return state.status();}
 if state.host.is_none(){state.generation+=1;state.host=Some(Host::new()?);}
 match request {
  Request::Devices=>{
   let host=state.host.as_ref().unwrap();let count=unsafe{premidi_audio_devices(host.0)};host.check(count)?;let mut devices=vec![];
   for index in 0..count as u32{let name=unsafe{CStr::from_ptr(premidi_audio_device_name(host.0,index))}.to_string_lossy().into_owned();devices.push(json!({"id":index,"name":name}));}
   Ok(json!({"devices":devices,"status":state.status()?}))
  },
  Request::Asset{data,rate}=>{
   if data.len()<16||data.len()>48_000_000{return Err("Invalid native asset size".into());}
   let host=state.host.as_ref().unwrap();let mut status=Status::default();host.check(unsafe{premidi_audio_status_get(host.0,&mut status)})?;
   if status.sample_rate==0&&rate.is_none(){return Err("Configure native output before loading audio assets".into());}
   let target=rate.unwrap_or(status.sample_rate);if !(8000..=192000).contains(&target){return Err("Invalid native asset output rate".into());}
   let key=(target,data);if let Some(info)=state.assets.get(&key){return Ok(serde_json::to_value(info).unwrap());}
   let audio=std::panic::catch_unwind(||premidi_decoder::decode(key.1.clone(),""))
    .map_err(|_|"Native audio decoder rejected malformed media".to_string())??;
   let mut info=SampleInfo::default();host.check(unsafe{premidi_audio_add_sample_rate(host.0,audio.samples.as_ptr(),(audio.samples.len()/audio.channels as usize) as u64,audio.rate,audio.channels,&mut info,target)})?;
   state.assets.insert(key,info.clone());Ok(serde_json::to_value(info).unwrap())
  },
  Request::Status=>state.status(),
  Request::Configure{device,rate,buffer}=>{state.assets.clear();state.generation+=1;state.cancelled=state.issued;state.current=0;let host=state.host.as_ref().unwrap();host.check(unsafe{premidi_audio_configure(host.0,device.unwrap_or(u32::MAX),rate,buffer)})?;state.status()},
  Request::Play{data,cycle,seek,looping,preview,owner}=>{
   if data.len()>16*1024*1024{return Err("Native session exceeds 16 MiB".into());}
   let host=state.host.as_ref().unwrap();host.check(unsafe{premidi_audio_play(host.0,data.as_ptr(),data.len(),cycle,seek,i32::from(looping),i32::from(preview))})?;
   if !preview{state.current=owner;}state.status()
  },
  Request::Control{command,looping,owner}=>{
   if owner.is_some_and(|value|value!=state.current){return state.status();}
   let host=state.host.as_ref().unwrap();host.check(unsafe{premidi_audio_control(host.0,command,i32::from(looping))})?;state.status()
  },
  Request::Update{data,cycle,looping,tempo_ratio,..}=>{
   if data.len()>16*1024*1024{return Err("Native session exceeds 16 MiB".into());}
   let host=state.host.as_ref().unwrap();host.check(unsafe{premidi_audio_update(host.0,data.as_ptr(),data.len(),cycle,i32::from(looping),tempo_ratio)})?;state.status()
  },
  Request::Shutdown|Request::Begin=>unreachable!(),
 }
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn worker_queue_cancels_and_reopens_without_a_device(){
  let worker=Audio::default();assert_eq!(worker.call(Request::Begin).unwrap()["owner"],1);
  assert!(worker.render(RenderRequest{data:vec![],cycle:1.0,rate:0,frames:0,wav:true,gain:0.85}).is_err());
  worker.close();assert!(worker.call(Request::Begin).is_err());worker.reopen();assert_eq!(worker.call(Request::Begin).unwrap()["owner"],2);worker.close();
 }
 #[test]fn native_codecs_own_and_play_every_studio_container(){
  let fixtures:&[&[u8]]=&[include_bytes!("../../../native/decoder/tests/fixtures/tone.wav"),include_bytes!("../../../native/decoder/tests/fixtures/tone.mp3"),include_bytes!("../../../native/decoder/tests/fixtures/vorbis.ogg"),include_bytes!("../../../native/decoder/tests/fixtures/opus.ogg"),include_bytes!("../../../native/decoder/tests/fixtures/tone.webm"),include_bytes!("../../../native/decoder/tests/fixtures/tone.mp4")];
  let pointer=unsafe{premidi_audio_create(1)};assert!(!pointer.is_null());let host=Host(pointer);
  host.check(unsafe{premidi_audio_configure(host.0,u32::MAX,48000,128)}).unwrap();let mut last_session=vec![];
  for bytes in fixtures {
   let audio=premidi_decoder::decode(bytes.to_vec(),"").unwrap();let mut info=SampleInfo::default();
   host.check(unsafe{premidi_audio_add_sample(host.0,audio.samples.as_ptr(),(audio.samples.len()/audio.channels as usize) as u64,audio.rate,audio.channels,&mut info)}).unwrap();drop(audio);
   let mut packet=vec![];let u32b=|out:&mut Vec<u8>,v:u32|out.extend(v.to_le_bytes());let f64b=|out:&mut Vec<u8>,v:f64|out.extend(v.to_le_bytes());
   for v in [0x38564d50,48000,1,8,1,info.id]{u32b(&mut packet,v);}
   for v in [0.,0.1,0.11,0.11,0.1,0.,1.,0.,14000.,0.7,0.,5.,0.,0.,0.,5.]{f64b(&mut packet,v);}
   for v in [0,1,0,2]{u32b(&mut packet,v);}
   u32b(&mut packet,0);f64b(&mut packet,0.);f64b(&mut packet,0.1);u32b(&mut packet,0);f64b(&mut packet,0.11);f64b(&mut packet,0.);
   let mut session=vec![];for v in [0x31534d50,1,packet.len() as u32]{u32b(&mut session,v);}session.extend(packet);
   last_session=session.clone();host.check(unsafe{premidi_audio_play(host.0,session.as_ptr(),session.len(),0.5,0.,0,0)}).unwrap();
   std::thread::sleep(std::time::Duration::from_millis(30));let mut status=Status::default();host.check(unsafe{premidi_audio_status_get(host.0,&mut status)}).unwrap();assert!(status.callbacks>0&&status.peak_million>0);assert_eq!(status.fault,0);
  }
  let mut state=ControlState{host:Some(host),..Default::default()};
  let wav=render(&mut state,RenderRequest{data:last_session.clone(),cycle:0.5,rate:48000,frames:12000,wav:true,gain:0.85}).unwrap();
  assert_eq!(&wav[0..4],b"RIFF");assert_eq!(&wav[8..12],b"WAVE");assert_eq!(wav.len(),48044);assert!(wav[44..].iter().any(|v|*v!=0));
  assert_eq!(u32::from_le_bytes(wav[24..28].try_into().unwrap()),48000);
  last_session[16..20].copy_from_slice(&44100u32.to_le_bytes());
  let pcm=render(&mut state,RenderRequest{data:last_session,cycle:0.5,rate:44100,frames:11025,wav:false,gain:0.85}).unwrap();
  assert_eq!(pcm.len(),88200);assert!(pcm.iter().any(|v|*v!=0));
 }
 #[test]fn cancelled_or_old_audio_handles_cannot_start_or_stop_new_sessions(){
  let mut state=ControlState::default();state.begin().unwrap();state.begin().unwrap();state.current=2;
  handle(&mut state,Request::Control{command:1,looping:false,owner:Some(1)}).unwrap();
  assert!(!state.valid(1));assert!(state.valid(2));assert_eq!(state.current,2);
  handle(&mut state,Request::Shutdown).unwrap();assert!(!state.valid(2));
  state.begin().unwrap();assert!(state.valid(3));
 }
}
