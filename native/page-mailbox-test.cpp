// Standalone C++17 qualification for the prepared-page control/callback
// mailbox. No audio is rendered and the live Session is not yet pageable.
#include "page-mailbox.hpp"
#include <atomic>
#include <chrono>
#include <cstdlib>
#include <iostream>
#include <new>
#include <stdexcept>
#include <thread>
using premidi::PageDescriptor;
using premidi::PageError;
using premidi::PageMailbox;
using premidi::PageResult;
static thread_local bool callbackScope=false;
static std::atomic<unsigned> callbackAllocations{0};
__attribute__((noinline)) void* operator new(std::size_t bytes){
 if(callbackScope)callbackAllocations.fetch_add(1);
 if(auto* result=std::malloc(bytes))return result;
 throw std::bad_alloc();
}
void operator delete(void* data)noexcept{std::free(data);}
void operator delete(void* data,std::size_t)noexcept{std::free(data);}
__attribute__((noinline)) void* operator new[](std::size_t bytes){return ::operator new(bytes);}
void operator delete[](void* data)noexcept{std::free(data);}
void operator delete[](void* data,std::size_t)noexcept{std::free(data);}

static void check(bool ok,const char* message){if(!ok)throw std::runtime_error(message);}
static PageDescriptor page(unsigned seq,std::uint64_t begin,std::uint64_t end,bool last=false){
 return {91,7,seq,begin,end,4,2,true,last};
}
static void mustReject(PageMailbox& mailbox,PageDescriptor descriptor){
 bool rejected=false;
 try{mailbox.publish(descriptor);}catch(const std::invalid_argument&){rejected=true;}
 check(rejected,"Invalid page descriptor accepted");
}
int main(){
 try{
  {
   PageMailbox mailbox(91,7,0);
   const auto one=page(1,0,64),two=page(2,64,128),final=page(3,128,192,true);
   check(mailbox.publish(one)&&mailbox.publish(two)&&mailbox.publish(final),"Three bounded pages were not published");
   check(mailbox.advance(0)==PageResult::playing&&mailbox.ackSequence()==1,
    "First page must be acknowledged at the exact absolute frame");
   check(mailbox.framesUntilBoundary(0,128)==64&&mailbox.framesUntilBoundary(63,128)==1,
    "Callback did not split before the page boundary");
   check(mailbox.advance(63)==PageResult::playing,"Page should remain active before its end");
   check(mailbox.advance(64)==PageResult::playing&&mailbox.ackSequence()==2&&
    mailbox.ackEndFrame()==128,"Next page did not activate at its exact boundary");
   check(mailbox.reclaim()==1,"Retired page must be reclaimed by the control thread");
   check(mailbox.advance(128)==PageResult::playing&&mailbox.ackSequence()==3,
    "Terminal page was not activated");
   check(mailbox.advance(192)==PageResult::finished&&mailbox.fault()==PageError::none,
    "Terminal page must finish without an underrun");
   check(mailbox.advance(192)==PageResult::finished,"Finished transport must be sticky");
   check(mailbox.reclaim()==2,"Control must safely reclaim the remaining retired pages");
   mustReject(mailbox,page(4,192,256));
  }
  {
   PageMailbox mailbox(91,7,0);
   check(mailbox.publish(page(1,0,64))&&
    mailbox.publish(page(2,64,128))&&
    mailbox.publish(page(3,128,192)),"Mailbox capacity fixture failed");
   check(!mailbox.publish(page(4,192,256)),
    "All three control/callback slots must enforce backpressure");
   check(mailbox.advance(0)==PageResult::playing&&
    mailbox.advance(64)==PageResult::playing,"Capacity fixture did not advance");
   check(mailbox.reclaim()==1,"Retired capacity slot was not reclaimed");
   check(mailbox.publish(page(4,192,256,true)),
    "Reclaimed slot must accept the same not-yet-published sequence");
   check(mailbox.advance(128)==PageResult::playing&&
    mailbox.advance(192)==PageResult::playing&&
    mailbox.advance(256)==PageResult::finished,
    "Reclaimed slot changed page order or terminal state");
  }
  {
   PageMailbox mailbox(91,7,100);
   auto bad=page(1,100,120);bad.owner=92;mustReject(mailbox,bad);
   bad=page(1,100,120);bad.revision=8;mustReject(mailbox,bad);
   bad=page(2,100,120);mustReject(mailbox,bad);
   bad=page(1,101,120);mustReject(mailbox,bad);
   bad=page(1,100,100);mustReject(mailbox,bad);
   bad=page(1,100,120);bad.onsets=4097;mustReject(mailbox,bad);
   bad=page(1,100,120);bad.resources=513;mustReject(mailbox,bad);
   bad=page(1,100,120);bad.prepared=false;mustReject(mailbox,bad);
   check(mailbox.publish(page(1,100,120)),"Invalid publishes must not advance sequence");
   check(mailbox.advance(100)==PageResult::playing,"Valid page after rejection cannot disappear");
   check(mailbox.advance(120)==PageResult::fault&&mailbox.fault()==PageError::underrun,
    "Missing next page must be a fatal underrun, never silent playback");
   mustReject(mailbox,page(2,120,140));
  }
  {
   PageMailbox mailbox(91,7,0);
   check(mailbox.publish(page(1,0,32)),"Unable to prepare revision guard fixture");
   check(mailbox.advance(0)==PageResult::playing,"Initial page failed");
   mailbox.invalidate(91,8);
   check(mailbox.advance(16)==PageResult::fault&&mailbox.fault()==PageError::stale,
    "An edit revision cannot keep playing obsolete pages");
   mustReject(mailbox,page(2,32,64));
  }
  {
   PageMailbox mailbox(91,7,0);
   check(mailbox.publish(page(1,0,32)),"Unable to prepare late callback fixture");
   check(mailbox.advance(1)==PageResult::fault&&mailbox.fault()==PageError::late,
    "A callback arriving after the page start must fail closed");
  }
  // Exercise true SPSC publication/reclamation. Spin waiting is only in this
  // test harness; the callback's mailbox methods themselves never wait.
  {
   constexpr unsigned total=400;
   PageMailbox mailbox(91,7,0);
   std::atomic<unsigned> published{0},consumed{0};
   std::atomic<bool> cancelled{false};
   std::thread callback([&]{
    for(unsigned n=1;n<=total;n++){
     while(published.load(std::memory_order_acquire)<n){
      if(cancelled.load(std::memory_order_acquire))return;
      std::this_thread::yield();
     }
     callbackScope=true;
     const auto result=mailbox.advance((n-1)*64ull);
     const auto width=mailbox.framesUntilBoundary((n-1)*64ull,128);
     callbackScope=false;
     if(result!=PageResult::playing||width!=64){
      consumed.store(total+1,std::memory_order_release);return;
     }
     consumed.store(n,std::memory_order_release);
    }
    callbackScope=true;
    const auto complete=mailbox.advance(total*64ull);
    callbackScope=false;
    if(complete!=PageResult::finished)consumed.store(total+1,std::memory_order_release);
   });
   for(unsigned n=1;n<=total;n++){
    const auto next=page(n,(n-1)*64ull,n*64ull,n==total);
    const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(12);
    bool accepted=false;
    while(!(accepted=mailbox.publish(next))){
     mailbox.reclaim();
     if(consumed.load(std::memory_order_acquire)>total||
        std::chrono::steady_clock::now()>deadline){
      cancelled.store(true,std::memory_order_release);break;
     }
     std::this_thread::yield();
    }
    if(!accepted)break;
    published.store(n,std::memory_order_release);
   }
   callback.join();mailbox.reclaim();
   check(!cancelled.load()&&consumed.load()==total&&mailbox.ackSequence()==total&&
    mailbox.fault()==PageError::none,"Concurrent mailbox dropped or reordered a Song page");
  }
  check(callbackAllocations.load()==0,"Audio callback allocated during native page handoff");
  std::cout<<"{\"qualified\":true,\"spscPages\":400,\"allocations\":0,\"legacyLimitsUnchanged\":true}\n";
  return 0;
 }catch(const std::exception& error){
  std::cerr<<"native page mailbox: "<<error.what()<<"\n";
  return 1;
 }
}
