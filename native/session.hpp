#pragma once
#include "plan-packet.hpp"
#include "delay.hpp"
#include <atomic>
#include <memory>
#include <optional>
#include <vector>
namespace premidi {
constexpr unsigned voiceLimit=64,retireLimit=64,renderBlock=128,maxOnsets=256;
enum Playback:unsigned{stopped=0,playing=1,paused=2,finished=3,failed=4};
struct PreparedNote {Plan plan;std::array<const WaveBank*,2> banks{};VoicePreparation prepared;int delay=-1;};
struct Slot {
 std::optional<Voice> voice;Plan plan;std::array<const WaveBank*,2> banks{};
 int delay=-1;
 const DriveRecipe* drive=nullptr;
 std::uint64_t start=0,off=0,end=0,order=0,fadeEnd=0;
};
// A session owns immutable instructions and banks. Its fixed-size mixer state
// belongs exclusively to the callback after publication. Destruction is control work.
class Session {
 struct Bank {unsigned shape;std::array<double,32> harmonics;std::unique_ptr<WaveBank> value;};
 std::vector<Bank> banks;
 SampleStore ownedSamples;
 struct DriveEntry {double amount;std::unique_ptr<DriveRecipe> recipe;};std::vector<DriveEntry> drives;
 struct Bus {double mix,time,feedback,tail;Delay delay;std::array<float,2*renderBlock> input{};};
 std::vector<Bus> buses;std::uint64_t tailEnd=0;
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
    const bool vocal=s.plan.kind==2,priorVocal=free->plan.kind==2;
    if((!vocal&&priorVocal)||(vocal==priorVocal&&((released&&!priorReleased)||(released==priorReleased&&(s.start<free->start||(s.start==free->start&&s.order<free->order))))))free=&s;
   }
   if(note.plan.kind!=2&&free->plan.kind==2)return;
   // A source stolen before its first sample is cancelled, not faded in place.
   if(free->start<at){
    Slot* tail=nullptr;for(auto& s:retiring)if(!s.voice){tail=&s;break;}
    if(!tail){error=1;return;}
    *tail=*free;tail->fadeEnd=std::min(tail->end,at+fadeFrames);
   }
   stolen++;
  }
  free->plan=note.plan;free->delay=note.delay;free->drive=note.prepared.drive;const double shift=cycle*cycleSeconds;
  auto& p=free->plan;p.start+=shift;p.off+=shift;p.sourceEnd+=shift;p.graphEnd+=shift;
  if(p.version>=4)p.sweepEnd+=shift;
  for(unsigned i=0;i<p.eventCount;i++)p.events[i].time+=shift;
  for(unsigned i=0;i<p.automationCount;i++)p.automation[i].time+=shift;
  free->banks=note.banks;free->start=at;free->off=frameAt(p.off);free->end=frameAt(p.graphEnd);free->order=++serial;
  free->voice.emplace(p,rate,free->banks,at,&note.prepared);admitted++;
  if(note.delay>=0)tailEnd=std::max(tailEnd,frameAt(p.graphEnd+buses[note.delay].tail));
 }
 void mix(float* output,unsigned frames)noexcept{
  std::array<float,2*renderBlock> scratch{};
  for(auto& bus:buses)std::fill(bus.input.begin(),bus.input.end(),0.f);
  for(auto& s:voices)if(s.voice){s.voice->process(scratch.data(),frames);for(unsigned i=0;i<2*frames;i++){
   output[i]+=scratch[i]*static_cast<float>(1-s.plan.delayMix*.4)*.85f;
   if(s.delay>=0)buses[s.delay].input[i]+=scratch[i];
  }}
  for(auto& s:retiring)if(s.voice){s.voice->process(scratch.data(),frames);for(unsigned i=0;i<frames;i++){
   const float gain=cursor+i<s.fadeEnd?static_cast<float>(s.fadeEnd-cursor-i)/fadeFrames:0;
   for(unsigned ch=0;ch<2;ch++){const float sample=scratch[2*i+ch]*gain;output[2*i+ch]+=sample*static_cast<float>(1-s.plan.delayMix*.4)*.85f;if(s.delay>=0)buses[s.delay].input[2*i+ch]+=sample;}
  }}
  for(auto& bus:buses){std::fill(scratch.begin(),scratch.end(),0.f);bus.delay.process(bus.input.data(),scratch.data(),frames);for(unsigned i=0;i<2*frames;i++)output[i]+=scratch[i]*.85f;}
 }
 void reconstruct(Slot& s,std::uint64_t target){
  if(!s.voice)return;
  s.voice.emplace(s.plan,rate,s.banks,s.start,nullptr,s.drive);
  std::array<float,2*renderBlock> scratch{};
  for(auto at=s.start;at<target;){const auto count=static_cast<unsigned>(std::min<std::uint64_t>(renderBlock,target-at));s.voice->process(scratch.data(),count);at+=count;}
 }
