// Real-time-safe page payload binder proof. This deliberately keeps the
// tested raw C++ Session, but supplies NEW packets via control-thread
// StreamTransport::publish while the same mixer continues rendering PCM.
#include "stream-transport.hpp"
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <iterator>
#include <new>
#include <vector>
static thread_local bool callbackScope=false;
static std::atomic<unsigned> allocations{0};
__attribute__((noinline)) void* operator new(std::size_t n){
 if(callbackScope)allocations.fetch_add(1,std::memory_order_relaxed);
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
 if(!file)throw std::runtime_error("Missing prepared page source packet");
 return {(std::istreambuf_iterator<char>(file)),{}};
}
struct Fixture{
 premidi::PageDescriptor proposal;
 std::vector<std::uint8_t> packet;
};
int main(int argc,char** argv){
 try{
  premidi::require(argc>=8&&(argc-4)%4==0,
   "Usage: binder rate frames full-packet start end onsets page-packet ...");
  const auto rate=static_cast<unsigned>(std::stoul(argv[1]));
  const auto frames=static_cast<unsigned>(std::stoul(argv[2]));
  const auto full=read(argv[3]);
  premidi::require(rate>=8000&&rate<=192000&&frames>0&&frames<=rate*8,
   "Invalid native bound PCM fixture");
  premidi::Session baseline(full.data(),full.size(),rate,
   static_cast<double>(frames)/rate,0);
  premidi::StreamTransport stream(91,7,rate);
  for(const auto& n:baseline.notes)if(n.plan.delayMix>0)
   stream.registerDelay(n.plan.delayMix,n.plan.delayTime,n.plan.delayFeedback);
  std::vector<Fixture> pages;
  std::uint64_t last=0;
  for(int index=4;index<argc;index+=4){
   const auto start=std::stoull(argv[index]),end=std::stoull(argv[index+1]);
   premidi::require(start==last&&end>start&&end<=frames,
    "Native bound Song has a hole or overlap");
   const auto count=static_cast<unsigned>(std::stoul(argv[index+2]));
   pages.push_back({{91,7,pages.size()+1,start,end,count,0,false,
    index+4==argc},read(argv[index+3])});
   last=end;
  }
  premidi::require(last==frames,"Native bound Song range is incomplete");
  std::vector<float> expected(static_cast<std::size_t>(frames)*2);
  std::vector<float> actual(expected.size());
  for(unsigned at=0;at<frames;){
   const auto size=std::min(128u,frames-at);unsigned budget=premidi::maxOnsets;
   callbackScope=true;baseline.process(expected.data()+2*at,size,false,budget);
   callbackScope=false;
   premidi::require(!baseline.fault.load(),"Native reference failed");
   at+=size;
  }
  std::size_t published=0;
  unsigned backpressured=0,callbackBlocks=0;
  auto prepare=[&]{
   stream.reclaim();
   while(published<pages.size()){
    const auto& f=pages[published];
    if(!stream.publish(f.proposal,f.packet.data(),f.packet.size())){
     ++backpressured;break;
    }
    ++published;
   }
  };
  unsigned at=0;
  while(at<frames){
   prepare();
   const auto count=std::min(128u,frames-at);
   unsigned budget=premidi::maxOnsets;
   callbackScope=true;
   const bool ok=stream.process(actual.data()+2*at,count,budget);
   callbackScope=false;
   premidi::require(ok&&!stream.fault()&&stream.position()==at+count,
    "Native bound Song had an underrun, stale page or callback gap");
   at+=count;++callbackBlocks;
  }
  premidi::require(stream.acknowledgment()==pages.size(),
   "New page resources were not acknowledged in exact order");
  premidi::require(!allocations.load(),
   "Native resource binder allocated while the audio callback was running");
  double max=0,squared=0,peak=0;
  for(std::size_t i=0;i<actual.size();i++){
   premidi::require(std::isfinite(actual[i]),"Nonfinite native bound Song PCM");
   const double difference=actual[i]-expected[i];
   max=std::max(max,std::abs(difference));
   squared+=difference*difference;
   peak=std::max(peak,std::abs(static_cast<double>(actual[i])));
  }
  const auto rms=std::sqrt(squared/actual.size());
  premidi::require(max<=.0001&&rms<=.00002&&peak>0,
   "Native page payload binding altered PCM relative to the original mixer");
  // No pointer is reclaimed based solely on the metadata ACK.
  stream.reclaim();
  std::cout<<"{\"qualified\":true,\"pages\":"<<pages.size()
   <<",\"boundPackets\":"<<published<<",\"acknowledged\":"<<stream.acknowledgment()
   <<",\"callbackBlocks\":"<<callbackBlocks<<",\"backpressure\":"<<backpressured
   <<",\"maxPcm\":"<<max<<",\"rmsPcm\":"<<rms
   <<",\"peak\":"<<peak<<",\"callbackAllocations\":"<<allocations.load()<<"}\n";
  return 0;
 }catch(const std::exception& error){
  callbackScope=false;
  std::cerr<<"Native Song stream binder failure: "<<error.what()<<"\n";
  return 1;
 }
}
