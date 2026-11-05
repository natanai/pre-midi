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
  premidi::Session reference(full.data(),full.size(),rate,static_cast<double>(frames)/rate,0);
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
     note.plan.delayTime,note.plan.delayFeedback));
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
   check(premidi_audio_stream_stop(host,owner,revision));
   check(premidi_audio_stream_status_get(host,&status));
   premidi::require(status.state==premidi::stopped,
    "Stopping a stream did not release its native owner");
   const int stale=premidi_audio_stream_start(host,owner,revision);
   premidi::require(stale<0,"Stale Song owner restarted a cancelled stream");
   std::cout<<"{\"qualified\":true,\"rate\":"<<rate
    <<",\"pages\":"<<pages.size()<<",\"published\":"<<published
    <<",\"backpressure\":"<<backpressure<<",\"acknowledged\":"<<overall.position
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
