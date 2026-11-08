#pragma once
#include "plan-packet.hpp"
#include "delay.hpp"
#include "page-mailbox.hpp"
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
 int delay=-1;SampleChannelState* channels=nullptr;
 const DriveRecipe* drive=nullptr;const SineLfoTable* lfo=nullptr;
 std::uint64_t start=0,off=0,end=0,order=0,fadeEnd=0;
};
// A session owns immutable instructions and banks. Its fixed-size mixer state
// belongs exclusively to the callback after publication. Destruction is control work.
class Session {
 struct Bank {unsigned shape;std::array<double,32> harmonics;std::unique_ptr<WaveBank> value;};
 std::vector<Bank> banks;std::unique_ptr<SineLfoTable> lfoBank;
 SampleStore ownedSamples;std::unique_ptr<SampleChannelState[]> channelState;unsigned channelWidth=0;
 struct DriveEntry {double amount;std::unique_ptr<DriveRecipe> recipe;};std::vector<DriveEntry> drives;
 struct Bus {double mix,time,feedback,tail;Delay delay;std::array<float,2*renderBlock> input{};double tone=20000;bool ping=false;};
 std::vector<Bus> buses;std::uint64_t tailEnd=0;
 std::array<Slot,voiceLimit> voices;
 std::array<Slot,retireLimit> retiring;
 std::array<std::size_t,2> next{};std::array<std::uint64_t,2> cycles{0,1};
 std::uint64_t cursor=0,serial=0,stopCycle=0;bool wasLoop=false;
 unsigned fadeLeft=0,fadeIn=0,afterFade=playing,error=0;
 std::uint64_t leadCursor=0,leadTotal=0;double leadBeatFrames=0;
 // Streaming-only, callback-owned view into one already-validated and pinned
 // PreparedPageLease. No page payload is copied or prepared by the callback.
 // An external control owner MUST retain each lease past its final active
 // Voice/release (and eventual effects) retirement, not just metadata ACK.
 bool streamed=false,streamLast=false;
 struct StreamOnset{
  const PreparedNote* note=nullptr;
  std::uint64_t frame=0,baseFrame=0,order=0;
  int delay=-1;
 };
 // Fixed no-allocation priority queue for a note whose authored source page
 // ends before a positive strum/timing offset makes it audible. Later pages
 // enter the SAME queue; a voice starts once, at its real native frame.
 static constexpr std::size_t streamPendingLimit=4096;
 std::array<StreamOnset,streamPendingLimit> streamPending{};
 std::size_t streamPendingCount=0;
 std::uint64_t streamBaseFrame=0,streamSpawnBase=0,streamEndFrame=0,
  streamSequence=0,streamOrder=0;
 static bool onsetEarlier(const StreamOnset& a,const StreamOnset& b)noexcept{
  return a.frame<b.frame||(a.frame==b.frame&&a.order<b.order);
 }
 void insertPending(StreamOnset item)noexcept{
  auto i=streamPendingCount++;
  streamPending[i]=item;
  while(i){
   const auto parent=(i-1)/2;
   if(!onsetEarlier(streamPending[i],streamPending[parent]))break;
   std::swap(streamPending[i],streamPending[parent]);i=parent;
  }
 }
 void removePending()noexcept{
  if(!streamPendingCount)return;
  const auto last=streamPending[--streamPendingCount];
  if(!streamPendingCount)return;
  streamPending[0]=last;
  std::size_t parent=0;
  for(;;){
   const auto left=parent*2+1,right=left+1;
   if(left>=streamPendingCount)break;
   auto child=left;
   if(right<streamPendingCount&&onsetEarlier(streamPending[right],streamPending[left]))
    child=right;
   if(!onsetEarlier(streamPending[child],streamPending[parent]))break;
   std::swap(streamPending[child],streamPending[parent]);parent=child;
  }
 }
 std::uint64_t frameAt(double seconds)const noexcept{return static_cast<std::uint64_t>(std::ceil(seconds*rate-1e-9));}
 void expire(std::uint64_t at)noexcept{
  for(auto& s:voices)if(s.voice&&s.end<=at)s.voice.reset();
  for(auto& s:retiring)if(s.voice&&s.fadeEnd<=at)s.voice.reset();
  if(streamed)releasedThrough.store(at,std::memory_order_release);
 }
 std::uint64_t upcoming(unsigned stream,bool loop)const noexcept{
  if(streamed){
   if(stream!=0||!streamPendingCount)return UINT64_MAX;
   return streamPending[0].frame;
  }
  if(next[stream]>=notes.size()||(!loop&&cycles[stream]>stopCycle))return UINT64_MAX;
  return frameAt(cycles[stream]*cycleSeconds+notes[next[stream]].plan.start);
 }
 void advance(unsigned stream,bool loop)noexcept{
  if(streamed){removePending();return;}
  if(++next[stream]>=notes.size()&&loop){next[stream]=0;cycles[stream]+=2;}
 }
 void spawn(const PreparedNote& note,std::uint64_t cycle,std::uint64_t at,
  int mappedDelay=-2)noexcept{
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
    auto* storage=tail->channels;*tail=*free;tail->channels=storage;if(channelWidth){std::copy(free->channels,free->channels+channelWidth,storage);tail->voice->relocateChannels(storage);}tail->fadeEnd=std::min(tail->end,at+fadeFrames);
   }
   stolen++;
  }
  free->plan=note.plan;free->delay=mappedDelay==-2?note.delay:mappedDelay;free->drive=note.prepared.drive;free->lfo=note.prepared.lfoBank;const double shift=streamed?static_cast<double>(streamSpawnBase)/rate:cycle*cycleSeconds;
  auto& p=free->plan;p.start+=shift;p.off+=shift;p.sourceEnd+=shift;p.graphEnd+=shift;
  if(p.version>=4)p.sweepEnd+=shift;
  for(unsigned i=0;i<p.eventCount;i++)p.events[i].time+=shift;
  for(unsigned i=0;i<p.automationCount;i++)p.automation[i].time+=shift;
  free->banks=note.banks;free->start=at;free->off=frameAt(p.off);free->end=frameAt(p.graphEnd);free->order=++serial;
  free->voice.emplace(p,rate,free->banks,at,&note.prepared,nullptr,nullptr,free->channels);admitted++;
  if(free->delay>=0)tailEnd=std::max(tailEnd,frameAt(p.graphEnd+buses[free->delay].tail));
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
  s.voice.emplace(s.plan,rate,s.banks,s.start,nullptr,s.drive,s.lfo,s.channels);
  std::array<float,2*renderBlock> scratch{};
  for(auto at=s.start;at<target;){const auto count=static_cast<unsigned>(std::min<std::uint64_t>(renderBlock,target-at));s.voice->process(scratch.data(),count);at+=count;}
 }
