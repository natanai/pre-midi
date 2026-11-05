#pragma once
// Prepared Song-page publication contract. NOT connected to the native mixer
// yet: only the future stateful Session may consume a page's audio resources.
// Exactly one producer (native control) and one consumer (audio callback).
// Callback methods never allocate, acquire locks, parse packets or free memory.
#include <array>
#include <atomic>
#include <cstdint>
#include <stdexcept>
#include <algorithm>

namespace premidi {
enum class PagePhase : unsigned {free=0,ready=1,active=2,retired=3};
enum class PageResult : unsigned {playing=1,finished=2,fault=3};
enum class PageError : unsigned {none=0,underrun=1,late=2,stale=3,order=4};
static_assert(std::atomic<std::uint64_t>::is_always_lock_free,
 "Native page acknowledgment counters must be lock-free");
static_assert(std::atomic<PagePhase>::is_always_lock_free,
 "Native page slot phases must be lock-free");

struct PageDescriptor {
 std::uint64_t owner=0,revision=0,sequence=0,startFrame=0,endFrame=0;
 unsigned onsets=0,resources=0;
 bool prepared=false,last=false;
};

class PageMailbox final {
 struct Slot {
  std::atomic<PagePhase> phase{PagePhase::free};
  PageDescriptor descriptor{};
 };
 std::array<Slot,3> slots{};
 // Owner and revision are transport epochs, not Sound or Track identities.
 const std::uint64_t originalOwner,originalRevision,originFrame;
 std::atomic<std::uint64_t> validOwner,validRevision;
 std::atomic<std::uint64_t> acknowledged{0},acknowledgedEnd{0};
 std::atomic<PageError> failure{PageError::none};
 // Producer-private publication order; callback never reads these fields.
 std::uint64_t publishedSequence=0,publishedEnd=0;
 bool publishedLast=false;
 // Consumer-private state; producer only observes atomic slot phases.
 Slot* current=nullptr;
 std::uint64_t consumedSequence=0;
 bool completed=false;

 PageResult fail(PageError error)noexcept{
  failure.store(error,std::memory_order_release);
  return PageResult::fault;
 }
 public:
  PageMailbox(std::uint64_t owner,std::uint64_t revision,std::uint64_t startFrame)
   :originalOwner(owner),originalRevision(revision),originFrame(startFrame),
    validOwner(owner),validRevision(revision),publishedEnd(startFrame){
   if(!owner||!revision)throw std::invalid_argument("Native page owner and revision must be nonzero");
  }
  PageMailbox(const PageMailbox&)=delete;
  PageMailbox& operator=(const PageMailbox&)=delete;

  // Control-thread only. A false return means bounded-slot backpressure;
  // the page and publication sequence have not changed.
  bool publish(const PageDescriptor& page){
   if(failure.load(std::memory_order_acquire)!=PageError::none)
    throw std::invalid_argument("Faulted native page transport cannot accept more pages");
   if(publishedLast)throw std::invalid_argument("Native page cannot follow the terminal page");
   if(page.owner!=originalOwner||page.revision!=originalRevision||
      validOwner.load(std::memory_order_acquire)!=originalOwner||
      validRevision.load(std::memory_order_acquire)!=originalRevision)
    throw std::invalid_argument("Stale native page owner or revision");
   if(page.sequence!=publishedSequence+1||page.startFrame!=publishedEnd||
      page.endFrame<=page.startFrame)
    throw std::invalid_argument("Native pages must be sequenced and contiguous");
   if(page.onsets>4096||page.resources>512||!page.prepared)
    throw std::invalid_argument("Native page resources or event budget are not prepared");
   for(auto& slot:slots)if(slot.phase.load(std::memory_order_acquire)==PagePhase::free){
    slot.descriptor=page;
    // Release publishes a complete immutable descriptor to callback.
    slot.phase.store(PagePhase::ready,std::memory_order_release);
    publishedSequence=page.sequence;publishedEnd=page.endFrame;
    publishedLast=page.last;
    return true;
   }
   return false;
  }

  // Control-thread only. Reclamation is safe only after the callback has
  // relinquished a page by storing retired with release semantics.
  unsigned reclaim()noexcept{
   unsigned released=0;
   for(auto& slot:slots)if(slot.phase.load(std::memory_order_acquire)==PagePhase::retired){
    slot.phase.store(PagePhase::free,std::memory_order_release);
    ++released;
   }
   return released;
  }

  // Control edits/stops invalidate the entire mailbox. A fresh revision gets
  // a new mailbox; the callback detects a mismatch and fails closed.
  void invalidate(std::uint64_t owner,std::uint64_t revision)noexcept{
   validOwner.store(owner,std::memory_order_release);
   validRevision.store(revision,std::memory_order_release);
  }

  // Audio-thread only, called at the exact absolute frame the mixer is about
  // to render. A page activation never resets existing voice/delay state.
  // The future Session will render at most framesUntilBoundary() per call.
  PageResult advance(std::uint64_t frame)noexcept{
   if(failure.load(std::memory_order_relaxed)!=PageError::none)
    return PageResult::fault;
   if(validOwner.load(std::memory_order_acquire)!=originalOwner||
      validRevision.load(std::memory_order_acquire)!=originalRevision)
    return fail(PageError::stale);
   if(completed)return PageResult::finished;
   if(current){
    const auto end=current->descriptor.endFrame;
    if(frame<end)return PageResult::playing;
    if(frame>end)return fail(PageError::late);
    const bool last=current->descriptor.last;
    current->phase.store(PagePhase::retired,std::memory_order_release);
    current=nullptr;
    if(last){completed=true;return PageResult::finished;}
   }
   Slot* ready=nullptr;
   for(auto& slot:slots)
    if(slot.phase.load(std::memory_order_acquire)==PagePhase::ready&&
       slot.descriptor.sequence==consumedSequence+1){ready=&slot;break;}
   if(!ready)return fail(PageError::underrun);
   const auto& page=ready->descriptor;
   if(page.owner!=originalOwner||page.revision!=originalRevision||
      page.sequence!=consumedSequence+1)return fail(PageError::order);
   if(page.startFrame!=frame)return fail(page.startFrame<frame?PageError::late:PageError::underrun);
   current=ready;
   current->phase.store(PagePhase::active,std::memory_order_release);
   consumedSequence=page.sequence;
   acknowledgedEnd.store(page.endFrame,std::memory_order_release);
   acknowledged.store(consumedSequence,std::memory_order_release);
   return PageResult::playing;
  }

  // Audio-thread only. The caller MUST split at the reported boundary and
  // call advance() again before rendering the following frame.
  unsigned framesUntilBoundary(std::uint64_t frame,unsigned requested)const noexcept{
   if(!current||completed||failure.load(std::memory_order_relaxed)!=PageError::none)
    return 0;
   const auto end=current->descriptor.endFrame;
   return frame>=end?0:static_cast<unsigned>(
    std::min<std::uint64_t>(requested,end-frame));
  }
  std::uint64_t ackSequence()const noexcept{return acknowledged.load(std::memory_order_acquire);}
  std::uint64_t ackEndFrame()const noexcept{return acknowledgedEnd.load(std::memory_order_acquire);}
  PageError fault()const noexcept{return failure.load(std::memory_order_acquire);}
};
} // namespace premidi
