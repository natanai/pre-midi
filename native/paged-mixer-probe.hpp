#pragma once
// Proof of page-clock integration with the EXISTING stateful native mixer.
// Intentionally does not accept streamed PreparedNote payloads yet: the same
// prevalidated single Session owns all instructions, samples, oscillator banks,
// active Voices, filter history and delay buses for the entire test. PageMailbox
// restricts *when* that one Session may process samples. The production 600 s /
// 4096-onset preflight remains unchanged.
#include "session.hpp"
#include "page-mailbox.hpp"
#include <algorithm>
#include <cstdint>

namespace premidi {
class PagedMixerProbe final {
 Session& mixer;
 PageMailbox& pages;
 public:
  PagedMixerProbe(Session& session,PageMailbox& mailbox)noexcept:mixer(session),pages(mailbox){}

  // Audio callback only. Never allocate, wait, parse, update page ownership
  // or recreate the mixer. Shares one onset budget across a split callback.
  bool process(float* output,unsigned frames,unsigned& onsetBudget)noexcept{
   if(!output)return false;
   unsigned done=0;
   while(done<frames){
    const auto at=mixer.position.load(std::memory_order_relaxed);
    const auto state=pages.advance(at);
    if(state==PageResult::finished){
     std::fill(output+2*done,output+2*frames,0.f);
     return true;
    }
    if(state!=PageResult::playing)break;
    const unsigned count=pages.framesUntilBoundary(at,frames-done);
    if(!count)break;
    mixer.process(output+2*done,count,false,onsetBudget);
    const auto after=mixer.position.load(std::memory_order_relaxed);
    // There is no room for a silent, skipped, duplicated or backwards frame.
    if(mixer.fault.load(std::memory_order_relaxed)||after-at!=count)break;
    done+=count;
   }
   if(done!=frames){
    std::fill(output,output+2*frames,0.f);
    return false;
   }
   return true;
  }
};
}
