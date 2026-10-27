#include "session.hpp"
#include "device-host.h"
#include <fstream>
#include <iostream>
#include <iterator>
#include <cstdlib>
#include <thread>
#include <chrono>
#include <new>
static thread_local bool callbackScope=false;
static std::atomic<std::uint64_t> callbackAllocations{0};
extern "C" void premidi_test_callback_guard(int enabled){callbackScope=enabled!=0;}
__attribute__((noinline)) void* operator new(std::size_t count){if(callbackScope)callbackAllocations.fetch_add(1);if(auto* p=std::malloc(count))return p;throw std::bad_alloc();}
__attribute__((noinline)) void operator delete(void* p)noexcept{std::free(p);}
__attribute__((noinline)) void operator delete(void* p,std::size_t)noexcept{std::free(p);}
__attribute__((noinline)) void* operator new(std::size_t count,const std::nothrow_t&)noexcept{try{return ::operator new(count);}catch(...){return nullptr;}}
__attribute__((noinline)) void operator delete(void* p,const std::nothrow_t&)noexcept{std::free(p);}
__attribute__((noinline)) void* operator new[](std::size_t count){return ::operator new(count);}
__attribute__((noinline)) void* operator new[](std::size_t count,const std::nothrow_t&)noexcept{try{return ::operator new(count);}catch(...){return nullptr;}}
__attribute__((noinline)) void operator delete[](void* p)noexcept{std::free(p);}
__attribute__((noinline)) void operator delete[](void* p,std::size_t)noexcept{std::free(p);}
__attribute__((noinline)) void operator delete[](void* p,const std::nothrow_t&)noexcept{std::free(p);}
int main(int argc,char** argv){
 try{
  premidi::require(argc>=3,"Missing test arguments");std::ifstream source(argv[2],std::ios::binary);
  premidi::require(bool(source),"Missing prepared fixture");std::vector<std::uint8_t> bytes((std::istreambuf_iterator<char>(source)),{});
  const std::string mode=argv[1];
  if(mode=="--render"){
   premidi::require(argc==11,"render: packet rate cycle seek loop frames block output pause-test");
   const auto rate=static_cast<unsigned>(std::stoul(argv[3])),frames=static_cast<unsigned>(std::stoul(argv[7])),block=static_cast<unsigned>(std::stoul(argv[8]));
   premidi::require(block>0&&block<=8192&&frames<=rate*12,"Invalid render dimensions");
   premidi::Session session(bytes.data(),bytes.size(),rate,std::stod(argv[4]),std::stod(argv[5]));
   std::vector<float> output(2*frames);const bool loop=std::stoi(argv[6])!=0;
   if(std::string(argv[10])=="pause"){
    unsigned budget=256;float buffer[256];session.command(2);
    while(session.state==premidi::playing){budget=256;callbackScope=true;session.process(buffer,128,loop,budget);callbackScope=false;}
    const auto before=session.position.load();budget=256;session.process(buffer,128,loop,budget);
    premidi::require(session.state==premidi::paused&&session.position.load()==before,"Pause advanced the playhead");session.command(3);
   }
   for(unsigned at=0;at<frames;){const auto n=std::min(block,frames-at);unsigned budget=256;callbackScope=true;session.process(output.data()+2*at,n,loop,budget);callbackScope=false;at+=n;}
   premidi::require(session.fault.load()==0,"Callback mixer fault");premidi::require(callbackAllocations.load()==0,"Callback mixer allocated");
   for(auto value:output)premidi::require(std::isfinite(value),"Nonfinite callback PCM");
   std::ofstream file(argv[9],std::ios::binary);file.write(reinterpret_cast<const char*>(output.data()),static_cast<std::streamsize>(output.size()*sizeof(float)));
   std::cout<<"{\"allocations\":0,\"voices\":"<<session.active.load()<<",\"state\":"<<session.state<<",\"stolen\":"<<session.stolen<<"}\n";
  }else if(mode=="--device"){
   premidi::require(argc==5,"device: packet rate null-or-hardware");
   const bool test=std::string(argv[4])=="null";void* host=premidi_audio_create(test?1:0);premidi::require(host!=nullptr,"Native context failed");
   const auto check=[&](int result){if(result<0)throw std::runtime_error(premidi_audio_error(host));};
   try{
    const auto count=premidi_audio_devices(host);check(count);const auto rate=static_cast<unsigned>(std::stoul(argv[3]));
    check(premidi_audio_configure(host,UINT32_MAX,rate,256));check(premidi_audio_play(host,bytes.data(),bytes.size(),.5,0,1,0));
    std::this_thread::sleep_for(std::chrono::milliseconds(160));
    premidi_audio_status initial{};check(premidi_audio_status_get(host,&initial));premidi::require(initial.callbacks>0&&initial.peak_million>0,"Device callback did not generate audio");
    check(premidi_audio_control(host,2,1));premidi_audio_status paused{};check(premidi_audio_status_get(host,&paused));
    std::this_thread::sleep_for(std::chrono::milliseconds(30));premidi_audio_status stable{};check(premidi_audio_status_get(host,&stable));premidi::require(stable.state==premidi::paused&&stable.position==paused.position,"Device pause lost position");
    check(premidi_audio_control(host,3,1));check(premidi_audio_play(host,bytes.data(),bytes.size(),.5,0,0,1));
    for(unsigned i=0;i<8;i++){check(premidi_audio_control(host,1,0));check(premidi_audio_play(host,bytes.data(),bytes.size(),.5,0,1,0));}
    std::this_thread::sleep_for(std::chrono::milliseconds(100));premidi_audio_status final{};check(premidi_audio_status_get(host,&final));
    premidi::require(callbackAllocations.load()==0,"C++ allocation in real device callback");premidi::require(final.fault==0&&final.oversized==0,"Device callback bound failed");
    std::cout<<"{\"backend\":\""<<premidi_audio_backend(host)<<"\",\"testBackend\":"<<(test?"true":"false")<<",\"hardwareValidation\":false,\"sampleRate\":"<<final.sample_rate<<",\"callbacks\":"<<final.callbacks<<",\"renderNs\":"<<final.total_ns<<",\"frames\":"<<final.frames<<",\"maxCallbackNs\":"<<final.max_ns<<",\"deadlineMisses\":"<<final.deadline_misses<<",\"allocations\":0,\"deviceUnderruns\":null,\"measuredLatencyMs\":null}\n";
    premidi_audio_destroy(host);
   }catch(...){premidi_audio_destroy(host);throw;}
  }else throw std::runtime_error("Unknown test mode");
  return 0;
 }catch(const std::exception& error){callbackScope=false;std::cerr<<error.what()<<'\n';return 1;}
}
