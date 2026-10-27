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
   auto old=active.load();if(old){remaining=p->fadeFrames;retiring.store(old);}
   active.store(p);pending.store(nullptr);
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
 std::vector<ma_device_info> devices;
 std::string error;
 std::atomic<unsigned> intentionalStop{0},lost{0};
 std::atomic<std::uint64_t> callbacks{0},frames{0},totalNs{0},maxNs{0},misses{0},oversized{0},clipped{0},peak{0};
 static void notify(const ma_device_notification* event)noexcept{
  auto& host=*static_cast<DeviceHost*>(event->pDevice->pUserData);
  if(!host.intentionalStop.load()&&(event->type==ma_device_notification_type_stopped||event->type==ma_device_notification_type_rerouted||event->type==ma_device_notification_type_interruption_began||event->type==ma_device_notification_type_interruption_ended))host.lost.store(1);
 }
 static void callback(ma_device* device,void* output,const void*,ma_uint32 count)noexcept{
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
  transport.clear();preview.clear();intentionalStop.store(0);
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
 void play(const std::uint8_t* data,std::size_t length,double cycle,double seek,bool loop,bool audition){
  ensure();auto session=std::make_unique<Session>(data,length,device.sampleRate,cycle,seek);
  auto* published=session.get();auto& lane=audition?preview:transport;lane.looping.store(loop?1:0);lane.publish(std::move(session));
  for(unsigned attempt=0;attempt<150;attempt++){
   if(lane.current()==published)return;
   if(lost.load())break;
   std::this_thread::sleep_for(std::chrono::milliseconds(2));
  }
  close();throw std::runtime_error("Native output stopped delivering callbacks; select the device again");
 }
 void control(unsigned command,bool loop){
  require(command<=4,"Unknown native transport command");transport.looping.store(loop?1:0);
  if(command)transport.command(command==4?1:command);
  if(command==4)preview.command(1);
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
  if(auto* active=transport.current()){s.position=active->position.load();s.active=active->active.load();s.state=active->stateView.load();s.fault=active->fault.load();}
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
}
