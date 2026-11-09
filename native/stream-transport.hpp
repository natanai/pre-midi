#pragma once
// Control-owned page payloads + lock-free callback binding for ONE persistent
// native Session. This is the bridge between the already-qualified metadata
// mailbox and actual immutable C++ PreparedPageLease resources.
//
// Control may construct, parse, publish and reclaim on its own thread.
// The audio callback must not allocate, parse, acquire locks, retain/release
// smart pointers, or destroy any DSP/PCM resource.
#include "prepared-page.hpp"
#include <array>
#include <atomic>
#include <cstdint>
#include <deque>
#include <limits>
#include <memory>
#include <stdexcept>
#include <vector>
namespace premidi {
class StreamTransport final {
 struct Ready {
  std::atomic<const PreparedPageLease*> pointer{nullptr};
  std::atomic<std::uint64_t> sequence{0};
 };
 struct Held {
  std::uint64_t sequence=0;
  std::unique_ptr<PreparedPageLease> resource;
 };
 const unsigned rate_;
 const std::uint64_t owner_;
 PageMailbox mailbox;
 std::unique_ptr<Session> player;
 std::array<Ready,3> published{};
 // These are control-only owners. Their addresses are stable on the heap.
 std::deque<Held> held;
 std::uint64_t nextSequence=1,activatedSequence=0;
 std::atomic<bool> armed{false};
 bool terminalPublished=false;
 std::atomic<unsigned> renderFault{0};
 std::atomic<bool> paused{false};
 bool controlStarted=false;
public:
 unsigned lastLeadFrames=0,lastMusicFrames=0;
private:

