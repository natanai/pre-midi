#ifndef NOMINMAX
#define NOMINMAX
#endif
#define MINIAUDIO_IMPLEMENTATION
#define MA_NO_DECODING
#define MA_NO_ENCODING
#define MA_NO_RESOURCE_MANAGER
#define MA_NO_NODE_GRAPH
#define MA_NO_ENGINE
#define MA_NO_GENERATION
#include "vendor/miniaudio/miniaudio.h"
#include "device-host.h"
#include "session.hpp"
#include "capture.hpp"
#include <chrono>
#include <thread>
#include <string>
#include <limits>
#ifdef PREMIDI_AUDIO_TEST
extern "C" void premidi_test_callback_guard(int enabled);
struct CallbackProbe {CallbackProbe(){premidi_test_callback_guard(1);}~CallbackProbe(){premidi_test_callback_guard(0);}};
#endif

namespace premidi {
static_assert(std::atomic<std::uint64_t>::is_always_lock_free,"Audio counters must be lock free");
static_assert(std::atomic<Session*>::is_always_lock_free,"Audio publication must be lock free");
static_assert(std::atomic<unsigned>::is_always_lock_free,"Audio controls must be lock free");
// Three control-owned session slots: active, a fading predecessor, and pending.
// The callback publishes active before clearing pending. Control reads pending
// first, then active/retiring. It never frees any pointer visible to the callback.
// No destructor, smart-pointer ownership change, or allocator runs in process().
class Lane {
 std::array<std::unique_ptr<Session>,3> owned;
 std::atomic<Session*> active{nullptr},retiring{nullptr},pending{nullptr};
 std::atomic<unsigned> request{0};unsigned remaining=0;
public:
 std::atomic<unsigned> looping{0};
 Session* current()const noexcept{return active.load();}
 void publish(std::unique_ptr<Session> session){
  for(unsigned attempt=0;attempt<100;attempt++){
   const auto p=pending.load(),a=active.load(),r=retiring.load();
   if(!p)for(auto& slot:owned)if(!slot||(slot.get()!=a&&slot.get()!=r)){slot=std::move(session);pending.store(slot.get());return;}
   std::this_thread::sleep_for(std::chrono::milliseconds(2));
  }
  throw std::runtime_error("Native audio control timed out; reselect the output device");
 }
 void command(unsigned value)noexcept{request.store(value);}
 // Only after ma_device_uninit has joined the device thread.
 void clear(){pending.store(nullptr);active.store(nullptr);retiring.store(nullptr);for(auto& slot:owned)slot.reset();request.store(0);remaining=0;}
 void process(float* output,unsigned frames,unsigned& budget)noexcept{
  if(!retiring.load())if(auto p=pending.load()){
   auto old=active.load();bool ready=true;
   if(p->alignSource){
    const auto now=old?old->position.load():0;ready=old==p->alignSource&&now==p->alignOldFrame;
    if(old==p->alignSource&&now<p->alignOldFrame&&p->alignOldFrame-now<frames){
     const auto before=static_cast<unsigned>(p->alignOldFrame-now);
     process(output,before,budget);process(output+2*before,frames-before,budget);return;
    }
    if(old!=p->alignSource||now>p->alignOldFrame){pending.store(nullptr);p->handoff.store(2);}
   }
   if(ready){if(old){remaining=p->fadeFrames;retiring.store(old);}active.store(p);pending.store(nullptr);p->handoff.store(1);}
  }
  auto a=active.load();auto r=retiring.load();
  if(a){const auto control=request.exchange(0);if(control)a->command(control);a->process(output,frames,looping.load()!=0,budget);}
  else std::fill(output,output+2*frames,0.f);
  if(r){
   std::array<float,2*renderBlock> tail{};r->process(tail.data(),frames,looping.load()!=0,budget);
   for(unsigned i=0;i<frames;i++){
    const float oldGain=remaining?static_cast<float>(remaining)/a->fadeFrames:0,newGain=1-oldGain;
    output[2*i]=output[2*i]*newGain+tail[2*i]*oldGain;output[2*i+1]=output[2*i+1]*newGain+tail[2*i+1]*oldGain;
    if(remaining)--remaining;
   }
   if(!remaining)retiring.store(nullptr);
  }
 }
};

class DeviceHost {
 ma_context context{};ma_device device{};bool contextReady=false,deviceReady=false;
 SampleStore samples;std::uint64_t sampleBytes=0;
 Capture capture;std::atomic<Session*> captureTarget{nullptr};bool duplex=false;unsigned captureRate=0;
 std::vector<ma_device_info> devices;
 std::string error;
 std::atomic<unsigned> intentionalStop{0},lost{0};
 std::atomic<std::uint64_t> callbacks{0},frames{0},totalNs{0},maxNs{0},misses{0},oversized{0},clipped{0},peak{0};
 static void notify(const ma_device_notification* event)noexcept{
  auto& host=*static_cast<DeviceHost*>(event->pDevice->pUserData);
  if(!host.intentionalStop.load()&&(event->type==ma_device_notification_type_stopped||event->type==ma_device_notification_type_rerouted||event->type==ma_device_notification_type_interruption_began||event->type==ma_device_notification_type_interruption_ended))host.lost.store(1);
 }
 static void callback(ma_device* device,void* output,const void* input,ma_uint32 count)noexcept{
#ifdef PREMIDI_AUDIO_TEST
  CallbackProbe probe;
#endif
  auto& host=*static_cast<DeviceHost*>(device->pUserData);auto* pcm=static_cast<float*>(output);
  const auto started=std::chrono::steady_clock::now();
  if(count>8192||host.lost.load()){
   std::fill(pcm,pcm+std::size_t(count)*2,0.f);if(count>8192)host.oversized.fetch_add(1);return;
  }
  unsigned transportBudget=maxOnsets,previewBudget=maxOnsets;std::uint64_t clipping=0,peakValue=0;
  for(unsigned offset=0;offset<count;){
   const auto n=std::min(renderBlock,count-offset);std::array<float,2*renderBlock> a{},b{};
   host.transport.process(a.data(),n,transportBudget);host.preview.process(b.data(),n,previewBudget);
   if(host.duplex){auto* active=host.transport.current();host.capture.process(input?static_cast<const float*>(input)+offset:nullptr,n,host.frames.load()+offset,active&&active==host.captureTarget.load(),active?active->lastLeadFrames:0,active?active->lastMusicFrames:0,active&&active->stateView.load()==paused);}
   for(unsigned i=0;i<2*n;i++){
    float value=a[i]+b[i];if(!std::isfinite(value))value=0;
    const float amplitude=std::abs(value);clipping+=amplitude>1;peakValue=std::max(peakValue,static_cast<std::uint64_t>(std::min(amplitude,1000.f)*1000000.f));
    pcm[2*offset+i]=value;
   }
   offset+=n;
  }
  const auto elapsed=static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now()-started).count());
  host.callbacks.fetch_add(1);host.frames.fetch_add(count);host.totalNs.fetch_add(elapsed);
  // Single callback writer. No CAS retry loop on the real-time path.
  if(elapsed>host.maxNs.load())host.maxNs.store(elapsed);
  if(peakValue>host.peak.load())host.peak.store(peakValue);
  host.clipped.fetch_add(clipping);if(elapsed>std::uint64_t(count)*1000000000/device->sampleRate)host.misses.fetch_add(1);
 }
