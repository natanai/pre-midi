#pragma once
// Control-thread-only proof of real prepared Song page resource ownership.
// This is a validated immutable source of PreparedNote objects, oscillator
// WaveBanks, DriveRecipes, LFO tables, delay recipes and decoded sample PCM.
// Session remains the *existing* native parser/preparer: no duplicate synth
// parameters, alternate DSP engine or callback-side packet decoding.
//
// StreamTransport borrows these prepared notes while the control thread owns
// this entire lease
// until ALL active voices, delayed starts and shared effect tails have ended.
// Retirement of PageMailbox metadata alone cannot release this object.
#include "session.hpp"
#include "page-mailbox.hpp"
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include <memory>
#include <set>
#include <stdexcept>

namespace premidi {
class PreparedPageLease final {
 PageDescriptor metadata_{};
 std::unique_ptr<Session> backing;
 std::uint64_t keepThroughFrame_=0;
 unsigned actualResources_=0;
 public:
  PreparedPageLease(PageDescriptor metadata,const std::uint8_t* packet,
   std::size_t length,unsigned rate,const SampleStore& externalSamples={})
   :metadata_(metadata){
   require(metadata.owner>0&&metadata.revision>0&&metadata.sequence>0,
    "Native prepared page needs a valid transport owner, revision and sequence");
   require(metadata.startFrame<metadata.endFrame&&rate>=8000&&rate<=192000,
    "Native prepared page frame interval or sample rate is invalid");
   require(metadata.endFrame-metadata.startFrame<=std::uint64_t(rate)*600,
    "Native prepared page exceeds its bounded local clock");
   require(metadata.onsets<=4096&&!metadata.prepared&&metadata.resources==0,
    "Native prepared page has unsafe or fabricated resource metadata");
   require(packet&&length>=8&&length<=512u*1024u*1024u,
    "Native prepared page has no bounded execution packet");
   // Bounded page-local Session is a preparation-only backing resource;
   // it must NEVER be swapped into DeviceHost::Lane as a new mixer.
   backing=std::make_unique<Session>(packet,length,rate,600,0,externalSamples);
   require(backing->notes.size()==metadata.onsets,
    "Native prepared page onset count does not match decoded voice packets");
   std::set<const WaveBank*> waveBanks;
   std::set<const DriveRecipe*> driveRecipes;
   std::set<const SineLfoTable*> lfoTables;
   std::set<const SampleData*> samples;
   std::set<int> delayRecipes;
   keepThroughFrame_=metadata.endFrame;
   for(const auto& note:backing->notes){
    const auto& plan=note.plan;
    const auto endSeconds=plan.graphEnd+Delay::tail(
     plan.delayMix,plan.delayTime,plan.delayFeedback,plan.delayTone);
    require(std::isfinite(endSeconds)&&endSeconds>=plan.start,
     "Native prepared page has a nonfinite or reversed Voice/effect tail");
    // Match Session::spawn's arithmetic order on the absolute clock. A
    // page-local ceil followed by integer addition can otherwise retire a
    // fractional-boundary resource one frame before its final Voice sample.
    const double shift=static_cast<double>(metadata.startFrame)/rate;
    const auto absoluteEnd=std::ceil(((plan.graphEnd+shift)+Delay::tail(
     plan.delayMix,plan.delayTime,plan.delayFeedback,plan.delayTone))*rate-1e-9);
    require(std::isfinite(absoluteEnd)&&absoluteEnd>=0&&
     absoluteEnd<static_cast<double>(std::numeric_limits<std::uint64_t>::max()-1),
     "Native prepared page resource lifetime is out of range");
    keepThroughFrame_=std::max(keepThroughFrame_,static_cast<std::uint64_t>(absoluteEnd)+1);
    if(plan.kind){
     require(plan.sample,"Native page sample/vocal plan lacks a pinned decoded asset");
     samples.insert(plan.sample);
    }else for(const auto* bank:note.banks)if(bank)waveBanks.insert(bank);
    if(note.prepared.drive)driveRecipes.insert(note.prepared.drive);
    if(note.prepared.lfoBank)lfoTables.insert(note.prepared.lfoBank);
    if(note.delay>=0)delayRecipes.insert(note.delay);
   }
   const auto count=waveBanks.size()+driveRecipes.size()+lfoTables.size()+
    samples.size()+delayRecipes.size();
   require(count<=512,"Native prepared page exceeds 512 bounded DSP resources");
   actualResources_=static_cast<unsigned>(count);
   metadata_.resources=actualResources_;
   // Only after Session has parsed and pinned the *actual* resources.
   metadata_.prepared=true;
  }
  PreparedPageLease(const PreparedPageLease&)=delete;
  PreparedPageLease& operator=(const PreparedPageLease&)=delete;
  const PageDescriptor& descriptor()const noexcept{return metadata_;}
  const Session& resources()const noexcept{return *backing;}
  unsigned resourceCount()const noexcept{return actualResources_;}
  std::uint64_t keepThroughFrame()const noexcept{return keepThroughFrame_;}
};
}