 const PreparedPageLease* find(std::uint64_t sequence)const noexcept{
  const auto& slot=published[(sequence-1)%published.size()];
  if(slot.sequence.load(std::memory_order_acquire)!=sequence)return nullptr;
  return slot.pointer.load(std::memory_order_acquire);
 }
 public:
 StreamTransport(std::uint64_t owner,std::uint64_t revision,unsigned rate,bool withProcessing=false)
  :rate_(rate),owner_(owner),mailbox(owner,revision,0){
  require(rate>=8000&&rate<=192000,"Invalid native streaming output sample rate");
  constexpr std::uint8_t empty[]{0x50,0x4d,0x53,0x31,0,0,0,0};
  player=std::make_unique<Session>(empty,sizeof(empty),rate,1,0);
  player->enableStreaming(withProcessing);
 }
 StreamTransport(const StreamTransport&)=delete;
 StreamTransport& operator=(const StreamTransport&)=delete;
 unsigned rate()const noexcept{return rate_;}
 std::uint64_t owner()const noexcept{return owner_;}
 unsigned state()const noexcept{return paused.load(std::memory_order_acquire)?
  static_cast<unsigned>(premidi::paused):player->stateView.load(std::memory_order_acquire);}
 void setPaused(bool value)noexcept{paused.store(value,std::memory_order_release);}
 std::uint64_t acknowledgment()const noexcept{return mailbox.ackSequence();}
 std::uint64_t acknowledgmentEnd()const noexcept{return mailbox.ackEndFrame();}
 std::uint64_t position()const noexcept{return player->position.load(std::memory_order_acquire);}
 std::uint64_t active()const noexcept{return player->active.load(std::memory_order_acquire);}
 std::uint64_t releasedThrough()const noexcept{return player->releasedThrough.load(std::memory_order_acquire);}
 PageError mailboxFault()const noexcept{return mailbox.fault();}
 unsigned fault()const noexcept{
  const auto local=renderFault.load(std::memory_order_acquire);
  return local?local:static_cast<unsigned>(mailbox.fault());
 }
 bool ready()const noexcept{return nextSequence>1;}
 // Control-only preparation, before page one is submitted.
 int registerDelay(double mix,double time,double feedback,double tone=20000,bool ping=false){
  require(!controlStarted&&nextSequence==1,
   "Native shared effects must be prepared before the first Song page");
  return player->registerStreamingDelay(mix,time,feedback,tone,ping);
 }
 // Control-only: page packet can be PMS1 or PMS2 with bound registered audio.
 // Backpressure returns false without publishing/incrementing sequence or
 // dropping a note; callers retry the SAME page after checking its ACK.
 bool publish(const PageDescriptor& proposed,const std::uint8_t* packet,
  std::size_t length,const SampleStore& assets={}){
  require(!renderFault.load(std::memory_order_acquire)&&
   mailbox.fault()==PageError::none,
   "Faulted native Song stream cannot accept new pages");
  require(!terminalPublished,"Native Song stream already has its final page");
  require(proposed.sequence==nextSequence&&proposed.onsets<=4096&&
   !proposed.prepared&&proposed.resources==0,
   "Native Song stream page sequence or resource claim is invalid");
  // Reclaim only after callback ACK + voice/effect tail watermark. No
  // PageMailbox metadata retirement can destroy a still-sounding Voice.
  reclaim();
  const std::size_t index=(nextSequence-1)%published.size();
  auto& slot=published[index];
  const auto priorSequence=slot.sequence.load(std::memory_order_acquire);
  if(priorSequence&&priorSequence>=mailbox.ackSequence())return false;
  auto resource=std::make_unique<PreparedPageLease>(
   proposed,packet,length,rate_,assets);
  held.push_back({nextSequence,std::move(resource)});
  const auto priorPointer=slot.pointer.load(std::memory_order_acquire);
  slot.pointer.store(held.back().resource.get(),std::memory_order_release);
  slot.sequence.store(nextSequence,std::memory_order_release);
  bool accepted=false;
  try{accepted=mailbox.publish(held.back().resource->descriptor());}
  catch(...){
   slot.sequence.store(priorSequence,std::memory_order_release);
   slot.pointer.store(priorPointer,std::memory_order_release);
   held.pop_back();throw;
  }
  if(!accepted){
   slot.sequence.store(priorSequence,std::memory_order_release);
   slot.pointer.store(priorPointer,std::memory_order_release);
   held.pop_back();return false;
  }
  ++nextSequence;
  terminalPublished=proposed.last;
  return true;
 }
 // Control-only. Call frequently during playback, but no reclamation runs
 // on the audio thread. Nothing is freed until every note/effect has ended.
 unsigned reclaim(){
  const auto ack=mailbox.ackSequence();
  const auto safe=player->releasedThrough.load(std::memory_order_acquire);
  unsigned discarded=mailbox.reclaim(),resources=0;
  for(auto it=held.begin();it!=held.end();){
   if(it->sequence<ack&&it->resource->keepThroughFrame()<=safe){
    it=held.erase(it);++resources;
   }else ++it;
  }
  return discarded+resources;
 }
 // Control-only reconstruction, before publication to the callback. Every
 // sample uses the same Session/voice/effect state as audible streaming.
 bool advanceTo(std::uint64_t target){
  require(!armed.load(std::memory_order_acquire),"Cannot preroll a published Song stream");
  require(target>=position(),"Native stream reconstruction cannot rewind");
  controlStarted=true;
  std::array<float,2*renderBlock> scratch{};
  while(position()<target){
   const auto width=static_cast<unsigned>(std::min<std::uint64_t>(renderBlock,target-position()));
   unsigned budget=maxOnsets;
   if(!render(scratch.data(),width,budget)||state()==finished)return position()==target;
  }
  return true;
 }
 void countIn(double bpm,unsigned bars){player->countIn(bpm,bars);}
 std::uint64_t leadRemaining()const noexcept{return player->leadRemaining.load(std::memory_order_acquire);}
 // Control-only: invalidate before stopping/rebuilding on edit, seek, loop,
 // owner change, device loss or application shutdown.
 void invalidate(std::uint64_t owner,std::uint64_t revision)noexcept{
  mailbox.invalidate(owner,revision);
 }
 // Audio callback only, <=128 frames per call and one shared onset budget.
 // All notes/pages and delay recipes are already parsed/pinned by control.
 bool render(float* output,unsigned frames,unsigned& budget)noexcept{
  lastLeadFrames=lastMusicFrames=0;
  if(!output||frames>renderBlock||renderFault.load(std::memory_order_relaxed))return false;
  if(paused.load(std::memory_order_acquire)){
   std::fill(output,output+2*frames,0.f);
   return true;
  }
  unsigned done=0;
  while(done<frames){
   if(leadRemaining()){
    const auto width=static_cast<unsigned>(std::min<std::uint64_t>(frames-done,leadRemaining()));
    player->process(output+2*done,width,false,budget);
    lastMusicFrames+=player->lastMusicFrames;done+=width;lastLeadFrames=done;continue;
   }
   const auto at=player->position.load(std::memory_order_relaxed);
   const auto status=mailbox.advance(at);
   if(status==PageResult::fault){renderFault.store(1,std::memory_order_release);break;}
   if(status==PageResult::finished){
    player->process(output+2*done,frames-done,false,budget);
    if(player->fault.load(std::memory_order_relaxed)){
     renderFault.store(2,std::memory_order_release);break;
    }
    lastMusicFrames+=player->lastMusicFrames;done=frames;break;
   }
   const auto sequence=mailbox.ackSequence();
   if(sequence!=activatedSequence){
    const auto* source=find(sequence);
    if(!source||!player->activateStreamPage(
      source->descriptor(),source->resources().notes)){
     renderFault.store(3,std::memory_order_release);break;
    }
    activatedSequence=sequence;
   }
   const auto width=mailbox.framesUntilBoundary(at,frames-done);
   if(!width){renderFault.store(4,std::memory_order_release);break;}
   player->process(output+2*done,width,false,budget);
   if(player->fault.load(std::memory_order_relaxed)||
      player->position.load(std::memory_order_relaxed)!=at+width){
    renderFault.store(5,std::memory_order_release);break;
   }
   lastMusicFrames+=player->lastMusicFrames;done+=width;
  }
  if(done!=frames){
   std::fill(output,output+2*frames,0.f);
   return false;
  }
  return true;
 }
 bool process(float* output,unsigned frames,unsigned& budget)noexcept{
  armed.store(true,std::memory_order_release);return render(output,frames,budget);
 }
};
} // namespace premidi