public:
 const unsigned rate,fadeFrames;const double cycleSeconds;
 std::vector<PreparedNote> notes;
 unsigned state=playing;std::uint64_t admitted=0,stolen=0;
 std::atomic<std::uint64_t> position{0},active{0},fault{0},stateView{playing};
 std::atomic<std::uint64_t> leadRemaining{0};
 // RT callback watermark published only AFTER expiring old Voice owners.
 // Control may release a page lease only after its graph/effect lifetime and
 // this watermark have both advanced beyond the lease horizon.
 std::atomic<std::uint64_t> releasedThrough{0};
 unsigned lastLeadFrames=0,lastMusicFrames=0;
 // Prepared handoff clock; read only by the callback after publication.
 Session* alignSource=nullptr;std::uint64_t alignOldFrame=0;
 std::atomic<unsigned> handoff{0};
 Session(const std::uint8_t* data,std::size_t length,unsigned sr,double cycle,double seek,const SampleStore& samples={}):rate(sr),fadeFrames(std::max(1u,sr/200)),cycleSeconds(cycle){
  require(rate>=8000&&rate<=192000&&std::isfinite(cycle)&&cycle>=.05&&cycle<=600&&std::isfinite(seek)&&seek>=0&&seek<cycle,"Invalid native session timing");
  require(length<=512*1024*1024,"Native PCM bundle exceeds 512 MiB");PacketReader in(data,length);
  const auto magic=in.u32();require(magic==0x31534d50||magic==0x32534d50,"Unknown native session transport");SampleStore available=samples;
  if(magic==0x31534d50)require(length<=16*1024*1024,"Native session exceeds 16 MiB");
  if(magic==0x32534d50){
   require(samples.empty(),"Inline native PCM cannot shadow registered assets");const auto assets=in.u32();require(assets<=512,"Too many inline native assets");
   for(unsigned i=0;i<assets;i++){
    const auto sourceRate=in.u32(),channels=in.u32(),frames=in.u32();require(sourceRate>=3000&&sourceRate<=768000&&channels>=1&&channels<=32&&frames>0&&frames<=sourceRate*301&&std::uint64_t(frames)*channels<=in.remaining()/4,"Invalid inline native asset dimensions");
    std::vector<float> pcm(static_cast<std::size_t>(frames)*channels);for(auto& value:pcm)value=in.f32();available.push_back(std::make_shared<SampleData>(pcm.data(),frames,sourceRate,channels,rate));
   }
  }
  const auto count=in.u32();require(count<=4096,"Native preview supports at most 4096 note onsets per cycle");notes.reserve(count);
  for(unsigned n=0;n<count;n++){
   const auto size=in.u32();require(size<=16000,"Native voice packet too large");PreparedNote note;note.plan=readPlan(in.take(size),size,rate);
   require(note.plan.start<cycle*2,"Native strum offset exceeds one complete cycle");
   if(note.plan.kind){require(note.plan.asset<=available.size()&&available[note.plan.asset-1]!=nullptr,"Native sample asset handle is missing");const auto& sample=available[note.plan.asset-1];require(sample->rate==rate&&note.plan.sampleOffset*rate<sample->frames,"Native sample asset rate/offset mismatch");ownedSamples.push_back(sample);note.plan.sample=sample.get();channelWidth=std::max(channelWidth,sample->channels==4?2u:sample->channels==6?4u:0u);}
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
   if(note.plan.version==9&&!lfoBank)lfoBank=std::make_unique<SineLfoTable>(rate);
   note.prepared=Voice(note.plan,rate,note.banks,0,nullptr,drive,note.plan.version==9?lfoBank.get():nullptr).preparation();notes.push_back(note);
   if(note.plan.delayMix>0){
    const auto& p=note.plan;std::size_t index=0;
    for(;index<buses.size();index++)if(buses[index].mix==p.delayMix&&buses[index].time==p.delayTime&&buses[index].feedback==p.delayFeedback&&buses[index].tone==p.delayTone&&buses[index].ping==p.delayPingPong)break;
    if(index==buses.size()){require(buses.size()<32,"Native session exceeds 32 delay buses");buses.push_back({p.delayMix,p.delayTime,p.delayFeedback,Delay::tail(p.delayMix,p.delayTime,p.delayFeedback,p.delayTone),Delay(p.delayMix,p.delayTime,p.delayFeedback,rate,p.delayTone,p.delayPingPong),{},p.delayTone,p.delayPingPong});}
    notes.back().delay=static_cast<int>(index);
   }
  }
  if(channelWidth){channelState=std::make_unique<SampleChannelState[]>((voiceLimit+retireLimit)*channelWidth);unsigned slot=0;for(auto& voice:voices)voice.channels=channelState.get()+slot++*channelWidth;for(auto& voice:retiring)voice.channels=channelState.get()+slot++*channelWidth;}
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
 // Called on the CONTROL thread before this Session is ever published.
 // Preallocating maximum sample channel scratch makes 4/6-channel samples
 // valid in later pages without changing callback-owned allocations.
 void enableStreaming(){
  require(notes.empty()&&cursor==0&&!streamed&&buses.empty(),
   "Native stream needs an empty and unstarted Session");
  channelWidth=4;
  channelState=std::make_unique<SampleChannelState[]>((voiceLimit+retireLimit)*channelWidth);
  unsigned slot=0;
  for(auto& voice:voices)voice.channels=channelState.get()+slot++*channelWidth;
  for(auto& voice:retiring)voice.channels=channelState.get()+slot++*channelWidth;
  streamed=true;
 }

 // CONTROL thread only: install the complete shared-effect recipe catalog
 // before publication. No allocation or vector mutation is permitted after
 // the native callback starts consuming page instructions.
 int registerStreamingDelay(double mix,double time,double feedback,double tone=20000,bool ping=false){
  require(streamed&&!streamSequence&&cursor==0,
   "Native shared delay recipes must be installed before the stream starts");
  require(std::isfinite(mix)&&std::isfinite(time)&&std::isfinite(feedback)&&
   std::isfinite(tone)&&tone>=20&&tone<=20000&&mix>0&&mix<=1&&time>=.04999999&&time<=2&&feedback>=0&&feedback<=.80000002,
   "Invalid native streaming delay recipe");
  for(unsigned i=0;i<buses.size();i++)
   if(buses[i].mix==mix&&buses[i].time==time&&buses[i].feedback==feedback&&buses[i].tone==tone&&buses[i].ping==ping)
    return static_cast<int>(i);
  require(buses.size()<32,"Native streaming Song exceeds 32 shared delay buses");
  const auto tail=Delay::tail(mix,time,feedback,tone);
  buses.push_back({mix,time,feedback,tail,Delay(mix,time,feedback,rate,tone,ping),{},tone,ping});
  return static_cast<int>(buses.size()-1);
 }

 // CALLBACK thread only, after a matching PageMailbox ACK and before
 // rendering that page. Input is an immutable view into a pinned C++ lease.
 // The current first slice intentionally refuses delayed strums whose audible
 // onset is in another page, and page-local delay buses; those are separate
 // required gates and must not silently sound at an incorrect time.
 bool activateStreamPage(const PageDescriptor& descriptor,
   const std::vector<PreparedNote>& prepared)noexcept{
  const auto fail=[&]()noexcept{error=4;state=failed;fault.store(error);stateView.store(state);return false;};
  if(!streamed||state!=playing||error||descriptor.sequence!=streamSequence+1||
     descriptor.startFrame!=cursor||descriptor.endFrame<=descriptor.startFrame||
     !descriptor.prepared||descriptor.onsets!=prepared.size()||
     prepared.size()>streamPendingLimit||
     prepared.size()>streamPendingLimit-streamPendingCount)
   return fail();
  // Validate the whole page before mutating the priority queue. Positive
  // strum offsets may cross into following pages; bound the lookahead to one
  // real-time second and fail closed on a larger unsupported displacement.
  std::uint64_t previous=0;
  for(const auto& item:prepared){
   if(item.plan.start<0||((item.delay>=0)!=(item.plan.delayMix>0)))return fail();
   const auto offset=frameAt(item.plan.start);
   if(offset<previous||offset>descriptor.endFrame-descriptor.startFrame+rate)
    return fail();
   if(item.plan.delayMix>0){
    bool found=false;
    for(const auto& bus:buses)
     if(bus.mix==item.plan.delayMix&&bus.time==item.plan.delayTime&&
        bus.feedback==item.plan.delayFeedback&&bus.tone==item.plan.delayTone&&bus.ping==item.plan.delayPingPong){found=true;break;}
    if(!found)return fail();
   }
   previous=offset;
  }
  for(const auto& item:prepared){
   const auto onset=descriptor.startFrame+frameAt(item.plan.start);
   if(onset<descriptor.startFrame||onset>UINT64_MAX-rate)return fail();
   int delay=-1;
   if(item.plan.delayMix>0)
    for(unsigned i=0;i<buses.size();i++)
     if(buses[i].mix==item.plan.delayMix&&buses[i].time==item.plan.delayTime&&
        buses[i].feedback==item.plan.delayFeedback&&buses[i].tone==item.plan.delayTone&&buses[i].ping==item.plan.delayPingPong){delay=static_cast<int>(i);break;}
   insertPending({&item,onset,descriptor.startFrame,++streamOrder,delay});
  }
  streamBaseFrame=descriptor.startFrame;
  streamEndFrame=descriptor.endFrame;
  streamLast=descriptor.last;streamSequence=descriptor.sequence;
  return true;
 }
 void command(unsigned command)noexcept{
  if(command==1||command==2){if(state==playing){fadeLeft=fadeFrames;afterFade=command==1?stopped:paused;}else if(command==1){state=stopped;cursor=0;for(auto& s:voices)s.voice.reset();for(auto& s:retiring)s.voice.reset();}}
  if(command==3&&state==paused){state=playing;fadeIn=fadeFrames;}
 }
 bool advanceTo(std::uint64_t target,bool loop)noexcept{
  std::array<float,2*renderBlock> scratch{};
  while(cursor<target&&state==playing){unsigned budget=maxOnsets;process(scratch.data(),static_cast<unsigned>(std::min<std::uint64_t>(renderBlock,target-cursor)),loop,budget);}
  return cursor==target&&!error;
 }
 void countIn(double bpm,unsigned bars){
  require(std::isfinite(bpm)&&bpm>=20&&bpm<=400&&bars<=2,"Invalid native count-in");
  leadBeatFrames=rate*60./bpm;leadTotal=static_cast<std::uint64_t>(std::ceil(leadBeatFrames*bars*4-1e-9));leadCursor=0;leadRemaining.store(leadTotal);
 }
 // Control-side reconstruction for a live edit of an already looping score.
 // Retain enough preceding cycles for held notes, releases and delay history,
 // without inventing cycles that the transport has not played yet.
 bool warmLoopPosition(double phase,std::uint64_t elapsedCycles){
  double history=cycleSeconds;for(const auto& note:notes)history=std::max(history,note.plan.graphEnd+(note.delay>=0?buses[note.delay].tail:0));
  const auto cyclesToWarm=std::min(elapsedCycles,static_cast<std::uint64_t>(std::ceil(history/cycleSeconds))+1);
  return advanceTo(frameAt(cyclesToWarm*cycleSeconds+phase),true);
 }
 void process(float* output,unsigned frames,bool loop,unsigned& onsetBudget)noexcept{
  std::fill(output,output+2*frames,0.f);
  lastLeadFrames=lastMusicFrames=0;
  if(loop&&!wasLoop&&!streamed){for(unsigned s=0;s<2;s++)if(next[s]>=notes.size()){next[s]=0;cycles[s]+=2;}}
  if(!loop&&wasLoop)stopCycle=static_cast<std::uint64_t>(cursor/(cycleSeconds*rate));
  wasLoop=loop;
  unsigned done=0;
  while(done<frames&&state==playing&&!error){
   if(leadCursor<leadTotal){
    unsigned count=static_cast<unsigned>(std::min<std::uint64_t>(std::min(renderBlock,frames-done),leadTotal-leadCursor));if(fadeLeft)count=std::min(count,fadeLeft);
    for(unsigned i=0;i<count;i++){
     const double frame=static_cast<double>(leadCursor+i),beat=std::floor(frame/leadBeatFrames),time=(frame-beat*leadBeatFrames)/rate;
     double envelope=0;if(time<.008)envelope=.0001*std::pow(800.,time/.008);else if(time<.08)envelope=.08*std::pow(.0001/.08,(time-.008)/.072);else if(time<.085)envelope=.0001;
     float value=static_cast<float>(std::sin(6.283185307179586*(static_cast<unsigned>(beat)%4?660:880)*time)*envelope);
     if(fadeIn){value*=1-static_cast<float>(fadeIn)/fadeFrames;--fadeIn;}if(fadeLeft){value*=static_cast<float>(fadeLeft)/fadeFrames;--fadeLeft;}
     output[2*(done+i)]=output[2*(done+i)+1]=value;
    }
    done+=count;leadCursor+=count;lastLeadFrames=done;
    if(!fadeLeft&&(afterFade==stopped||afterFade==paused)){state=afterFade;afterFade=playing;if(state==stopped){cursor=0;leadCursor=leadTotal;}}
    continue;
   }
   expire(cursor);
   for(;;){const auto a=upcoming(0,loop),b=upcoming(1,loop);const unsigned stream=a<=b?0:1;const auto at=std::min(a,b);if(at>cursor)break;
    if(!onsetBudget){error=2;break;}--onsetBudget;
    if(streamed){
     const auto item=streamPending[0];
     streamSpawnBase=item.baseFrame;
     spawn(*item.note,0,cursor,item.delay);
    }
    else spawn(notes[next[stream]],cycles[stream],cursor);
    advance(stream,loop);if(error)break;
   }
   const auto nextAt=std::min(upcoming(0,loop),upcoming(1,loop));
   std::uint64_t naturalEnd=UINT64_MAX;
   if(!loop&&nextAt==UINT64_MAX&&(!streamed||streamLast)){
    naturalEnd=streamed?std::max(tailEnd,streamEndFrame):
     std::max(tailEnd,frameAt((stopCycle+1)*cycleSeconds));
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
   cursor+=count;done+=count;lastMusicFrames+=count;
   if(!fadeLeft&&(afterFade==stopped||afterFade==paused)&&afterFade!=playing){state=afterFade;afterFade=playing;if(state==stopped){cursor=0;for(auto& s:voices)s.voice.reset();for(auto& s:retiring)s.voice.reset();}}
   bool any=false;for(const auto& s:voices)any|=s.voice.has_value();for(const auto& s:retiring)any|=s.voice.has_value();
   if(!loop&&!any&&nextAt==UINT64_MAX&&(!streamed||streamLast)&&
      cursor>=std::max(tailEnd,streamed?streamEndFrame:frameAt((stopCycle+1)*cycleSeconds)))state=finished;
  }
  if(error){state=failed;std::fill(output,output+2*frames,0.f);fault.store(error);}
  std::uint64_t live=0;for(const auto& s:voices)live+=s.voice.has_value();position.store(cursor);active.store(live);stateView.store(state);leadRemaining.store(leadTotal-leadCursor);
 }
};
}