public:
 const unsigned rate,fadeFrames;const double cycleSeconds;
 std::vector<PreparedNote> notes;
 unsigned state=playing;std::uint64_t admitted=0,stolen=0;
 std::atomic<std::uint64_t> position{0},active{0},fault{0},stateView{playing};
 Session(const std::uint8_t* data,std::size_t length,unsigned sr,double cycle,double seek,const SampleStore& samples={}):rate(sr),fadeFrames(std::max(1u,sr/200)),cycleSeconds(cycle){
  require(rate>=8000&&rate<=192000&&std::isfinite(cycle)&&cycle>=.05&&cycle<=600&&std::isfinite(seek)&&seek>=0&&seek<cycle,"Invalid native session timing");
  require(length<=512*1024*1024,"Native PCM bundle exceeds 512 MiB");PacketReader in(data,length);
  const auto magic=in.u32();require(magic==0x31534d50||magic==0x32534d50,"Unknown native session transport");SampleStore available=samples;
  if(magic==0x31534d50)require(length<=16*1024*1024,"Native session exceeds 16 MiB");
  if(magic==0x32534d50){
   require(samples.empty(),"Inline native PCM cannot shadow registered assets");const auto assets=in.u32();require(assets<=512,"Too many inline native assets");
   for(unsigned i=0;i<assets;i++){
    const auto sourceRate=in.u32(),channels=in.u32(),frames=in.u32();require(sourceRate>=8000&&sourceRate<=192000&&channels>=1&&channels<=2&&frames>0&&frames<=sourceRate*301&&std::uint64_t(frames)*channels<=in.remaining()/4,"Invalid inline native asset dimensions");
    std::vector<float> pcm(static_cast<std::size_t>(frames)*channels);for(auto& value:pcm)value=in.f32();available.push_back(std::make_shared<SampleData>(pcm.data(),frames,sourceRate,channels,rate));
   }
  }
  const auto count=in.u32();require(count<=4096,"Native preview supports at most 4096 note onsets per cycle");notes.reserve(count);
  for(unsigned n=0;n<count;n++){
   const auto size=in.u32();require(size<=16000,"Native voice packet too large");PreparedNote note;note.plan=readPlan(in.take(size),size,rate);
   require(note.plan.start<cycle*2,"Native strum offset exceeds one complete cycle");
   if(note.plan.kind){require(note.plan.asset<=available.size()&&available[note.plan.asset-1]!=nullptr,"Native sample asset handle is missing");const auto& sample=available[note.plan.asset-1];require(sample->rate==rate&&note.plan.sampleOffset*rate<sample->frames,"Native sample asset rate/offset mismatch");ownedSamples.push_back(sample);note.plan.sample=sample.get();}
   for(unsigned i=0;i<2&&!note.plan.kind;i++)if(note.plan.oscillators[i].wave||note.plan.version>=2){
    const auto& o=note.plan.oscillators[i];Bank* found=nullptr;for(auto& b:banks)if(b.shape==o.wave&&b.harmonics==o.harmonics){found=&b;break;}
    if(!found){require(banks.size()<32,"Native preview supports at most 32 unique oscillator banks");banks.push_back({o.wave,o.harmonics,std::make_unique<WaveBank>(o.wave,o.harmonics,rate)});found=&banks.back();}
    note.banks[i]=found->value.get();
   }
   const DriveRecipe* drive=nullptr;
   if(note.plan.drive>0){
    for(const auto& entry:drives)if(entry.amount==note.plan.drive){drive=entry.recipe.get();break;}
    if(!drive){require(drives.size()<128,"Native session exceeds 128 drive recipes");drives.push_back({note.plan.drive,std::make_unique<DriveRecipe>(note.plan.drive)});drive=drives.back().recipe.get();}
   }
   note.prepared=Voice(note.plan,rate,note.banks,0,nullptr,drive).preparation();notes.push_back(note);
   if(note.plan.delayMix>0){
    const auto& p=note.plan;std::size_t index=0;
    for(;index<buses.size();index++)if(buses[index].mix==p.delayMix&&buses[index].time==p.delayTime&&buses[index].feedback==p.delayFeedback)break;
    if(index==buses.size()){require(buses.size()<32,"Native session exceeds 32 delay buses");buses.push_back({p.delayMix,p.delayTime,p.delayFeedback,Delay::tail(p.delayMix,p.delayTime,p.delayFeedback),Delay(p.delayMix,p.delayTime,p.delayFeedback,rate),{}});}
    notes.back().delay=static_cast<int>(index);
   }
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
  const auto target=frameAt(seek);
  if(!buses.empty()){
   // Control-side warm-up includes ended notes: their echoes may still be live.
   std::array<float,2*renderBlock> scratch{};
   while(cursor<target){unsigned budget=maxOnsets;process(scratch.data(),static_cast<unsigned>(std::min<std::uint64_t>(renderBlock,target-cursor)),false,budget);require(!error,"Native seek reconstruction failed");}
  }else{
   cursor=target;
   while(next[0]<notes.size()&&frameAt(notes[next[0]].plan.start)<=cursor){const auto at=frameAt(notes[next[0]].plan.start);expire(at);spawn(notes[next[0]],0,at);next[0]++;require(!error,"Native retirement pool exceeded during seek");}
   expire(cursor);for(auto& s:voices)reconstruct(s,cursor);for(auto& s:retiring)reconstruct(s,cursor);
  }
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
   std::uint64_t naturalEnd=UINT64_MAX;
   if(!loop&&nextAt==UINT64_MAX){
    naturalEnd=std::max(tailEnd,frameAt((stopCycle+1)*cycleSeconds));
    for(const auto& s:voices)if(s.voice)naturalEnd=std::max(naturalEnd,s.end);
    for(const auto& s:retiring)if(s.voice)naturalEnd=std::max(naturalEnd,s.fadeEnd);
    if(cursor>=naturalEnd){state=finished;break;}
   }
   unsigned count=static_cast<unsigned>(std::min<std::uint64_t>(renderBlock,std::min<std::uint64_t>(frames-done,nextAt>cursor?nextAt-cursor:0)));
   count=static_cast<unsigned>(std::min<std::uint64_t>(count,naturalEnd-cursor));
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
   if(!loop&&!any&&nextAt==UINT64_MAX&&cursor>=std::max(tailEnd,frameAt((stopCycle+1)*cycleSeconds)))state=finished;
  }
  if(error){state=failed;std::fill(output,output+2*frames,0.f);fault.store(error);}
  std::uint64_t live=0;for(const auto& s:voices)live+=s.voice.has_value();position.store(cursor);active.store(live);stateView.store(state);
 }
};
}