public:
 Lane transport,preview;const bool testBackend;
 explicit DeviceHost(bool test):testBackend(test){
  ma_backend backends[3];ma_uint32 count=0;
  if(test)backends[count++]=ma_backend_null;
  else {
#if defined(_WIN32)
   backends[count++]=ma_backend_wasapi;
#elif defined(__APPLE__)
   backends[count++]=ma_backend_coreaudio;
#else
   backends[count++]=ma_backend_pulseaudio;backends[count++]=ma_backend_alsa;
#endif
  }
  const auto result=ma_context_init(backends,count,nullptr,&context);require(result==MA_SUCCESS,"No native audio backend is available");contextReady=true;
 }
 ~DeviceHost(){close();if(contextReady)ma_context_uninit(&context);}
 void close(){
  intentionalStop.store(1);
  if(deviceReady&&!lost.load()){
   transport.command(1);preview.command(1);
   for(unsigned attempt=0;attempt<100;attempt++){
    const auto a=transport.current(),b=preview.current();
    if((!a||a->stateView.load()!=playing)&&(!b||b->stateView.load()!=playing))break;
    std::this_thread::sleep_for(std::chrono::milliseconds(2));
   }
  }
  if(deviceReady){ma_device_uninit(&device);deviceReady=false;}
  transport.clear();preview.clear();samples.clear();sampleBytes=0;captureTarget.store(nullptr);capture.discard();duplex=false;captureRate=0;intentionalStop.store(0);
 }
 int enumerate(){
  ma_device_info* list=nullptr;ma_uint32 count=0;
  require(ma_context_get_devices(&context,&list,&count,nullptr,nullptr)==MA_SUCCESS,"Could not enumerate native audio outputs");
  require(count<=256,"Too many audio outputs");if(count)devices.assign(list,list+count);else devices.clear();return static_cast<int>(count);
 }
 const char* name(unsigned index){return index<devices.size()?devices[index].name:nullptr;}
 const char* backend()const{return ma_get_backend_name(context.backend);}
 void open(unsigned index,unsigned rate,unsigned period){
  require(rate==0||rate==44100||rate==48000||rate==96000,"Choose automatic, 44.1, 48 or 96 kHz");
  require(period==0||period==128||period==256||period==512||period==1024,"Choose an automatic or supported buffer size");
  if(index!=UINT32_MAX)require(index<devices.size(),"Output list changed; refresh audio devices");
  close();lost.store(0);
  auto config=ma_device_config_init(ma_device_type_playback);
  config.playback.format=ma_format_f32;config.playback.channels=2;
  config.playback.pDeviceID=index==UINT32_MAX?nullptr:&devices[index].id;
  config.sampleRate=rate;config.periodSizeInFrames=period?period:256;config.periods=3;
  config.performanceProfile=ma_performance_profile_low_latency;config.dataCallback=callback;config.notificationCallback=notify;config.pUserData=this;
  const auto result=ma_device_init(&context,&config,&device);
  require(result==MA_SUCCESS,"Could not open the selected native output (try automatic rate/buffer)");
  deviceReady=true;
  require(device.sampleRate>=8000&&device.sampleRate<=192000,"Unsupported device sample rate");
  if(ma_device_start(&device)!=MA_SUCCESS){close();throw std::runtime_error("Could not start native audio output");}
 }
 void ensure(){require(!lost.load(),"Native output disconnected or changed. Refresh outputs in Settings and select the device again.");if(!deviceReady)open(UINT32_MAX,0,0);}
 void switchDuplex(bool enabled){
  ensure();if(duplex==enabled)return;
  const auto sampleRate=device.sampleRate,period=device.playback.internalPeriodSizeInFrames;const auto outputId=device.playback.id;
  auto* a=transport.current();auto* b=preview.current();const bool resumeA=a&&a->stateView.load()==playing,resumeB=b&&b->stateView.load()==playing;
  if(resumeA)transport.command(2);
  if(resumeB)preview.command(2);
  for(unsigned i=0;i<100;i++){if((!resumeA||a->stateView.load()!=playing)&&(!resumeB||b->stateView.load()!=playing))break;std::this_thread::sleep_for(std::chrono::milliseconds(2));}
  intentionalStop.store(1);ma_device_uninit(&device);deviceReady=false;
  auto initialize=[&](bool mode){
   auto config=ma_device_config_init(mode?ma_device_type_duplex:ma_device_type_playback);config.playback.format=ma_format_f32;config.playback.channels=2;config.playback.pDeviceID=&outputId;
   config.capture.format=ma_format_f32;config.capture.channels=1;config.sampleRate=sampleRate;config.periodSizeInFrames=period;config.periods=3;config.performanceProfile=ma_performance_profile_low_latency;
   config.dataCallback=callback;config.notificationCallback=notify;config.pUserData=this;
   if(ma_device_init(&context,&config,&device)!=MA_SUCCESS)return false;
   deviceReady=true;duplex=mode;
   if(device.sampleRate!=sampleRate||ma_device_start(&device)!=MA_SUCCESS){ma_device_uninit(&device);deviceReady=false;return false;}return true;
  };
  const bool success=initialize(enabled);if(!success){if(!initialize(false))lost.store(1);}
  intentionalStop.store(0);if(resumeA)transport.command(3);if(resumeB)preview.command(3);
  require(success,enabled?"Could not open the native microphone. Check Windows microphone privacy settings and the default input device.":"Could not restore the native playback device");
 }
 void prepareCapture(double seconds,double offset,bool sync){
  ensure();capture.prepare(device.sampleRate,seconds,offset,sync);captureRate=device.sampleRate;captureTarget.store(nullptr);switchDuplex(true);capture.arm();
 }
 void startCapture(double lead){ensure();require(duplex,"Prepare the native microphone first");capture.start(device.sampleRate,lead);}
 void finishCapture(bool cancel){
  capture.stop();if(deviceReady&&!lost.load())for(unsigned i=0;i<400&&capture.phase.load()!=3;i++)std::this_thread::sleep_for(std::chrono::milliseconds(2));
  if(deviceReady){try{switchDuplex(false);}catch(...){intentionalStop.store(1);if(deviceReady){ma_device_uninit(&device);deviceReady=false;}duplex=false;intentionalStop.store(0);lost.store(1);}}
  capture.joined();if(cancel)capture.discard();captureTarget.store(nullptr);
 }
 std::uint64_t captureSize()const noexcept{return capture.size();}
 void copyCapture(float* output,std::uint64_t count){require(!duplex&&output&&count==capture.size(),"Native capture has not stopped safely");std::copy(capture.data(),capture.data()+count,output);}
 void previewControl(unsigned command){require(command>=1&&command<=3,"Invalid native preview command");preview.command(command);}
 void play(const std::uint8_t* data,std::size_t length,double cycle,double seek,bool loop,bool audition,double bpm=120,unsigned bars=0,bool recording=false){
  ensure();auto session=std::make_unique<Session>(data,length,device.sampleRate,cycle,seek,samples);
  if(bars)session->countIn(bpm,bars);
  if(recording){require(!audition&&duplex&&capture.phase.load()==1,"Prepare a native Song take before playback");capture.duration(device.sampleRate,cycle-seek);captureTarget.store(session.get());}
  auto* published=session.get();auto& lane=audition?preview:transport;lane.looping.store(loop?1:0);lane.publish(std::move(session));
  for(unsigned attempt=0;attempt<150;attempt++){
   if(lane.current()==published)return;
   if(lost.load())break;
   std::this_thread::sleep_for(std::chrono::milliseconds(2));
  }
  close();throw std::runtime_error("Native output stopped delivering callbacks; select the device again");
 }
 void addSample(const float* input,std::uint64_t frames,unsigned rate,unsigned channels,premidi_sample_info& info,unsigned targetRate=0){
  if(!targetRate)ensure();
  require(input!=nullptr&&samples.size()<512,"Native sample asset capacity exceeded");
  const auto outputRate=targetRate?targetRate:device.sampleRate;require(outputRate>=8000&&outputRate<=192000,"Invalid native asset output rate");
  const double outputFrames=std::ceil(static_cast<double>(frames)*outputRate/rate);
  require(rate>=8000&&rate<=192000&&channels>=1&&channels<=2&&frames>0&&frames<=std::uint64_t(rate)*301&&outputFrames*channels*4+sampleBytes<=1024.*1024*1024,"Native decoded assets exceed 1 GiB");
  auto value=std::make_shared<SampleData>(input,frames,rate,channels,outputRate);samples.push_back(value);sampleBytes+=value->pcm.size()*sizeof(float);
  info={static_cast<std::uint32_t>(samples.size()),value->rate,value->channels,value->frames,value->normalization};
 }
 void update(const std::uint8_t* data,std::size_t length,double cycle,bool loop,double ratio){
  ensure();require(std::isfinite(ratio)&&ratio>=.01&&ratio<=32,"Invalid native edit tempo ratio");
  auto* old=transport.current();if(!old||old->stateView.load()==finished||old->stateView.load()==stopped)return;
  const bool hold=old->stateView.load()==paused;
  require(std::isfinite(cycle)&&cycle>=.05&&cycle<=600,"Invalid native edit duration");
  const auto started=std::chrono::steady_clock::now();
  for(;;){
   const auto base=old->position.load();
   const double seek=std::fmod(std::fmod(static_cast<double>(base)/device.sampleRate,old->cycleSeconds)*ratio,cycle);
   auto value=std::make_unique<Session>(data,length,device.sampleRate,cycle,loop?0:seek,samples);
   if(loop)require(value->warmLoopPosition(seek,static_cast<std::uint64_t>(base/(device.sampleRate*old->cycleSeconds))),"Native loop edit reconstruction failed");
   const auto initial=value->position.load();
   std::uint64_t due=base;
   if(!hold)for(;;){
    due=old->position.load()+4*renderBlock;
    const auto target=initial+static_cast<std::uint64_t>(std::llround((due-base)*ratio));
    require(value->advanceTo(target,loop),"Native edit reached the end of its new arrangement");
    if(due>=old->position.load()+2*renderBlock)break;
    require(std::chrono::steady_clock::now()-started<std::chrono::seconds(2),"Native edit preparation exceeded the real-time catch-up budget");
   }
   value->alignSource=old;value->alignOldFrame=due;
   if(hold){value->state=paused;value->stateView.store(paused);}
   auto* published=value.get();transport.looping.store(loop?1:0);transport.publish(std::move(value));
   for(unsigned attempt=0;attempt<150;attempt++){
    if(published->handoff.load()==1)return;
    if(published->handoff.load()==2)break;
    require(!lost.load(),"Native output disconnected during an edit");std::this_thread::sleep_for(std::chrono::milliseconds(2));
   }
   require(std::chrono::steady_clock::now()-started<std::chrono::seconds(2),"Native edit publication missed its audio-clock boundary");
   require(published->handoff.load()==2,"Native edit publication timed out");
  }
 }
 void render(const std::uint8_t* data,std::size_t length,double cycle,unsigned rate,std::uint64_t count,std::uint8_t* output,std::size_t bytes,unsigned format,double gain){
  require(rate>=8000&&rate<=192000&&count>0&&count<=std::uint64_t(rate)*600&&format<=1&&std::isfinite(gain)&&gain>=0&&gain<=2,"Invalid native offline render dimensions");
  require(output&&bytes==count*2*(format?2:4),"Invalid native offline output buffer");
  SampleStore available;available.reserve(samples.size());std::uint64_t memory=0;
  for(const auto& source:samples){
   if(source->rate==rate)available.push_back(source);
   else{const auto size=static_cast<std::uint64_t>(std::ceil(static_cast<double>(source->frames)*rate/source->rate))*source->channels*4;require(memory+size<=1024ull*1024*1024,"Native offline assets exceed 1 GiB");available.push_back(std::make_shared<SampleData>(source->pcm.data(),source->frames,source->rate,source->channels,rate));memory+=size;}
  }
  auto session=std::make_unique<Session>(data,length,rate,cycle,0,available);std::array<float,2*renderBlock> pcm{};
  for(std::uint64_t at=0;at<count;){const auto n=static_cast<unsigned>(std::min<std::uint64_t>(renderBlock,count-at));unsigned budget=maxOnsets;session->process(pcm.data(),n,false,budget);require(!session->fault.load(),"Native offline rendering exceeded the voice budget");
   for(unsigned i=0;i<2*n;i++){const float value=pcm[i]*static_cast<float>(gain/.85);require(std::isfinite(value),"Native offline rendering produced nonfinite PCM");const auto index=2*at+i;
    if(format){const float sample=std::clamp(value,-1.f,1.f);const auto integer=static_cast<std::int16_t>(sample*(sample<0?32768.f:32767.f));output[2*index]=static_cast<std::uint8_t>(integer);output[2*index+1]=static_cast<std::uint8_t>(static_cast<std::uint16_t>(integer)>>8);}
    else std::memcpy(output+4*index,&value,4);
   }at+=n;
  }
 }
 void control(unsigned command,bool loop){
  require(command<=4,"Unknown native transport command");transport.looping.store(loop?1:0);
  if(command)transport.command(command==4?1:command);
  if(command==4)preview.command(1);
  if((command==1||command==4)&&captureTarget.load())capture.stop();
  if(command&&deviceReady&&!lost.load())for(unsigned attempt=0;attempt<100;attempt++){
   const auto a=transport.current(),b=preview.current();const auto wanted=command==2?paused:command==3?playing:stopped;
   const bool mainDone=!a||a->stateView.load()==wanted||a->stateView.load()==finished||a->stateView.load()==failed;
   const bool previewDone=command!=4||!b||b->stateView.load()!=playing;
   if(mainDone&&previewDone)break;
   std::this_thread::sleep_for(std::chrono::milliseconds(2));
  }
 }
 void status(premidi_audio_status& s){
  s={};s.callbacks=callbacks.load();s.frames=frames.load();s.total_ns=totalNs.load();s.max_ns=maxNs.load();s.deadline_misses=misses.load();s.oversized=oversized.load();s.clipped=clipped.load();s.peak_million=peak.load();s.device_lost=lost.load();s.test_backend=testBackend?1:0;
  if(deviceReady){s.sample_rate=device.sampleRate;s.hardware_rate=device.playback.internalSampleRate;s.period_frames=device.playback.internalPeriodSizeInFrames;s.period_count=device.playback.internalPeriods;}
  else if(captureRate)s.sample_rate=captureRate;
  if(auto* active=transport.current()){s.position=active->position.load();s.active=active->active.load();s.state=active->stateView.load();s.fault=active->fault.load();}
  if(auto* active=transport.current())s.lead_remaining=active->leadRemaining.load();
  if(auto* active=preview.current()){s.preview_position=active->position.load();s.preview_state=active->stateView.load();}
  s.capture_phase=capture.phase.load();s.capture_frames=capture.frames.load();s.capture_missing=capture.missing.load();s.capture_clipped=capture.clipped.load();s.capture_peak_million=capture.peakMillion.load();s.capture_lead=capture.leadRemaining.load();s.capture_start=capture.startFrame.load();
 }
 template<class F> int checked(F&& f){try{error.clear();f();return 0;}catch(const std::exception& e){error=e.what();return -1;}}
 const char* lastError()const{return error.c_str();}
};
}

