// Qualify genuinely new page instruction ingestion by ONE native Session.
// This is a standalone C++ callback/PCM proof, not yet a shipping DeviceHost
// API. All validated PreparedPageLease objects remain control-owned through
// the test; page metadata retirement cannot invalidate borrowed Voice memory.
#include "prepared-page.hpp"
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <iterator>
#include <new>
#include <string>
#include <vector>
static thread_local bool callbackScope=false;
static std::atomic<unsigned> callbackAllocations{0};
__attribute__((noinline)) void* operator new(std::size_t count){
 if(callbackScope)callbackAllocations.fetch_add(1,std::memory_order_relaxed);
 if(auto* result=std::malloc(count))return result;
 throw std::bad_alloc();
}
__attribute__((noinline)) void operator delete(void* data)noexcept{std::free(data);}
__attribute__((noinline)) void operator delete(void* data,std::size_t)noexcept{std::free(data);}
__attribute__((noinline)) void* operator new[](std::size_t bytes){return ::operator new(bytes);}
__attribute__((noinline)) void operator delete[](void* data)noexcept{std::free(data);}
__attribute__((noinline)) void operator delete[](void* data,std::size_t)noexcept{std::free(data);}
static std::vector<std::uint8_t> readFile(const char* path){
 std::ifstream stream(path,std::ios::binary);
 if(!stream)throw std::runtime_error("Missing native Song packet fixture");
 return {(std::istreambuf_iterator<char>(stream)),{}};
}
struct Page{
 std::shared_ptr<premidi::PreparedPageLease> lease;
 std::uint64_t start=0,end=0;
};
int main(int argc,char** argv){
 try{
  premidi::require(argc>=8&&(argc-4)%4==0,
   "Usage: stream-check rate frames full-packet start end onsets page-packet ...");
  const unsigned rate=static_cast<unsigned>(std::stoul(argv[1]));
  const unsigned frames=static_cast<unsigned>(std::stoul(argv[2]));
  premidi::require(rate>=8000&&rate<=192000&&frames>0&&frames<=rate*8,
   "Invalid native Song stream fixture size");
  const auto source=readFile(argv[3]);
  const auto empty=std::vector<std::uint8_t>{0x50,0x4d,0x53,0x31,0,0,0,0};
  premidi::Session baseline(source.data(),source.size(),rate,
   static_cast<double>(frames)/rate,0);
  premidi::Session streamed(empty.data(),empty.size(),rate,1,0);
  streamed.enableStreaming();
  for(const auto& note:baseline.notes)
   if(note.plan.delayMix>0)streamed.registerStreamingDelay(
    note.plan.delayMix,note.plan.delayTime,note.plan.delayFeedback);
  premidi::PageMailbox mailbox(91,7,0);
  std::vector<Page> pages;
  std::uint64_t last=0;
  for(int at=4;at<argc;at+=4){
   const auto start=std::stoull(argv[at]),end=std::stoull(argv[at+1]);
   const auto count=static_cast<unsigned>(std::stoul(argv[at+2]));
   premidi::require(start==last&&end>start&&end<=frames,
    "Page fixture has a gap, overlap or reversed time");
   const auto bytes=readFile(argv[at+3]);
   const premidi::PageDescriptor proposal{91,7,pages.size()+1,start,end,
    count,0,false,at+4==argc};
   auto lease=std::make_shared<premidi::PreparedPageLease>(
    proposal,bytes.data(),bytes.size(),rate);
   pages.push_back({std::move(lease),start,end});
   last=end;
  }
  premidi::require(last==frames,"Native Song pages do not cover the complete PCM range");
  std::vector<float> reference(static_cast<std::size_t>(frames)*2);
  std::vector<float> result(reference.size());
  for(unsigned at=0;at<frames;){
   const auto count=std::min(128u,frames-at);
   unsigned budget=premidi::maxOnsets;
   callbackScope=true;
   baseline.process(reference.data()+2*at,count,false,budget);
   callbackScope=false;
   premidi::require(!baseline.fault.load(),"Baseline native PCM Session failed");
   at+=count;
  }
  unsigned published=0,activated=0,retirements=0;
  const auto publish=[&]{
   retirements+=mailbox.reclaim();
   while(published<pages.size()){
    if(!mailbox.publish(pages[published].lease->descriptor()))break;
    ++published;
   }
  };
  unsigned at=0,blocks=0,split=0;
  while(at<frames){
   publish();
   unsigned remaining=std::min(128u,frames-at);
   unsigned budget=premidi::maxOnsets;
   while(remaining){
    callbackScope=true;
    const auto phase=mailbox.advance(at);
    if(phase==premidi::PageResult::playing&&
       mailbox.ackSequence()!=activated){
     activated=static_cast<unsigned>(mailbox.ackSequence());
     const auto& page=pages.at(activated-1);
     // Prepared notes are immutable and must not be freed until every Voice
     // has completed its release, regardless of PageMailbox reclamation.
     const bool accepted=streamed.activateStreamPage(
      page.lease->descriptor(),page.lease->resources().notes);
     if(!accepted){
      callbackScope=false;throw std::runtime_error(
       "Native stream Session rejected a validated page");
     }
    }
    const auto count=phase==premidi::PageResult::playing?
     mailbox.framesUntilBoundary(at,remaining):0u;
    bool okay=false;
    if(count){
     streamed.process(result.data()+2*at,count,false,budget);
     okay=!streamed.fault.load()&&streamed.position.load()==at+count;
    }
    callbackScope=false;
    premidi::require(phase==premidi::PageResult::playing&&count&&okay,
     "Native stream page underrun, callback fault or time discontinuity");
    if(count<remaining)++split;
    at+=count;remaining-=count;
   }
   ++blocks;
  }
  callbackScope=true;
  const auto terminal=mailbox.advance(frames);
  callbackScope=false;
  premidi::require(terminal==premidi::PageResult::finished&&
   mailbox.ackSequence()==pages.size(),"Native stream did not terminate at its final page");
  retirements+=mailbox.reclaim();
  premidi::require(retirements==pages.size(),
   "Native stream metadata was not reclaimed independently of active Voices");
  premidi::require(!callbackAllocations.load(),
   "Native Song stream allocated on the real-time callback");
  double max=0,sum=0,peak=0;
  for(std::size_t i=0;i<result.size();i++){
   premidi::require(std::isfinite(result[i]),"Nonfinite native streamed PCM");
   const double delta=result[i]-reference[i];
   max=std::max(max,std::abs(delta));sum+=delta*delta;
   peak=std::max(peak,std::abs(static_cast<double>(result[i])));
  }
  const double rms=std::sqrt(sum/result.size());
  premidi::require(max<=.0001&&rms<=.00002&&peak>0,
   "Native streamed Voice/sample PCM differs from uninterrupted Session");
  std::cout<<"{\"qualified\":true,\"pages\":"<<pages.size()
   <<",\"newPageActivations\":"<<activated<<",\"callbackBlocks\":"<<blocks
   <<",\"callbackSplits\":"<<split<<",\"peak\":"<<peak
   <<",\"maxPcm\":"<<max<<",\"rmsPcm\":"<<rms
   <<",\"callbackAllocations\":"<<callbackAllocations.load()
   <<",\"dynamicNativeNotes\":"<<streamed.admitted<<"}\n";
  return 0;
 }catch(const std::exception& error){
  callbackScope=false;
  std::cerr<<"Native persistent Song stream failed: "<<error.what()<<"\n";
  return 1;
 }
}
