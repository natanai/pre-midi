#pragma once
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <vector>
#include <stdexcept>
namespace premidi {
// One callback writer. Read/free PCM only after completion or device join.
class Capture {
 std::vector<float> pcm;std::uint64_t written=0,limit=0,latency=0,lead=0;
 bool synchronized=false,finishing=false;std::atomic<unsigned> stopRequest{0};
public:
 std::atomic<unsigned> phase{0}; // idle, armed, recording, complete
 std::atomic<std::uint64_t> frames{0},leadRemaining{0},missing{0},clipped{0},peakMillion{0},startFrame{0};
 void prepare(unsigned rate,double seconds,double offsetMs,bool sync){
  if(rate<8000||rate>192000||!std::isfinite(seconds)||seconds<.05||seconds>300||!std::isfinite(offsetMs)||offsetMs<0||offsetMs>500)throw std::runtime_error("Invalid native capture dimensions");
  if(phase.load()==1||phase.load()==2)throw std::runtime_error("A native microphone take is already active");
  latency=static_cast<std::uint64_t>(std::llround(offsetMs*rate/1000));limit=static_cast<std::uint64_t>(std::ceil(seconds*rate))+latency;
  pcm.assign(static_cast<std::size_t>(limit),0.f);written=lead=0;synchronized=sync;finishing=false;stopRequest.store(0);frames.store(0);missing.store(0);clipped.store(0);peakMillion.store(0);startFrame.store(0);leadRemaining.store(0);
 }
 void arm()noexcept{phase.store(1);}
 void duration(unsigned rate,double seconds){if(phase.load()!=1||!synchronized||!std::isfinite(seconds)||seconds<=0)throw std::runtime_error("Invalid native take timing");limit=std::min(limit,static_cast<std::uint64_t>(std::ceil(seconds*rate))+latency);}
 void start(unsigned rate,double leadSeconds){
  if(synchronized||phase.load()!=1||!std::isfinite(leadSeconds)||leadSeconds<0||leadSeconds>10)throw std::runtime_error("Native microphone take is not ready");
  lead=static_cast<std::uint64_t>(std::ceil(leadSeconds*rate));leadRemaining.store(lead);stopRequest.store(2);
 }
 void stop()noexcept{stopRequest.store(1);}
 void process(const float* input,unsigned count,std::uint64_t clock,bool targetReady,unsigned skip,unsigned activeFrames,bool paused)noexcept{
  auto state=phase.load();if(state!=1&&state!=2)return;const auto request=stopRequest.exchange(0);
  if(request==1){if(state==1){phase.store(3);return;}finishing=true;limit=std::min<std::uint64_t>(pcm.size(),written+latency);}
  unsigned begin=0,end=count;
  if(state==1){
   if(synchronized){if(!targetReady||skip>=count||!activeFrames)return;begin=skip;end=std::min(count,skip+activeFrames);}
   else{if(request==2)startFrame.store(UINT64_MAX);if(startFrame.load()!=UINT64_MAX)return;begin=static_cast<unsigned>(std::min<std::uint64_t>(count,lead));lead-=begin;leadRemaining.store(lead);if(begin==count)return;}
   phase.store(2);startFrame.store(clock+begin);
  }else if(synchronized&&!finishing){if(paused&&!activeFrames)return;if(activeFrames)end=std::min(count,skip+activeFrames);}
  if(limit<=written){phase.store(3);return;}
  const auto n=static_cast<unsigned>(std::min<std::uint64_t>(end-begin,limit-written));std::uint64_t peak=peakMillion.load(),clips=0;
  for(unsigned i=0;i<n;i++){float value=input?input[begin+i]:0;if(!std::isfinite(value))value=0;pcm[written+i]=value;clips+=std::abs(value)>.99f;peak=std::max(peak,static_cast<std::uint64_t>(std::min(32.f,std::abs(value))*1000000.f));}
  if(!input)missing.fetch_add(n);
  clipped.fetch_add(clips);peakMillion.store(peak);written+=n;frames.store(written>latency?written-latency:0);if(written>=limit)phase.store(3);
 }
 const float* data()const noexcept{return pcm.data()+std::min(latency,written);}
 std::uint64_t size()const noexcept{return written>latency?written-latency:0;}
 void discard(){phase.store(0);pcm.clear();written=limit=lead=0;}
 void joined()noexcept{if(phase.load()==1||phase.load()==2)phase.store(3);}
};
}