extern "C" {
void* premidi_audio_create(int test){try{return new premidi::DeviceHost(test!=0);}catch(...){return nullptr;}}
void premidi_audio_destroy(void* host){delete static_cast<premidi::DeviceHost*>(host);}
const char* premidi_audio_error(void* host){return host?static_cast<premidi::DeviceHost*>(host)->lastError():"No native audio backend is available";}
int premidi_audio_devices(void* host){auto& h=*static_cast<premidi::DeviceHost*>(host);int count=0;return h.checked([&]{count=h.enumerate();})==0?count:-1;}
const char* premidi_audio_device_name(void* host,uint32_t index){return static_cast<premidi::DeviceHost*>(host)->name(index);}
const char* premidi_audio_backend(void* host){return static_cast<premidi::DeviceHost*>(host)->backend();}
int premidi_audio_configure(void* host,uint32_t device,uint32_t rate,uint32_t frames){auto& h=*static_cast<premidi::DeviceHost*>(host);return h.checked([&]{h.open(device,rate,frames);});}
int premidi_audio_play(void* host,const uint8_t* data,size_t length,double cycle,double seek,int loop,int preview){auto& h=*static_cast<premidi::DeviceHost*>(host);return h.checked([&]{h.play(data,length,cycle,seek,loop!=0,preview!=0);});}
int premidi_audio_control(void* host,uint32_t command,int loop){auto& h=*static_cast<premidi::DeviceHost*>(host);return h.checked([&]{h.control(command,loop!=0);});}
int premidi_audio_status_get(void* host,premidi_audio_status* status){auto& h=*static_cast<premidi::DeviceHost*>(host);return h.checked([&]{h.status(*status);});}
int premidi_audio_add_sample(void* host,const float* pcm,uint64_t frames,uint32_t rate,uint32_t channels,premidi_sample_info* info){auto& h=*static_cast<premidi::DeviceHost*>(host);return h.checked([&]{h.addSample(pcm,frames,rate,channels,*info);});}
int premidi_audio_add_sample_rate(void* host,const float* pcm,uint64_t frames,uint32_t rate,uint32_t channels,premidi_sample_info* info,uint32_t target_rate){auto& h=*static_cast<premidi::DeviceHost*>(host);return h.checked([&]{h.addSample(pcm,frames,rate,channels,*info,target_rate);});}
int premidi_audio_update(void* host,const uint8_t* data,size_t length,double cycle,int loop,double ratio){auto& h=*static_cast<premidi::DeviceHost*>(host);return h.checked([&]{h.update(data,length,cycle,loop!=0,ratio);});}
int premidi_audio_render(void* host,const uint8_t* data,size_t length,double cycle,uint32_t rate,uint64_t frames,uint8_t* output,size_t output_bytes,uint32_t format,double gain){auto& h=*static_cast<premidi::DeviceHost*>(host);return h.checked([&]{h.render(data,length,cycle,rate,frames,output,output_bytes,format,gain);});}
int premidi_audio_play_take(void* host,const uint8_t* data,size_t length,double cycle,double seek,int loop,int preview,double bpm,uint32_t bars,int record){auto& h=*static_cast<premidi::DeviceHost*>(host);return h.checked([&]{h.play(data,length,cycle,seek,loop!=0,preview!=0,bpm,bars,record!=0);});}
int premidi_audio_capture_prepare(void* host,double seconds,double offset_ms,int sync){auto& h=*static_cast<premidi::DeviceHost*>(host);return h.checked([&]{h.prepareCapture(seconds,offset_ms,sync!=0);});}
int premidi_audio_capture_start(void* host,double lead){auto& h=*static_cast<premidi::DeviceHost*>(host);return h.checked([&]{h.startCapture(lead);});}
int premidi_audio_capture_finish(void* host,int cancel){auto& h=*static_cast<premidi::DeviceHost*>(host);return h.checked([&]{h.finishCapture(cancel!=0);});}
uint64_t premidi_audio_capture_size(void* host){return static_cast<premidi::DeviceHost*>(host)->captureSize();}
int premidi_audio_capture_copy(void* host,float* output,uint64_t frames){auto& h=*static_cast<premidi::DeviceHost*>(host);return h.checked([&]{h.copyCapture(output,frames);});}
int premidi_audio_preview_control(void* host,uint32_t command){auto& h=*static_cast<premidi::DeviceHost*>(host);return h.checked([&]{h.previewControl(command);});}
int premidi_audio_resample(const float* input,uint64_t frames,uint32_t rate,uint32_t channels,uint32_t target,float* output,uint64_t output_frames,uint32_t output_channels){try{
 premidi::require(input&&output&&(output_channels==1||output_channels==channels),"Invalid native conversion buffer");
 premidi::SampleData sample(input,frames,rate,channels,target);premidi::require(sample.frames==output_frames,"Invalid native conversion dimensions");
 if(output_channels==channels)std::copy(sample.pcm.begin(),sample.pcm.end(),output);
 else for(std::uint64_t frame=0;frame<sample.frames;frame++){double value=0;for(unsigned ch=0;ch<channels;ch++)value+=sample.pcm[frame*channels+ch];output[frame]=static_cast<float>(value/channels);}
 return 0;
}catch(...){return -1;}}
}
