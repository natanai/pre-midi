// Bounded proof of in-process C++ rendering. Never substitutes for project playback.
#include "voice.hpp"
extern "C" int premidi_fixture(float* output, unsigned frames) noexcept {
 if (!output || frames != 24000) return 1;
 premidi::Plan plan;
 plan.oscillators[0].level=.7;plan.sourceEnd=.3;plan.graphEnd=.5;
 plan.eventCount=4;plan.events[0]={0,0,0};plan.events[1]={1,.01,.2};
 plan.events[2]={0,.2,.2};plan.events[3]={1,.3,0};
 premidi::Voice voice(plan,48000);
 voice.process(output,frames);
 for(unsigned i=0;i<frames*2;i++)if(!std::isfinite(output[i]))return 2;
 return 0;
}
