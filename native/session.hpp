#pragma once
#include "plan-packet.hpp"
#include <atomic>
#include <memory>
#include <optional>
#include <vector>
namespace premidi {
constexpr unsigned voiceLimit=64,retireLimit=64,renderBlock=128,maxOnsets=256;
enum Playback:unsigned{stopped=0,playing=1,paused=2,finished=3,failed=4};
struct PreparedNote {Plan plan;std::array<const WaveBank*,2> banks{};VoicePreparation prepared;};
struct Slot {
 std::optional<Voice> voice;Plan plan;std::array<const WaveBank*,2> banks{};
 std::uint64_t start=0,off=0,end=0,order=0,fadeEnd=0;
};
// A session owns immutable instructions and banks. Its fixed-size mixer state
// belongs exclusively to the callback after publication. Destruction is control work.
class Session {
 struct Bank {unsigned shape;std::array<double,32> harmonics;std::unique_ptr<WaveBank> value;};
 std::vector<Bank> banks;
 std::array<Slot,voiceLimit> voices;
 std::array<Slot,retireLimit> retiring;
 std::array<std::size_t,2> next{};std::array<std::uint64_t,2> cycles{0,1};
 std::uint64_t cursor=0,serial=0,stopCycle=0;bool wasLoop=false;
 unsigned fadeLeft=0,fadeIn=0,afterFade=playing,error=0;
 std::uint64_t frameAt(double seconds)const noexcept{return static_cast<std::uint64_t>(std::ceil(seconds*rate-1e-9));}
 void expire(std::uint64_t at)noexcept{
  for(auto& s:voices)if(s.voice&&s.end<=at)s.voice.reset();
  for(auto& s:retiring)if(s.voice&&s.fadeEnd<=at)s.voice.reset();
 }
 std::uint64_t upcoming(unsigned stream,bool loop)const noexcept{
  if(next[stream]>=notes.size()||(!loop&&cycles[stream]>stopCycle))return UINT64_MAX;
  return frameAt(cycles[stream]*cycleSeconds+notes[next[stream]].plan.start);
 }
 void advance(unsigned stream,bool loop)noexcept{
  if(++next[stream]>=notes.size()&&loop){next[stream]=0;cycles[stream]+=2;}
 }
 void spawn(const PreparedNote& note,std::uint64_t cycle,std::uint64_t at)noexcept{
  Slot* free=nullptr;for(auto& s:voices)if(!s.voice){free=&s;break;}
  if(!free){
   free=&voices[0];for(auto& s:voices){
    const bool released=s.off<=at,priorReleased=free->off<=at;
    if((released&&!priorReleased)||(released==priorReleased&&(s.start<free->start||(s.start==free->start&&s.order<free->order))))free=&s;
   }
   // A source stolen before its first sample is cancelled, not faded in place.
   if(free->start<at){
    Slot* tail=nullptr;for(auto& s:retiring)if(!s.voice){tail=&s;break;}
    if(!tail){error=1;return;}
    *tail=*free;tail->fadeEnd=std::min(tail->end,at+fadeFrames);
   }
   stolen++;
  }
  free->plan=note.plan;const double shift=cycle*cycleSeconds;
  auto& p=free->plan;p.start+=shift;p.off+=shift;p.sourceEnd+=shift;p.graphEnd+=shift;
  for(unsigned i=0;i<p.eventCount;i++)p.events[i].time+=shift;
  for(unsigned i=0;i<p.automationCount;i++)p.automation[i].time+=shift;
  free->banks=note.banks;free->start=at;free->off=frameAt(p.off);free->end=frameAt(p.graphEnd);free->order=++serial;
  free->voice.emplace(p,rate,free->banks,at,&note.prepared);admitted++;
 }
 void mix(float* output,unsigned frames)noexcept{
  std::array<float,2*renderBlock> scratch{};
  for(auto& s:voices)if(s.voice){s.voice->process(scratch.data(),frames);for(unsigned i=0;i<2*frames;i++)output[i]+=scratch[i]*.85f;}
  for(auto& s:retiring)if(s.voice){s.voice->process(scratch.data(),frames);for(unsigned i=0;i<frames;i++){
   const float gain=cursor+i<s.fadeEnd?static_cast<float>(s.fadeEnd-cursor-i)/fadeFrames:0;
   output[2*i]+=scratch[2*i]*gain*.85f;output[2*i+1]+=scratch[2*i+1]*gain*.85f;
  }}
 }
 void reconstruct(Slot& s,std::uint64_t target){
  if(!s.voice)return;
  s.voice.emplace(s.plan,rate,s.banks,s.start);
  std::array<float,2*renderBlock> scratch{};
  for(auto at=s.start;at<target;){const auto count=static_cast<unsigned>(std::min<std::uint64_t>(renderBlock,target-at));s.voice->process(scratch.data(),count);at+=count;}
 }
public:
 const unsigned rate,fadeFrames;const double cycleSeconds;
 std::vector<PreparedNote> notes;
 unsigned state=playing;std::uint64_t admitted=0,stolen=0;
 std::atomic<std::uint64_t> position{0},active{0},fault{0},stateView{playing};
 Session(const std::uint8_t* data,std::size_t length,unsigned sr,double cycle,double seek):rate(sr),fadeFrames(std::max(1u,sr/200)),cycleSeconds(cycle){
  require(rate>=8000&&rate<=192000&&std::isfinite(cycle)&&cycle>=.05&&cycle<=600&&std::isfinite(seek)&&seek>=0&&seek<cycle,"Invalid native session timing");
  require(length<=16*1024*1024,"Native session exceeds 16 MiB");PacketReader in(data,length);
  require(in.u32()==0x31534d50,"Unknown native session transport");const auto count=in.u32();require(count<=4096,"Native preview supports at most 4096 note onsets per cycle");notes.reserve(count);
  for(unsigned n=0;n<count;n++){
   const auto size=in.u32();require(size<=16000,"Native voice packet too large");PreparedNote note;note.plan=readPlan(in.take(size),size,rate);
   require(note.plan.start<cycle*2,"Native strum offset exceeds one complete cycle");
   for(unsigned i=0;i<2;i++)if(note.plan.oscillators[i].wave||note.plan.version>=2){
    const auto& o=note.plan.oscillators[i];Bank* found=nullptr;for(auto& b:banks)if(b.shape==o.wave&&b.harmonics==o.harmonics){found=&b;break;}
    if(!found){require(banks.size()<32,"Native preview supports at most 32 unique oscillator banks");banks.push_back({o.wave,o.harmonics,std::make_unique<WaveBank>(o.wave,o.harmonics,rate)});found=&banks.back();}
    note.banks[i]=found->value.get();
   }
   note.prepared=Voice(note.plan,rate,note.banks).preparation();notes.push_back(note);
  }
  require(in.done(),"Trailing native session data");std::stable_sort(notes.begin(),notes.end(),[](const auto& a,const auto& b){return a.plan.start<b.plan.start;});
  // Fixed onset-work bound at the largest accepted callback. No dense project
  // can force an unbounded catch-up loop on the audio thread.
  for(std::size_t i=0,j=0;i<notes.size();i++){
   while(j<i&&notes[i].plan.start-notes[j].plan.start>8192./rate)j++;
   require(i-j<maxOnsets/2,"Native onset density exceeds the callback budget");
  }
  // Recreate allocation history without DSP work; then warm only surviving
  // voices on the control thread, preserving phase/filter/envelope on seek.
  cursor=frameAt(seek);
  while(next[0]<notes.size()&&frameAt(notes[next[0]].plan.start)<=cursor){const auto at=frameAt(notes[next[0]].plan.start);expire(at);spawn(notes[next[0]],0,at);next[0]++;require(!error,"Native retirement pool exceeded during seek");}
  expire(cursor);for(auto& s:voices)reconstruct(s,cursor);for(auto& s:retiring)reconstruct(s,cursor);
  position.store(cursor);fadeIn=0;
 }
 void command(unsigned command)noexcept{
  if(command==1||command==2){if(state==playing){fadeLeft=fadeFrames;afterFade=command==1?stopped:paused;}else if(command==1){state=stopped;cursor=0;for(auto& s:voices)s.voice.reset();for(auto& s:retiring)s.voice.reset();}}
  if(command==3&&state==paused){state=playing;fadeIn=fadeFrames;}
 }
 void process(float* output,unsigned frames,bool loop,unsigned& onsetBudget)noexcept{
  std::fill(output,output+2*frames,0.f);
  if(loop&&!wasLoop){for(unsigned s=0;s<2;s++)if(next[s]>=notes.size()){next[s]=0;cycles[s]+=2;}}
  if(!loop&&wasLoop)stopCycle=static_cast<std::uint64_t>(cursor/(cycleSeconds*rate));
  wasLoop=loop;
  unsigned done=0;
  while(done<frames&&state==playing&&!error){
   expire(cursor);
   for(;;){const auto a=upcoming(0,loop),b=upcoming(1,loop);const unsigned stream=a<=b?0:1;const auto at=std::min(a,b);if(at>cursor)break;
    if(!onsetBudget){error=2;break;}--onsetBudget;spawn(notes[next[stream]],cycles[stream],cursor);advance(stream,loop);if(error)break;
   }
   const auto nextAt=std::min(upcoming(0,loop),upcoming(1,loop));
   unsigned count=static_cast<unsigned>(std::min<std::uint64_t>(renderBlock,std::min<std::uint64_t>(frames-done,nextAt>cursor?nextAt-cursor:0)));
   if(fadeLeft)count=std::min(count,fadeLeft);
   if(!count){if(error)break;error=3;break;}
   mix(output+2*done,count);
   for(unsigned i=0;i<count;i++){
    float gain=1;
    if(fadeIn){gain*=1-static_cast<float>(fadeIn)/fadeFrames;--fadeIn;}
    if(fadeLeft){gain*=static_cast<float>(fadeLeft)/fadeFrames;--fadeLeft;}
    output[2*(done+i)]*=gain;output[2*(done+i)+1]*=gain;
   }
   cursor+=count;done+=count;
   if(!fadeLeft&&(afterFade==stopped||afterFade==paused)&&afterFade!=playing){state=afterFade;afterFade=playing;if(state==stopped){cursor=0;for(auto& s:voices)s.voice.reset();for(auto& s:retiring)s.voice.reset();}}
   bool any=false;for(const auto& s:voices)any|=s.voice.has_value();for(const auto& s:retiring)any|=s.voice.has_value();
   if(!loop&&!any&&nextAt==UINT64_MAX&&cursor>=frameAt((stopCycle+1)*cycleSeconds))state=finished;
  }
  if(error){state=failed;std::fill(output,output+2*frames,0.f);fault.store(error);}
  std::uint64_t live=0;for(const auto& s:voices)live+=s.voice.has_value();position.store(cursor);active.store(live);stateView.store(state);
 }
};
}
