// Drive actual miniaudio null backend through the new bounded Song page
// C ABI. This tests callback safety and Rust-ready transport semantics; it
// is NOT physical Windows 11 listening or driver latency qualification.
#include "session.hpp"
#include "device-host.h"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <iterator>
#include <new>
#include <thread>
#include <vector>
static thread_local bool audioScope=false;
static std::atomic<unsigned> allocations{0};
extern "C" void premidi_test_callback_guard(int enabled){audioScope=enabled!=0;}
__attribute__((noinline)) void* operator new(std::size_t n){
 if(audioScope)allocations.fetch_add(1,std::memory_order_relaxed);
 if(auto* p=std::malloc(n))return p;
 throw std::bad_alloc();
}
__attribute__((noinline)) void operator delete(void* p)noexcept{std::free(p);}
__attribute__((noinline)) void operator delete(void* p,std::size_t)noexcept{std::free(p);}
__attribute__((noinline)) void* operator new[](std::size_t n){return ::operator new(n);}
__attribute__((noinline)) void operator delete[](void* p)noexcept{std::free(p);}
__attribute__((noinline)) void operator delete[](void* p,std::size_t)noexcept{std::free(p);}
__attribute__((noinline)) void* operator new(std::size_t n,const std::nothrow_t&)noexcept{try{return ::operator new(n);}catch(...){return nullptr;}}
__attribute__((noinline)) void operator delete(void* p,const std::nothrow_t&)noexcept{std::free(p);}
static std::vector<std::uint8_t> read(const char* path){
 std::ifstream file(path,std::ios::binary);
 if(!file)throw std::runtime_error("Missing native device stream packet");
 return {(std::istreambuf_iterator<char>(file)),{}};
}
struct Page{std::uint64_t first,end;unsigned onsets;bool last;std::vector<std::uint8_t> bytes;};
int main(int argc,char** argv){
 try{
  premidi::require(argc>=8&&(argc-4)%4==0,"stream device: rate frames full-packet pages...");
  const auto rate=static_cast<unsigned>(std::stoul(argv[1]));
  const auto frames=static_cast<std::uint64_t>(std::stoull(argv[2]));
  const auto full=read(argv[3]);
  auto referenceOwner=std::make_unique<premidi::Session>(full.data(),full.size(),rate,static_cast<double>(frames)/rate,0);auto& reference=*referenceOwner;
  std::vector<Page> pages;
  std::uint64_t last=0;
  for(int at=4;at<argc;at+=4){
   const auto start=std::stoull(argv[at]),end=std::stoull(argv[at+1]);
   premidi::require(start==last&&end>start&&end<=frames,"Invalid C ABI Song page range");
   pages.push_back({start,end,static_cast<unsigned>(std::stoul(argv[at+2])),
    at+4==argc,read(argv[at+3])});
   last=end;
  }
  premidi::require(last==frames,"Native device stream fixture is not contiguous");
  void* host=premidi_audio_create(1);
  premidi::require(host,"Native miniaudio null device was not available");
  const auto check=[&](int result){
   if(result<0)throw std::runtime_error(premidi_audio_error(host));
  };
  try{
   check(premidi_audio_configure(host,UINT32_MAX,rate,128));
   constexpr std::uint64_t owner=91,revision=7;
   check(premidi_audio_stream_begin(host,owner,revision));
   for(const auto& note:reference.notes)if(note.plan.delayMix>0)
    check(premidi_audio_stream_delay(host,owner,revision,note.plan.delayMix,
     note.plan.delayTime,note.plan.delayFeedback,note.plan.delayTone,note.plan.delayPingPong));
   std::size_t published=0;unsigned backpressure=0;
   const auto feed=[&]{
    while(published<pages.size()){
     const auto& p=pages[published];
     const int status=premidi_audio_stream_page(host,owner,revision,published+1,
      p.first,p.end,p.onsets,p.last?1:0,p.bytes.data(),p.bytes.size());
     check(status);
     if(status==1){++backpressure;break;}
     ++published;
    }
   };
   feed();
   premidi::require(published>=1,"Could not preload the first native Song page");
   check(premidi_audio_stream_start(host,owner,revision));
   premidi_stream_status status{};
   const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(8);
   unsigned checks=0;
   do{
    feed();check(premidi_audio_stream_status_get(host,&status));
    premidi::require(status.fault==0,"Native device stream callback reported a page fault");
    if(status.position>=frames&&status.ack_sequence==pages.size())break;
    std::this_thread::sleep_for(std::chrono::milliseconds(2));++checks;
   }while(std::chrono::steady_clock::now()<deadline);
   premidi::require(status.ack_sequence==pages.size()&&status.position>=frames,
    "Native Song device did not reach its final page on time");
   premidi_audio_status overall{};check(premidi_audio_status_get(host,&overall));
   premidi::require(overall.peak_million>0&&overall.fault==0&&
    overall.callbacks>0&&overall.oversized==0,
    "Native Song device callback did not produce bounded real audio");
   premidi::require(allocations.load()==0,
    "Native Song device callback allocated or destroyed a DSP resource");
   const auto streamedFrames=overall.position;const auto streamedPages=published;
   check(premidi_audio_stream_stop(host,owner,revision));
   check(premidi_audio_stream_status_get(host,&status));
   premidi::require(status.state==premidi::stopped,
    "Stopping a stream did not release its native owner");
   const int stale=premidi_audio_stream_start(host,owner,revision);
   premidi::require(stale<0,"Stale Song owner restarted a cancelled stream");
   // A request arriving from another thread must stop the Song clock without
   // waiting for the host control thread to retire its pages.
   check(premidi_audio_stream_begin(host,owner+1,revision+1));
   for(const auto& note:reference.notes)if(note.plan.delayMix>0)
    check(premidi_audio_stream_delay(host,owner+1,revision+1,note.plan.delayMix,
     note.plan.delayTime,note.plan.delayFeedback,note.plan.delayTone,note.plan.delayPingPong));
   check(premidi_audio_stream_page(host,owner+1,revision+1,1,
    pages[0].first,pages[0].end,pages[0].onsets,pages[0].last?1:0,
    pages[0].bytes.data(),pages[0].bytes.size()));
   check(premidi_audio_stream_start(host,owner+1,revision+1));
   std::thread urgent([&]{premidi_audio_request_transport_stop(host);});urgent.join();
   premidi_stream_status silenced{};check(premidi_audio_stream_status_get(host,&silenced));
   std::this_thread::sleep_for(std::chrono::milliseconds(30));
   check(premidi_audio_stream_status_get(host,&status));
   premidi::require(status.position==silenced.position,
    "Urgent Song Stop did not halt the audio callback clock");
   check(premidi_audio_stream_stop(host,owner+1,revision+1));
   // A prepared seek/edit revision can replace a paused stream without
   // waking it or destroying callback-owned resources.
   check(premidi_audio_stream_begin(host,owner+2,revision+2));
   for(const auto& note:reference.notes)if(note.plan.delayMix>0)
    check(premidi_audio_stream_delay(host,owner+2,revision+2,note.plan.delayMix,note.plan.delayTime,note.plan.delayFeedback,note.plan.delayTone,note.plan.delayPingPong));
   for(unsigned i=0;i<3&&i<pages.size();i++){const auto& p=pages[i];check(premidi_audio_stream_page(host,owner+2,revision+2,i+1,p.first,p.end,p.onsets,p.last,p.bytes.data(),p.bytes.size()));}
   check(premidi_audio_stream_start_take(host,owner+2,revision+2,120,0,0,1,UINT64_MAX,1));
   check(premidi_audio_stream_status_get(host,&status));const auto heldPosition=status.position;
   check(premidi_audio_stream_begin(host,owner+2,revision+3));
   for(const auto& note:reference.notes)if(note.plan.delayMix>0)
    check(premidi_audio_stream_delay(host,owner+2,revision+3,note.plan.delayMix,note.plan.delayTime,note.plan.delayFeedback,note.plan.delayTone,note.plan.delayPingPong));
   for(unsigned i=0;i<3&&i<pages.size();i++){const auto& p=pages[i];check(premidi_audio_stream_page(host,owner+2,revision+3,i+1,p.first,p.end,p.onsets,p.last,p.bytes.data(),p.bytes.size()));}
   check(premidi_audio_stream_advance(host,owner+2,revision+3,rate/7));
   check(premidi_audio_stream_start_take(host,owner+2,revision+3,120,0,0,1,heldPosition,1));
   std::this_thread::sleep_for(std::chrono::milliseconds(12));
   check(premidi_audio_stream_status_get(host,&status));
   premidi::require(status.state==premidi::paused&&status.position==rate/7,"Paused Song revision moved its clock");
   check(premidi_audio_control(host,3,0));
   for(unsigned i=0;i<100;i++){check(premidi_audio_stream_status_get(host,&status));if(status.position>rate/7)break;std::this_thread::sleep_for(std::chrono::milliseconds(2));}
   premidi::require(status.position>rate/7,"Prepared Song revision did not resume");
   // Prime while paused, then resume the old clock before the exact handoff.
   // This tests callback alignment independently of instrumented preparation CPU.
   check(premidi_audio_control(host,2,0));
   check(premidi_audio_stream_begin(host,owner+2,revision+4));
   for(const auto& note:reference.notes)if(note.plan.delayMix>0)
    check(premidi_audio_stream_delay(host,owner+2,revision+4,note.plan.delayMix,note.plan.delayTime,note.plan.delayFeedback,note.plan.delayTone,note.plan.delayPingPong));
   for(unsigned i=0;i<3&&i<pages.size();i++){const auto& p=pages[i];check(premidi_audio_stream_page(host,owner+2,revision+4,i+1,p.first,p.end,p.onsets,p.last,p.bytes.data(),p.bytes.size()));}
   check(premidi_audio_stream_status_get(host,&status));const auto due=status.position+rate/20;
   check(premidi_audio_stream_advance(host,owner+2,revision+4,due));
   check(premidi_audio_control(host,3,0));
   check(premidi_audio_stream_start_take(host,owner+2,revision+4,120,0,0,1,due,0));
   check(premidi_audio_stream_status_get(host,&status));
   premidi::require(status.position>=due&&status.state==premidi::playing&&!status.fault,"Running Song handoff missed its audio clock");
   check(premidi_audio_stream_stop(host,owner+2,revision+4));
   // Count-in/capture share the stream callback clock, including source seek.
   check(premidi_audio_capture_prepare(host,.2,3,1));
   check(premidi_audio_stream_begin(host,owner+3,revision+4));
   for(const auto& note:reference.notes)if(note.plan.delayMix>0)
    check(premidi_audio_stream_delay(host,owner+3,revision+4,note.plan.delayMix,note.plan.delayTime,note.plan.delayFeedback,note.plan.delayTone,note.plan.delayPingPong));
   published=0;
   const auto captureFeed=[&]{while(published<pages.size()){const auto& p=pages[published];const int result=premidi_audio_stream_page(host,owner+3,revision+4,published+1,p.first,p.end,p.onsets,p.last,p.bytes.data(),p.bytes.size());check(result);if(result==1)break;++published;}};
   captureFeed();check(premidi_audio_stream_advance(host,owner+3,revision+4,rate/20));
   check(premidi_audio_stream_start_take(host,owner+3,revision+4,240,1,1,.2,UINT64_MAX,0));
   const auto captureDeadline=std::chrono::steady_clock::now()+std::chrono::seconds(4);
   do{captureFeed();check(premidi_audio_status_get(host,&overall));if(overall.capture_phase==3)break;std::this_thread::sleep_for(std::chrono::milliseconds(2));}while(std::chrono::steady_clock::now()<captureDeadline);
   premidi::require(overall.capture_phase==3&&overall.capture_frames==rate/5&&overall.capture_start>rate,"Stream capture/count-in clock mismatch");
   check(premidi_audio_capture_finish(host,0));
   premidi::require(premidi_audio_capture_size(host)==rate/5,"Stream take lost latency-compensated frames");
   check(premidi_audio_stream_stop(host,owner+3,revision+4));
   premidi::require(allocations.load()==0,"Song revision or capture callback allocated");
   std::cout<<"{\"qualified\":true,\"rate\":"<<rate
    <<",\"pages\":"<<pages.size()<<",\"published\":"<<streamedPages
    <<",\"backpressure\":"<<backpressure<<",\"acknowledgedFrames\":"<<streamedFrames
    <<",\"callbacks\":"<<overall.callbacks<<",\"peak\":"<<overall.peak_million
    <<",\"callbackAllocations\":"<<allocations.load()<<"}\n";
   premidi_audio_destroy(host);
  }catch(...){premidi_audio_destroy(host);throw;}
  return 0;
 }catch(const std::exception& error){
  audioScope=false;
  std::cerr<<"Native Song device stream failed: "<<error.what()<<"\n";
  return 1;
 }
}
