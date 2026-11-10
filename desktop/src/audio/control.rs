use std::{ffi::{c_char,c_void,CStr},sync::{mpsc::{sync_channel,SyncSender},Arc,Mutex,atomic::{AtomicBool,Ordering}}};
use serde::{Deserialize,Serialize};
use std::collections::HashMap;
use serde_json::{json,Value};

#[repr(C)]
#[derive(Default)]
struct Status {
 callbacks:u64,frames:u64,total_ns:u64,max_ns:u64,deadline_misses:u64,oversized:u64,clipped:u64,peak_million:u64,
 position:u64,active:u64,state:u64,fault:u64,admitted:u64,stolen:u64,
 sample_rate:u32,hardware_rate:u32,period_frames:u32,period_count:u32,device_lost:u32,test_backend:u32,
 lead_remaining:u64,preview_position:u64,preview_state:u64,capture_phase:u64,capture_frames:u64,capture_missing:u64,capture_clipped:u64,capture_peak_million:u64,capture_lead:u64,capture_start:u64,
}
#[repr(C)]
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RoomParameters{mix:f64,#[serde(rename="preDelay")]pre_delay:f64,decay:f64,damping:f64,size:f64,width:f64}
#[repr(C)]
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SourceParameters{start:f64,duration:f64,time:f64,semitones:f64,formant:f64,preserve:u32,reverse:u32}
#[repr(C)]
#[derive(Default,Clone,Serialize)]
struct SampleInfo {id:u32,rate:u32,channels:u32,frames:u64,normalization:f64}
#[repr(C)]
#[derive(Default)]
struct StreamStatus {
 position:u64,ack_sequence:u64,ack_end_frame:u64,released_through:u64,
 state:u32,fault:u32,sample_rate:u32,active:u32,
}
unsafe extern "C" {
 #[cfg(test)]fn premidi_audio_add_sample(host:*mut c_void,pcm:*const f32,frames:u64,rate:u32,channels:u32,info:*mut SampleInfo)->i32;
 fn premidi_audio_process_source(host:*mut c_void,asset:u32,params:*const SourceParameters,info:*mut SampleInfo)->i32;
 fn premidi_audio_add_sample_rate(host:*mut c_void,pcm:*const f32,frames:u64,rate:u32,channels:u32,info:*mut SampleInfo,target_rate:u32)->i32;
 fn premidi_audio_create(test:i32)->*mut c_void;
 fn premidi_audio_destroy(host:*mut c_void);
 fn premidi_audio_error(host:*mut c_void)->*const c_char;
 fn premidi_audio_devices(host:*mut c_void)->i32;
 fn premidi_audio_device_name(host:*mut c_void,index:u32)->*const c_char;
 fn premidi_audio_backend(host:*mut c_void)->*const c_char;
 fn premidi_audio_configure(host:*mut c_void,device:u32,rate:u32,frames:u32)->i32;
 #[cfg(test)]fn premidi_audio_play(host:*mut c_void,data:*const u8,length:usize,cycle:f64,seek:f64,looping:i32,preview:i32)->i32;
 fn premidi_audio_play_take(host:*mut c_void,data:*const u8,length:usize,cycle:f64,seek:f64,looping:i32,preview:i32,bpm:f64,count_bars:u32,record:i32)->i32;
 fn premidi_audio_capture_prepare(host:*mut c_void,seconds:f64,offset_ms:f64,synchronized:i32)->i32;
 fn premidi_audio_capture_start(host:*mut c_void,lead_seconds:f64)->i32;
 fn premidi_audio_capture_finish(host:*mut c_void,cancel:i32)->i32;
 fn premidi_audio_capture_size(host:*mut c_void)->u64;
 fn premidi_audio_capture_copy(host:*mut c_void,output:*mut f32,frames:u64)->i32;
 fn premidi_audio_preview_control(host:*mut c_void,command:u32)->i32;
 fn premidi_audio_resample(input:*const f32,frames:u64,rate:u32,channels:u32,target_rate:u32,output:*mut f32,output_frames:u64,output_channels:u32)->i32;
 fn premidi_audio_update(host:*mut c_void,data:*const u8,length:usize,cycle:f64,looping:i32,tempo_ratio:f64)->i32;
 fn premidi_audio_render(host:*mut c_void,data:*const u8,length:usize,cycle:f64,rate:u32,frames:u64,output:*mut u8,output_bytes:usize,format:u32,gain:f64)->i32;
 fn premidi_audio_request_transport_stop(host:*mut c_void);
 fn premidi_audio_claim_transport(host:*mut c_void,owner:u64);
 fn premidi_audio_request_transport_state(host:*mut c_void,command:u32);
 fn premidi_audio_control(host:*mut c_void,command:u32,looping:i32)->i32;
 fn premidi_audio_status_get(host:*mut c_void,status:*mut Status)->i32;
 fn premidi_audio_stream_begin(host:*mut c_void,owner:u64,revision:u64,processing:i32)->i32;
 fn premidi_audio_stream_effects(host:*mut c_void,owner:u64,revision:u64,mix:f64,time:f64,feedback:f64,tone:f64,ping:i32,room:*const RoomParameters)->i32;
 fn premidi_audio_stream_page(host:*mut c_void,owner:u64,revision:u64,sequence:u64,first_frame:u64,end_frame:u64,onsets:u32,last:i32,packet:*const u8,length:usize)->i32;
 fn premidi_audio_stream_advance(host:*mut c_void,owner:u64,revision:u64,frame:u64)->i32;
 fn premidi_audio_stream_start_take(host:*mut c_void,owner:u64,revision:u64,bpm:f64,bars:u32,recording:i32,seconds:f64,due:u64,hold:i32)->i32;
 fn premidi_audio_stream_stop(host:*mut c_void,owner:u64,revision:u64)->i32;
 fn premidi_audio_stream_status_get(host:*mut c_void,status:*mut StreamStatus)->i32;
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
 fn stream_status(&self)->Result<Value,String>{
  let mut s=StreamStatus::default();
  self.check(unsafe{premidi_audio_stream_status_get(self.0,&mut s)})?;
  Ok(json!({"state":s.state,"fault":s.fault,"sampleRate":s.sample_rate,
   "positionSeconds":if s.sample_rate>0{s.position as f64/s.sample_rate as f64}else{0.0},
   "positionFrame":s.position,"ackSequence":s.ack_sequence,
   "ackEndFrame":s.ack_end_frame,"releasedThrough":s.released_through,
   "activeVoices":s.active}))
 }
 fn status(&self)->Result<Value,String>{
  let mut s=Status::default();self.check(unsafe{premidi_audio_status_get(self.0,&mut s)})?;
  let backend=unsafe{CStr::from_ptr(premidi_audio_backend(self.0))}.to_string_lossy();
  let cpu=if s.frames>0&&s.sample_rate>0{s.total_ns as f64*s.sample_rate as f64/(s.frames as f64*10_000_000.)}else{0.};
  Ok(json!({"backend":backend,"testBackend":s.test_backend!=0,"sampleRate":s.sample_rate,"hardwareRate":s.hardware_rate,"periodFrames":s.period_frames,"periods":s.period_count,
   "state":s.state,"positionSeconds":if s.sample_rate>0{s.position as f64/s.sample_rate as f64}else{0.},"active":s.active,"fault":s.fault,"deviceLost":s.device_lost!=0,
   "callbacks":s.callbacks,"frames":s.frames,"renderCpuPercent":cpu,"maxCallbackMs":s.max_ns as f64/1_000_000.,"deadlineMisses":s.deadline_misses,"oversizedCallbacks":s.oversized,
   "peak":s.peak_million as f64/1_000_000.,"clippedSamples":s.clipped,"deviceUnderruns":Value::Null,"measuredLatencyMs":Value::Null,
   "countInFrames":s.lead_remaining,"previewState":s.preview_state,"previewSeconds":if s.sample_rate>0{s.preview_position as f64/s.sample_rate as f64}else{0.},
   "capture":{"phase":s.capture_phase,"frames":s.capture_frames,"missingFrames":s.capture_missing,"clippedSamples":s.capture_clipped,"peak":s.capture_peak_million as f64/1_000_000.,"leadFrames":s.capture_lead,"startFrame":s.capture_start},
   "stream":self.stream_status()?}))
 }
}
type Reply=SyncSender<Result<Value,String>>;
type BytesReply=SyncSender<Result<Vec<u8>,String>>;
enum Work{
 Json(Request,Reply),Render(RenderRequest,BytesReply),FinishCapture(u64,BytesReply),Decode(DecodeRequest,BytesReply),
 #[cfg(test)] TestInitialize(Reply),
 #[cfg(test)] TestHold(SyncSender<()>,std::sync::mpsc::Receiver<()>),
}
#[derive(Default)]
struct TransportControl{pointer:usize,owner:u64,issued:u64,cancelled:u64}
impl TransportControl{
 fn request(&mut self,command:u32,owner:Option<u64>)->Result<Value,String>{
  if owner.is_some_and(|value|value>self.issued){return Err("Unknown native session".into());}
  if command==1||command==4{self.cancelled=self.cancelled.max(owner.unwrap_or(self.issued));}
  let accepted=self.pointer!=0&&owner.is_none_or(|value|value==self.owner)&&
   ((command==1||command==4)||self.owner>self.cancelled);
  if accepted{unsafe{
   if command==1||command==4{premidi_audio_request_transport_stop(self.pointer as *mut c_void);}
   else{premidi_audio_request_transport_state(self.pointer as *mut c_void,command);}
  }}
  Ok(json!({"owner":self.owner,"accepted":accepted}))
 }
}
pub struct Audio{sender:SyncSender<Work>,closing:Arc<AtomicBool>,transport:Arc<Mutex<TransportControl>>}
impl Default for Audio{
 fn default()->Self{
  let (sender,receiver)=sync_channel::<Work>(8);
  let closing=Arc::new(AtomicBool::new(false));let worker_closing=closing.clone();
  // Share only atomic intent entrypoints, not the COM-affine DeviceHost worker.
  let transport=Arc::new(Mutex::new(TransportControl::default()));let worker_transport=transport.clone();
  std::thread::Builder::new().name("pre-midi audio control".into()).spawn(move||{
   let mut host=ControlState{transport:worker_transport.clone(),..Default::default()};
   while let Ok(work)=receiver.recv(){match work{
    Work::Json(request,reply)=>{
     let shutdown=matches!(&request,Request::Shutdown);
     // Prevent a concurrent mute from borrowing Host during its destruction.
     if shutdown{worker_transport.lock().unwrap().pointer=0;}
     let result=if worker_closing.load(Ordering::SeqCst)&&!shutdown{Err("pre-midi is closing".into())}else{handle(&mut host,request)};
     let _=reply.send(result);
    },
    Work::Render(request,reply)=>{let result=if worker_closing.load(Ordering::SeqCst){Err("pre-midi is closing".into())}else{render(&mut host,request)};let _=reply.send(result);},
    Work::FinishCapture(owner,reply)=>{let _=reply.send(finish_capture(&mut host,owner));},
    Work::Decode(request,reply)=>{let result=if worker_closing.load(Ordering::SeqCst){Err("pre-midi is closing".into())}else{decode_audio(request)};let _=reply.send(result);},
    #[cfg(test)] Work::TestInitialize(reply)=>{
     let pointer=unsafe{premidi_audio_create(1)};assert!(!pointer.is_null());
     host.host=Some(Host(pointer));worker_transport.lock().unwrap().pointer=pointer as usize;
     let _=reply.send(Ok(json!({})));
    },
    #[cfg(test)] Work::TestHold(entered,release)=>{let _=entered.send(());let _=release.recv();},
   }
   }
  }).expect("Could not create audio control thread");
  Self{sender,closing,transport}
 }
}
impl Audio{
 fn mute_transport_now(&self){
  let _=self.transport.lock().unwrap().request(1,None);
 }
 pub(super) fn reopen(&self){self.closing.store(false,Ordering::SeqCst);}
 pub(super) fn call(&self,request:Request)->Result<Value,String>{
  if self.closing.load(Ordering::SeqCst){return Err("pre-midi is closing".into());}
  let urgent=matches!(&request,Request::Control{command:1..=4,..});
  if let Request::Control{command:command @ 1..=4,owner,..}=&request{
   let result=self.transport.lock().unwrap().request(*command,*owner)?;
   // Pause/resume acknowledge intent without entering the decode/render queue.
   // Stop also queues resource retirement; its audio latch is already set.
   if *command==2||*command==3{return Ok(result);}
  }
  let (reply,result)=sync_channel(1);
  // Never drop Stop on a full queue; the callback is already muted before waiting.
  if urgent{
   self.sender.send(Work::Json(request,reply)).map_err(|_|"Native audio control thread stopped".to_string())?;
  }else{
   self.sender.try_send(Work::Json(request,reply)).map_err(|_|"Native audio control is busy; retry the operation".to_string())?;
  }
  result.recv().map_err(|_|"Native audio control thread stopped".to_string())?
 }
 pub(super) fn close(&self){
  self.closing.store(true,Ordering::SeqCst);
  self.mute_transport_now();
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
 pub(super) fn finish_capture(&self,owner:u64)->Result<Vec<u8>,String>{let(reply,result)=sync_channel(1);self.sender.try_send(Work::FinishCapture(owner,reply)).map_err(|_|"Native audio control is busy".to_string())?;result.recv().map_err(|_|"Native audio control thread stopped".to_string())?}
 pub(super) fn decode(&self,request:DecodeRequest)->Result<Vec<u8>,String>{if self.closing.load(Ordering::SeqCst){return Err("pre-midi is closing".into());}let(reply,result)=sync_channel(1);self.sender.try_send(Work::Decode(request,reply)).map_err(|_|"Native audio control is busy".to_string())?;result.recv().map_err(|_|"Native audio control thread stopped".to_string())?}
}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
pub struct DecodeRequest{data:Vec<u8>,rate:u32,mono:bool,max_seconds:f64}
fn decode_audio(request:DecodeRequest)->Result<Vec<u8>,String>{
 let DecodeRequest{data,rate,mono,max_seconds}=request;
 if data.len()>48_000_000||!(8000..=192000).contains(&rate)||!max_seconds.is_finite()||max_seconds<=0.0||max_seconds>301.0{return Err("Invalid native audio conversion dimensions".into());}
 let audio=std::panic::catch_unwind(||premidi_decoder::decode(data,"")).map_err(|_|"Native audio decoder rejected malformed media".to_string())??;
 let frames=(audio.samples.len()/audio.channels as usize) as u64;if frames as f64/audio.rate as f64>max_seconds{return Err(format!("Choose audio up to {max_seconds} seconds long"));}
 let count=(frames as f64*rate as f64/audio.rate as f64).ceil() as u64;let channels=if mono{1}else{audio.channels};if count*channels as u64>128_000_000{return Err("Native decoded output exceeds 512 MB".into());}
 let mut pcm=vec![0f32;(count*channels as u64) as usize];if unsafe{premidi_audio_resample(audio.samples.as_ptr(),frames,audio.rate,audio.channels,rate,pcm.as_mut_ptr(),count,channels)}<0{return Err("Native PCM rate conversion failed".into());}
 let mut out=Vec::with_capacity(16+pcm.len()*4);out.extend(rate.to_le_bytes());out.extend(channels.to_le_bytes());out.extend((count as u32).to_le_bytes());out.extend(0u32.to_le_bytes());for sample in pcm{out.extend(sample.to_le_bytes());}Ok(out)
}
fn wav_header(bytes:&mut [u8],rate:u32,channels:u16){
 let size=(bytes.len()-44) as u32;bytes[0..4].copy_from_slice(b"RIFF");bytes[4..8].copy_from_slice(&(size+36).to_le_bytes());bytes[8..16].copy_from_slice(b"WAVEfmt ");bytes[16..20].copy_from_slice(&16u32.to_le_bytes());bytes[20..22].copy_from_slice(&1u16.to_le_bytes());bytes[22..24].copy_from_slice(&channels.to_le_bytes());bytes[24..28].copy_from_slice(&rate.to_le_bytes());bytes[28..32].copy_from_slice(&(rate*channels as u32*2).to_le_bytes());bytes[32..34].copy_from_slice(&(channels*2).to_le_bytes());bytes[34..36].copy_from_slice(&16u16.to_le_bytes());bytes[36..40].copy_from_slice(b"data");bytes[40..44].copy_from_slice(&size.to_le_bytes());
}
fn finish_capture(state:&mut ControlState,owner:u64)->Result<Vec<u8>,String>{
 if owner==0||owner!=state.capture_current{return Err("Native microphone take was cancelled".into());}
 let host=state.host.as_ref().ok_or("Native microphone is closed")?;host.check(unsafe{premidi_audio_capture_finish(host.0,0)})?;state.capture_current=0;
 let mut status=Status::default();host.check(unsafe{premidi_audio_status_get(host.0,&mut status)})?;
 let frames=unsafe{premidi_audio_capture_size(host.0)};if status.sample_rate<8000||frames>status.sample_rate as u64*301{return Err("Native microphone capture exceeded its bound".into());}
 let mut pcm=vec![0f32;frames as usize];host.check(unsafe{premidi_audio_capture_copy(host.0,pcm.as_mut_ptr(),frames)})?;
 if status.capture_missing>0{return Err(format!("Native microphone input was missing for {} frames",status.capture_missing));}
 let rate=status.sample_rate.min(48000);if rate!=status.sample_rate&&frames>0{let count=(frames as f64*rate as f64/status.sample_rate as f64).ceil() as u64;let mut converted=vec![0f32;count as usize];
  if unsafe{premidi_audio_resample(pcm.as_ptr(),frames,status.sample_rate,1,rate,converted.as_mut_ptr(),count,1)}<0{return Err("Native microphone rate conversion failed".into());}pcm=converted;
 }
 let mut out=vec![0u8;44+pcm.len()*2];wav_header(&mut out,rate,1);for(i,value)in pcm.iter().enumerate(){let n=value.clamp(-1.0,1.0);let sample=(n*if n<0.0{32768.0}else{32767.0}).round() as i16;out[44+i*2..46+i*2].copy_from_slice(&sample.to_le_bytes());}Ok(out)
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
 if wav{wav_header(&mut bytes,rate,2);}

 Ok(bytes)
}
#[derive(Deserialize)]
#[serde(tag="action",rename_all="snake_case",deny_unknown_fields)]
pub enum Request {
 Devices,Status,Begin,
 Source{asset:u32,params:SourceParameters},
 Asset{data:Vec<u8>,#[serde(default)] rate:Option<u32>},
 Configure{device:Option<u32>,rate:u32,buffer:u32},
 Play{data:Vec<u8>,cycle:f64,seek:f64,looping:bool,preview:bool,#[serde(default)] owner:u64,#[serde(default)] count_in:u32,#[serde(default="default_bpm")] bpm:f64,#[serde(default)] recording:Option<u64>},
 Update{data:Vec<u8>,cycle:f64,looping:bool,tempo_ratio:f64,owner:u64},
 StreamBegin{owner:u64,revision:u64,#[serde(default)] processing:bool,#[serde(default)] post_delay:bool},
 StreamEffects{owner:u64,revision:u64,mix:f64,time:f64,feedback:f64,tone:f64,ping:bool,#[serde(default)]reverb:Option<RoomParameters>},
 StreamPage{owner:u64,revision:u64,sequence:u64,start_frame:u64,end_frame:u64,onsets:u32,last:bool,data:Vec<u8>},
 StreamAdvance{owner:u64,revision:u64,frame:u64},
 StreamStart{owner:u64,revision:u64,#[serde(default="default_bpm")] bpm:f64,#[serde(default)] count_in:u32,#[serde(default)] recording:Option<u64>,#[serde(default="default_take_seconds")] seconds:f64,#[serde(default)] due:Option<u64>,#[serde(default)] hold:bool},
 StreamStop{owner:u64,revision:u64},
 StreamStatus{owner:u64,revision:u64},
 Control{command:u32,looping:bool,#[serde(default)] owner:Option<u64>},
 PreviewControl{command:u32,owner:u64},
 CapturePrepare{seconds:f64,offset_ms:f64,synchronized:bool},
 CaptureStart{owner:u64,lead_seconds:f64},CaptureCancel{owner:u64},
 Shutdown,
}
fn default_take_seconds()->f64{300.0}
fn default_bpm()->f64{120.0}
#[derive(Default)]
struct ControlState{host:Option<Host>,transport:Arc<Mutex<TransportControl>>,issued:u64,cancelled:u64,current:u64,stream_revision:u64,stream_previous_revision:u64,preview_current:u64,capture_issued:u64,capture_current:u64,generation:u64,assets:HashMap<(u32,Vec<u8>),SampleInfo>}
impl ControlState{
 fn begin(&mut self)->Result<Value,String>{
  // IDs cross JavaScript and occupy the upper bits of the native intent word.
  if self.issued>=9_007_199_254_740_991{return Err("Audio session ID exhausted".into());}
  self.issued+=1;self.transport.lock().unwrap().issued=self.issued;Ok(json!({"owner":self.issued}))
 }
 fn valid(&self,owner:u64)->bool{owner>self.cancelled&&owner>self.transport.lock().unwrap().cancelled&&owner<=self.issued&&owner>=self.current}
 fn claim_transport(&self,owner:u64)->Result<(),String>{
  let mut transport=self.transport.lock().unwrap();
  if owner<=transport.cancelled{return Err("Native playback request cancelled".into());}
  let host=self.host.as_ref().unwrap();transport.pointer=host.0 as usize;transport.owner=owner;
  unsafe{premidi_audio_claim_transport(host.0,owner);}
  Ok(())
 }
 fn status(&self)->Result<Value,String>{
  let mut value=if let Some(host)=&self.host{host.status()?}else{json!({"state":0,"sampleRate":0,"deviceLost":false})};
  value["owner"]=json!(self.current);value["previewOwner"]=json!(self.preview_current);value["captureOwner"]=json!(self.capture_current);value["generation"]=json!(self.generation);Ok(value)
 }
}
fn handle(state:&mut ControlState,request:Request)->Result<Value,String>{
 if matches!(&request,Request::Begin){return state.begin();}
 if matches!(&request,Request::Shutdown){let mut transport=state.transport.lock().unwrap();transport.pointer=0;transport.owner=0;transport.cancelled=state.issued;drop(transport);state.cancelled=state.issued;state.current=0;state.stream_revision=0;state.preview_current=0;state.capture_current=0;state.assets.clear();state.host.take();return Ok(json!({"closed":true}));}
 if let Request::Control{command:1|4,owner,..}=&request{
  let cancelled=owner.unwrap_or(state.issued);if cancelled>state.issued{return Err("Unknown native session".into());}state.cancelled=state.cancelled.max(cancelled);
  let mut transport=state.transport.lock().unwrap();transport.cancelled=transport.cancelled.max(cancelled);
 }
 if let Request::Play{owner,preview:false,..}=&request{if !state.valid(*owner){return Err("Native playback request cancelled".into());}}
 if let Request::Play{owner,preview:true,..}=&request{if *owner==0||*owner<=state.cancelled||*owner>state.issued||*owner<state.preview_current{return Err("Native preview request cancelled".into());}}
 if let Request::Play{recording:Some(owner),..}=&request{if *owner==0||*owner!=state.capture_current{return Err("Native microphone take was cancelled".into());}}
 if let Request::Update{owner,..}=&request{if *owner!=state.current||!state.valid(*owner){return Err("Native edit request cancelled".into());}}
 if let Request::StreamBegin{owner,revision,..}=&request{
  if !state.valid(*owner)||*revision==0{return Err("Native Song stream begin was cancelled".into());}
 }
 match &request{
  Request::StreamEffects{owner,revision,..}|Request::StreamPage{owner,revision,..}|
  Request::StreamStart{owner,revision,..}|Request::StreamAdvance{owner,revision,..}|Request::StreamStop{owner,revision}|
  Request::StreamStatus{owner,revision}
   if *owner!=state.current||*revision==0||(*revision!=state.stream_revision&&*revision!=state.stream_previous_revision)=>
    return Err("Native Song page owner or revision is stale".into()),
  _=>{}
 }
 if matches!(&request,Request::Control{..}|Request::Status)&&state.host.is_none(){return state.status();}
 if state.host.is_none(){state.generation+=1;state.host=Some(Host::new()?);}
 state.transport.lock().unwrap().pointer=state.host.as_ref().unwrap().0 as usize;
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
  Request::Source{asset,params}=>{
   let host=state.host.as_ref().unwrap();let mut info=SampleInfo::default();host.check(unsafe{premidi_audio_process_source(host.0,asset,&params,&mut info)})?;Ok(serde_json::to_value(info).unwrap())
  },
  Request::Status=>state.status(),
  Request::Configure{device,rate,buffer}=>{state.assets.clear();state.generation+=1;state.cancelled=state.issued;state.current=0;state.stream_revision=0;state.preview_current=0;state.capture_current=0;let host=state.host.as_ref().unwrap();host.check(unsafe{premidi_audio_configure(host.0,device.unwrap_or(u32::MAX),rate,buffer)})?;state.status()},
  Request::Play{data,cycle,seek,looping,preview,owner,count_in,bpm,recording}=>{
   if data.len()>16*1024*1024{return Err("Native session exceeds 16 MiB".into());}
   if !preview{state.claim_transport(owner)?;}
   let host=state.host.as_ref().unwrap();host.check(unsafe{premidi_audio_play_take(host.0,data.as_ptr(),data.len(),cycle,seek,i32::from(looping),i32::from(preview),bpm,count_in,i32::from(recording.is_some()))})?;
   if preview{state.preview_current=owner;}else{state.current=owner;state.stream_revision=0;}state.status()
  },
  Request::StreamBegin{owner,revision,processing,post_delay}=>{
   state.claim_transport(owner)?;
   let host=state.host.as_ref().unwrap();
   host.check(unsafe{premidi_audio_stream_begin(host.0,owner,revision,i32::from(processing)|(i32::from(post_delay)<<1))})?;
   state.current=owner;state.stream_previous_revision=state.stream_revision;state.stream_revision=revision;state.status()
  },
  Request::StreamEffects{owner,revision,mix,time,feedback,tone,ping,reverb}=>{
   let host=state.host.as_ref().unwrap();
   host.check(unsafe{premidi_audio_stream_effects(host.0,owner,revision,mix,time,feedback,tone,i32::from(ping),reverb.as_ref().map_or(std::ptr::null(),|v|v as *const RoomParameters))})?;
   host.stream_status()
  },
  Request::StreamPage{owner,revision,sequence,start_frame,end_frame,onsets,last,data}=>{
   if data.len()<8||data.len()>16*1024*1024{return Err("Native Song page is outside 16 MiB".into());}
   let host=state.host.as_ref().unwrap();
   let value=unsafe{premidi_audio_stream_page(host.0,owner,revision,sequence,start_frame,end_frame,onsets,i32::from(last),data.as_ptr(),data.len())};
   host.check(value)?;
   Ok(json!({"accepted":value==0,"stream":host.stream_status()?}))
  },
  Request::StreamAdvance{owner,revision,frame}=>{
   let host=state.host.as_ref().unwrap();host.check(unsafe{premidi_audio_stream_advance(host.0,owner,revision,frame)})?;state.status()
  },
  Request::StreamStart{owner,revision,bpm,count_in,recording,seconds,due,hold}=>{
   if !bpm.is_finite()||!(40.0..=240.0).contains(&bpm)||count_in>2||!seconds.is_finite()||seconds<=0.0{return Err("Invalid streamed Song take timing".into());}
   if recording.is_some_and(|value|value==0||value!=state.capture_current){return Err("Native microphone take was cancelled".into());}
   let host=state.host.as_ref().unwrap();
   host.check(unsafe{premidi_audio_stream_start_take(host.0,owner,revision,bpm,count_in,i32::from(recording.is_some()),seconds,due.unwrap_or(u64::MAX),i32::from(hold))})?;
   state.stream_previous_revision=0;state.status()
  },
  Request::StreamStop{owner,revision}=>{
   let host=state.host.as_ref().unwrap();
   host.check(unsafe{premidi_audio_stream_stop(host.0,owner,revision)})?;
   state.stream_revision=if revision==state.stream_previous_revision{0}else{state.stream_previous_revision};state.stream_previous_revision=0;state.status()
  },
  Request::StreamStatus{..}=>state.status(),
  Request::Control{command,looping,owner}=>{
   if owner.is_some_and(|value|value!=state.current){return state.status();}
   let host=state.host.as_ref().unwrap();host.check(unsafe{premidi_audio_control(host.0,command,i32::from(looping))})?;
   if command==1||command==4{state.stream_revision=0;state.stream_previous_revision=0;}
   state.status()
  },
  Request::Update{data,cycle,looping,tempo_ratio,..}=>{
   if data.len()>16*1024*1024{return Err("Native session exceeds 16 MiB".into());}
   let host=state.host.as_ref().unwrap();host.check(unsafe{premidi_audio_update(host.0,data.as_ptr(),data.len(),cycle,i32::from(looping),tempo_ratio)})?;state.status()
  },
  Request::PreviewControl{command,owner}=>{if owner!=state.preview_current{return state.status();}let host=state.host.as_ref().unwrap();host.check(unsafe{premidi_audio_preview_control(host.0,command)})?;state.status()},
  Request::CapturePrepare{seconds,offset_ms,synchronized}=>{
   let host=state.host.as_ref().unwrap();host.check(unsafe{premidi_audio_capture_prepare(host.0,seconds,offset_ms,i32::from(synchronized))})?;
   state.capture_issued=state.capture_issued.checked_add(1).ok_or("Microphone session ID exhausted")?;state.capture_current=state.capture_issued;state.status()
  },
  Request::CaptureStart{owner,lead_seconds}=>{if owner==0||owner!=state.capture_current{return Err("Native microphone take was cancelled".into());}let host=state.host.as_ref().unwrap();host.check(unsafe{premidi_audio_capture_start(host.0,lead_seconds)})?;state.status()},
  Request::CaptureCancel{owner}=>{if owner!=state.capture_current{return state.status();}let host=state.host.as_ref().unwrap();host.check(unsafe{premidi_audio_capture_finish(host.0,1)})?;state.capture_current=0;state.status()},
  Request::Shutdown|Request::Begin=>unreachable!(),
 }
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn native_capture_uses_owned_pcm_and_safe_duplex_lifecycle(){
  for rate in [44100,48000,96000]{
   let pointer=unsafe{premidi_audio_create(1)};assert!(!pointer.is_null());let host=Host(pointer);
   host.check(unsafe{premidi_audio_configure(host.0,u32::MAX,rate,128)}).unwrap();let mut state=ControlState{host:Some(host),..Default::default()};
   let prepared=handle(&mut state,Request::CapturePrepare{seconds:0.1,offset_ms:3.0,synchronized:false}).unwrap();let owner=prepared["captureOwner"].as_u64().unwrap();
   handle(&mut state,Request::CaptureStart{owner,lead_seconds:0.01}).unwrap();
   for _ in 0..200{if state.status().unwrap()["capture"]["phase"]==3{break;}std::thread::sleep(std::time::Duration::from_millis(5));}
   let wav=finish_capture(&mut state,owner).unwrap();let output_rate=rate.min(48000);
   assert_eq!(&wav[..4],b"RIFF");assert_eq!(u32::from_le_bytes(wav[24..28].try_into().unwrap()),output_rate);assert_eq!(wav.len(),44+(output_rate/10) as usize*2);
   assert!(finish_capture(&mut state,owner).is_err());
   let next=handle(&mut state,Request::CapturePrepare{seconds:0.1,offset_ms:0.0,synchronized:true}).unwrap()["captureOwner"].as_u64().unwrap();
   handle(&mut state,Request::CaptureCancel{owner}).unwrap();assert_eq!(state.capture_current,next);
   let transport=handle(&mut state,Request::Begin).unwrap()["owner"].as_u64().unwrap();let data=[0x31534d50u32.to_le_bytes(),0u32.to_le_bytes()].concat();
   handle(&mut state,Request::Play{data,cycle:0.1,seek:0.0,looping:false,preview:false,owner:transport,count_in:1,bpm:400.0,recording:Some(next)}).unwrap();
   assert!(state.status().unwrap()["countInFrames"].as_u64().unwrap()>0);
   for _ in 0..300{if state.status().unwrap()["capture"]["phase"]==3{break;}std::thread::sleep(std::time::Duration::from_millis(5));}
   let take=finish_capture(&mut state,next).unwrap();assert_eq!(take.len(),44+(output_rate/10) as usize*2);
  }
 }
 #[test]fn native_conversion_resamples_original_codec_without_an_output_device(){
  let decoded=decode_audio(DecodeRequest{data:include_bytes!("../../../native/decoder/tests/fixtures/tone.wav").to_vec(),rate:44100,mono:true,max_seconds:1.0}).unwrap();
  assert_eq!(decoded.len(),16+4410*4);assert_eq!(u32::from_le_bytes(decoded[..4].try_into().unwrap()),44100);assert!(decoded[16..].chunks_exact(4).any(|v|f32::from_le_bytes(v.try_into().unwrap()).abs()>0.01));
 }
 #[test]fn worker_queue_cancels_and_reopens_without_a_device(){
  let worker=Audio::default();assert_eq!(worker.call(Request::Begin).unwrap()["owner"],1);
  assert!(worker.render(RenderRequest{data:vec![],cycle:1.0,rate:0,frames:0,wav:true,gain:0.85}).is_err());
  worker.close();assert!(worker.call(Request::Begin).is_err());worker.reopen();assert_eq!(worker.call(Request::Begin).unwrap()["owner"],2);worker.close();
 }
 #[test]fn urgent_transport_intent_bypasses_a_full_preparation_queue(){
  use std::time::{Duration,Instant};
  let worker=Arc::new(Audio::default());
  let (reply,result)=sync_channel(1);worker.sender.send(Work::TestInitialize(reply)).unwrap();result.recv().unwrap().unwrap();
  worker.call(Request::Configure{device:None,rate:48000,buffer:128}).unwrap();
  let owner=worker.call(Request::Begin).unwrap()["owner"].as_u64().unwrap();
  let packet=[0x31534d50u32.to_le_bytes(),0u32.to_le_bytes()].concat();
  let play=||Request::Play{data:packet.clone(),cycle:10.,seek:0.,looping:true,preview:false,owner,count_in:0,bpm:120.,recording:None};
  worker.call(play()).unwrap();
  let (entered,entry)=sync_channel(1);let (release,held)=sync_channel(1);
  worker.sender.send(Work::TestHold(entered,held)).unwrap();entry.recv().unwrap();
  // A queued replacement plus seven status requests fill the real production
  // mailbox. Simulate a decode/render which cannot finish until we release it.
  let (reply,cancelled_play)=sync_channel(1);worker.sender.send(Work::Json(play(),reply)).unwrap();
  for _ in 0..7{let (reply,_)=sync_channel(1);worker.sender.send(Work::Json(Request::Status,reply)).unwrap();}
  let pointer=worker.transport.lock().unwrap().pointer as *mut c_void;
  let status=||{let mut value=Status::default();assert_eq!(unsafe{premidi_audio_status_get(pointer,&mut value)},0);value};
  let wait_for=|wanted:u64|{
   let deadline=Instant::now()+Duration::from_millis(500);
   while status().state!=wanted{assert!(Instant::now()<deadline,"urgent intent waited for the blocked worker");std::thread::sleep(Duration::from_millis(2));}
  };
  assert_eq!(worker.call(Request::Control{command:2,looping:true,owner:Some(owner)}).unwrap()["accepted"],true);
  wait_for(2);let position=status().position;std::thread::sleep(Duration::from_millis(20));assert_eq!(status().position,position);
  // Resume can arrive during the pause fade, before its state becomes paused.
  worker.call(Request::Control{command:3,looping:true,owner:Some(owner)}).unwrap();wait_for(1);
  for command in [2,3,2,3]{worker.call(Request::Control{command,looping:true,owner:Some(owner)}).unwrap();}
  std::thread::sleep(Duration::from_millis(25));assert_eq!(status().state,1);assert!(status().position>position);
  let stopping=worker.clone();let stop=std::thread::spawn(move||stopping.call(Request::Control{command:1,looping:false,owner:Some(owner)}));
  wait_for(0); // Stop mutes even while its retirement command waits for space.
  release.send(()).unwrap();assert!(cancelled_play.recv().unwrap().is_err());stop.join().unwrap().unwrap();
  assert_eq!(worker.call(Request::Status).unwrap()["state"],0);
  let next=worker.call(Request::Begin).unwrap()["owner"].as_u64().unwrap();
  worker.call(Request::Play{data:packet.clone(),cycle:10.,seek:0.,looping:true,preview:false,owner:next,count_in:0,bpm:120.,recording:None}).unwrap();
  assert_eq!(worker.call(Request::Control{command:2,looping:true,owner:Some(owner)}).unwrap()["accepted"],false);
  worker.call(Request::Control{command:1,looping:false,owner:Some(owner)}).unwrap();
  assert_eq!(worker.call(Request::Status).unwrap()["state"],1);
  worker.call(Request::Control{command:2,looping:true,owner:Some(next)}).unwrap();wait_for(2);
  worker.call(Request::Play{data:packet,cycle:10.,seek:2.,looping:true,preview:false,owner:next,count_in:0,bpm:120.,recording:None}).unwrap();
  assert_eq!(status().state,2);assert_eq!(status().position,96000);
  std::thread::sleep(Duration::from_millis(20));assert_eq!(status().position,96000);
  worker.close();
 }
 #[test]fn native_codecs_own_and_play_every_studio_container(){
  let fixtures:&[&[u8]]=&[include_bytes!("../../../native/decoder/tests/fixtures/tone.wav"),include_bytes!("../../../native/decoder/tests/fixtures/tone.mp3"),include_bytes!("../../../native/decoder/tests/fixtures/vorbis.ogg"),include_bytes!("../../../native/decoder/tests/fixtures/opus.ogg"),include_bytes!("../../../native/decoder/tests/fixtures/tone.webm"),include_bytes!("../../../native/decoder/tests/fixtures/tone.mp4")];
  let pointer=unsafe{premidi_audio_create(1)};assert!(!pointer.is_null());let host=Host(pointer);
  host.check(unsafe{premidi_audio_configure(host.0,u32::MAX,48000,128)}).unwrap();let mut last_session=vec![];
  for bytes in fixtures {
   let audio=premidi_decoder::decode(bytes.to_vec(),"").unwrap();let mut info=SampleInfo::default();
   host.check(unsafe{premidi_audio_add_sample(host.0,audio.samples.as_ptr(),(audio.samples.len()/audio.channels as usize) as u64,audio.rate,audio.channels,&mut info)}).unwrap();drop(audio);
   let mut packet=vec![];let u32b=|out:&mut Vec<u8>,v:u32|out.extend(v.to_le_bytes());let f64b=|out:&mut Vec<u8>,v:f64|out.extend(v.to_le_bytes());
   for v in [0x38564d50,48000,1,23,1,info.id]{u32b(&mut packet,v);}
   for v in [0.,0.1,0.11,0.11,0.1,0.,1.,0.,info.frames as f64/info.rate as f64,14000.,0.7,0.,5.,0.,0.,0.,5.,0.,0.24,0.26,0.,2.,14000.,0.1]{f64b(&mut packet,v);}
   for v in [0,1,0,2]{u32b(&mut packet,v);}
   u32b(&mut packet,0);f64b(&mut packet,0.);f64b(&mut packet,0.1);u32b(&mut packet,0);f64b(&mut packet,0.11);f64b(&mut packet,0.);
   f64b(&mut packet,60.);f64b(&mut packet,1.);u32b(&mut packet,0);u32b(&mut packet,0);u32b(&mut packet,0);
   f64b(&mut packet,1.);f64b(&mut packet,1.);f64b(&mut packet,1.);u32b(&mut packet,1);for _ in 0..8{for v in [1.,0.,0.,0.,0.]{f64b(&mut packet,v);}}
   f64b(&mut packet,1.);f64b(&mut packet,0.);f64b(&mut packet,20000.);u32b(&mut packet,0);u32b(&mut packet,0);u32b(&mut packet,0);u32b(&mut packet,0);
   for v in [0.,0.02,1.5,0.45,0.5,1.]{f64b(&mut packet,v);}
   u32b(&mut packet,0);for _ in 0..3{f64b(&mut packet,0.);}
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
 #[test]fn streamed_revisions_preserve_ownership_pause_and_synchronized_capture(){
  let pointer=unsafe{premidi_audio_create(1)};assert!(!pointer.is_null());let host=Host(pointer);
  host.check(unsafe{premidi_audio_configure(host.0,u32::MAX,48000,128)}).unwrap();
  let mut state=ControlState{host:Some(host),..Default::default()};
  let owner=handle(&mut state,Request::Begin).unwrap()["owner"].as_u64().unwrap();
  let empty=[0x31534d50u32.to_le_bytes(),0u32.to_le_bytes()].concat();
  let request=|state:&mut ControlState,value:Value|handle(state,serde_json::from_value(value).unwrap()).unwrap();
  request(&mut state,json!({"action":"stream_begin","owner":owner,"revision":1}));
  request(&mut state,json!({"action":"stream_effects","owner":owner,"revision":1,"mix":0.,"time":0.2,"feedback":0.,"tone":20000.,"ping":false,
   "reverb":{"mix":0.3,"preDelay":0.02,"decay":0.4,"damping":0.35,"size":0.7,"width":0.8}}));
  assert!(handle(&mut state,serde_json::from_value(json!({"action":"stream_effects","owner":owner,"revision":1,"mix":0.,"time":0.2,"feedback":0.,"tone":20000.,"ping":false,
   "reverb":{"mix":0.3,"preDelay":0.02,"decay":99.,"damping":0.35,"size":0.7,"width":0.8}})).unwrap()).is_err());
  request(&mut state,json!({"action":"stream_page","owner":owner,"revision":1,"sequence":1,"start_frame":0,"end_frame":48000,"onsets":0,"last":false,"data":empty}));
  request(&mut state,json!({"action":"stream_start","owner":owner,"revision":1,"hold":true}));
  request(&mut state,json!({"action":"stream_begin","owner":owner,"revision":2}));
  // The old revision may refill until the prepared edit is handed off.
  request(&mut state,json!({"action":"stream_page","owner":owner,"revision":1,"sequence":2,"start_frame":48000,"end_frame":96000,"onsets":0,"last":true,"data":empty}));
  request(&mut state,json!({"action":"stream_page","owner":owner,"revision":2,"sequence":1,"start_frame":0,"end_frame":48000,"onsets":0,"last":true,"data":empty}));
  request(&mut state,json!({"action":"stream_advance","owner":owner,"revision":2,"frame":4800}));
  request(&mut state,json!({"action":"stream_start","owner":owner,"revision":2,"hold":true,"due":0}));
  let status=state.status().unwrap();assert_eq!(status["stream"]["positionFrame"],4800);assert_eq!(status["stream"]["state"],2);
  assert!(handle(&mut state,Request::StreamStop{owner,revision:1}).is_err());
  let capture=handle(&mut state,Request::CapturePrepare{seconds:0.05,offset_ms:3.,synchronized:true}).unwrap()["captureOwner"].as_u64().unwrap();
  request(&mut state,json!({"action":"stream_begin","owner":owner,"revision":3}));
  request(&mut state,json!({"action":"stream_page","owner":owner,"revision":3,"sequence":1,"start_frame":0,"end_frame":48000,"onsets":0,"last":true,"data":empty}));
  request(&mut state,json!({"action":"stream_advance","owner":owner,"revision":3,"frame":2400}));
  request(&mut state,json!({"action":"stream_start","owner":owner,"revision":3,"bpm":240.,"count_in":1,"recording":capture,"seconds":0.05}));
  assert!(state.status().unwrap()["countInFrames"].as_u64().unwrap()>0);
  for _ in 0..400{if state.status().unwrap()["capture"]["phase"]==3{break;}std::thread::sleep(std::time::Duration::from_millis(5));}
  let take=finish_capture(&mut state,capture).unwrap();assert_eq!(take.len(),44+2400*2);
  request(&mut state,json!({"action":"control","command":1,"looping":false,"owner":owner}));
  assert!(handle(&mut state,Request::StreamStop{owner,revision:3}).is_err());
 }
 #[test]fn source_processing_prepares_owned_pcm_without_opening_an_output(){
  let host=Host(unsafe{premidi_audio_create(1)});assert!(!host.0.is_null());let mut state=ControlState{host:Some(host),..Default::default()};
  let original=handle(&mut state,Request::Asset{data:include_bytes!("../../../native/decoder/tests/fixtures/tone.wav").to_vec(),rate:Some(48000)}).unwrap();
  let frames=original["frames"].as_u64().unwrap();let id=original["id"].as_u64().unwrap() as u32;
  let processed=handle(&mut state,Request::Source{asset:id,params:SourceParameters{start:0.,duration:frames as f64/48000.,time:1.5,semitones:12.,formant:0.,preserve:1,reverse:0}}).unwrap();
  assert_eq!(processed["frames"].as_u64().unwrap(),(frames as f64*1.5).round() as u64);assert_ne!(processed["id"],original["id"]);assert_eq!(processed["rate"],48000);
  assert!(handle(&mut state,Request::Source{asset:id,params:SourceParameters{start:0.,duration:1.,time:0.,semitones:0.,formant:0.,preserve:1,reverse:0}}).is_err());
  assert_eq!(state.status().unwrap()["sampleRate"],0);
 }
 #[test]fn cancelled_or_old_audio_handles_cannot_start_or_stop_new_sessions(){
  let mut state=ControlState::default();state.begin().unwrap();state.begin().unwrap();state.current=2;
  handle(&mut state,Request::Control{command:1,looping:false,owner:Some(1)}).unwrap();
  assert!(!state.valid(1));assert!(state.valid(2));assert_eq!(state.current,2);
  handle(&mut state,Request::Shutdown).unwrap();assert!(!state.valid(2));
  state.begin().unwrap();assert!(state.valid(3));
 }
}
