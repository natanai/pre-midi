#pragma once
#include <array>
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include "waves.hpp"
#include "filter.hpp"
#include "modulation.hpp"
namespace premidi {
constexpr double pi=3.14159265358979323846;
struct Event {std::uint32_t kind;double time,value;};
struct Oscillator {double frequency=440,level=0,detune=0;std::uint32_t wave=0,count=0;std::array<double,32> harmonics{};std::array<double,600> curve{};};
struct Plan {
 double start=0,duration=1,sourceEnd=1,graphEnd=1.15,pan=0,cutoff=8000,q=.7,sweepStart=8000,sweepEnd=0,noise=0,noiseDecay=0,delayMix=0,delayTime=.24,delayFeedback=.26;
 std::uint32_t version=1,routeCount=0,automationCount=0;std::array<Event,6> automation{};double off=1,pitch=60,velocity=1;std::array<Route,16> routes{};
 std::uint32_t filterType=0;std::array<Oscillator,2> oscillators{};
 std::uint32_t eventCount=0;std::array<Event,6> events{};
};
struct VoicePreparation {Biquad filter;std::array<double,16> alpha{};std::array<double,2> initialFrequency{};double left=0,right=0;bool movingCutoff=false;};
// Prepared on the control thread. process() only touches fixed-size state and a
// caller-owned output span: no heap allocation, locks, file/device I/O or UI.
class Voice {
 Plan plan;double rate;std::uint64_t frame=0;std::array<double,2> phases{};
 Biquad filter;Modulation modulation;bool sourceStarted=false,movingCutoff=false;std::uint32_t noiseSeed=0x7f41a08b,noiseIndex=0;double left,right;std::array<const WaveBank*,2> banks;std::array<double,2> initialFrequency{};
 float envelope(double t) const noexcept {
  if(t<plan.events[0].time)return 0;
  double value=plan.events[0].value;
  for(std::uint32_t i=1;i<plan.eventCount;i++){
   const auto &prior=plan.events[i-1],&event=plan.events[i];
   if(t<event.time){
    if(event.kind==1&&event.time>prior.time)
     return static_cast<float>(prior.value+(event.value-prior.value)*(t-prior.time)/(event.time-prior.time));
    return static_cast<float>(value);
   }
   value=event.value;
  }
  return static_cast<float>(value);
 }
 float cents(const Oscillator& osc,double t) const noexcept {
  if(!osc.count)return static_cast<float>(osc.detune);
  const double position=std::clamp(t/plan.duration,0.,1.)*(osc.count-1);
  const auto index=static_cast<std::size_t>(position),next=std::min(index+1,static_cast<std::size_t>(osc.count-1));
  return static_cast<float>(osc.curve[index]+(osc.curve[next]-osc.curve[index])*(position-index));
 }
 double cutoffAt(double time) const noexcept {
  double base=plan.cutoff;
  if(plan.automationCount){
   const auto& points=plan.automation;
   if(time<=points[0].time)base=points[0].value;
   else {base=points[plan.automationCount-1].value;
    for(unsigned i=1;i<plan.automationCount;i++)if(time<points[i].time){const auto& a=points[i-1];const auto& b=points[i];base=a.value*std::pow(b.value/a.value,(time-a.time)/(b.time-a.time));break;}
   }
  }
  if(plan.version>=4&&plan.sweepEnd>plan.start){
   const double progress=std::clamp((time-plan.start)/(plan.sweepEnd-plan.start),0.,1.);
   base*=std::pow(plan.sweepStart/plan.cutoff,1.-progress);
  }
  return base;
 }
public:
#ifdef PREMIDI_PROBE
 struct Probe {float wave0=0,cents0=0,frequency0=0;};Probe probe{};
#endif
 Voice(const Plan& input,double sampleRate,std::array<const WaveBank*,2> waveBanks={nullptr,nullptr},std::uint64_t initialFrame=0,const VoicePreparation* prepared=nullptr) noexcept:plan(input),rate(sampleRate),frame(initialFrame),modulation(input.routes,input.routeCount,sampleRate,input.start,input.off,input.graphEnd,input.pitch,input.velocity,prepared?&prepared->alpha:nullptr),banks(waveBanks){
  if(prepared){filter=prepared->filter;movingCutoff=prepared->movingCutoff;left=prepared->left;right=prepared->right;initialFrequency=prepared->initialFrequency;return;}
  for(unsigned i=0;i<plan.routeCount;i++)if(plan.routes[i].target==4)movingCutoff=true;
  if(plan.automationCount||plan.version>=4)movingCutoff=true;
  filter.configure(plan.filterType,cutoffAt(plan.start),plan.q,rate);
  left=std::cos((plan.pan+1)*pi/4);right=std::sin((plan.pan+1)*pi/4);
  for(unsigned j=0;j<2;j++){const auto& osc=plan.oscillators[j];initialFrequency[j]=osc.frequency*std::pow(2.,(osc.count?osc.curve[0]:osc.detune)/1200.);}
 }
 VoicePreparation preparation()const noexcept{return {filter,modulation.preparedAlpha(),initialFrequency,left,right,movingCutoff};}
 void process(float* interleavedStereo,std::size_t frames) noexcept {
  for(std::size_t i=0;i<frames;i++,frame++){
#ifdef PREMIDI_PROBE
   probe={};
#endif
   const double t=static_cast<double>(frame)/rate;float mix=0;const auto offsets=modulation.next(t);
   if(t>=plan.start&&t<plan.sourceEnd){
    if(!sourceStarted){
     if(plan.version>=2)for(std::size_t j=0;j<2;j++)phases[j]=(t-plan.start)*initialFrequency[j]*(rate<=24000?2048:rate<=88200?4096:16384);
     sourceStarted=true;
    }
    for(std::size_t j=0;j<2;j++){
     const auto& osc=plan.oscillators[j];
     const float detune=cents(osc,t-plan.start)+std::clamp(offsets[2*j],-2400.f,2400.f);
     const double frequency=std::min(rate/2,osc.frequency*std::pow(2.,detune/1200.));
     const bool banked=osc.wave||plan.version>=2;
     const float wave=!banked?static_cast<float>(std::sin(phases[j])):banks[j]->sample(phases[j],frequency);
#ifdef PREMIDI_PROBE
     if(j==0)probe={wave,detune,static_cast<float>(frequency)};
#endif
     mix+=wave*std::clamp(static_cast<float>(osc.level)+offsets[2*j+1],0.f,1.f);
     phases[j]=banked?banks[j]->advance(phases[j],frequency):std::fmod(phases[j]+2*pi*frequency/rate,2*pi);
    }
    if(plan.version>=5&&plan.noise>0){
     noiseSeed=noiseSeed*1664525u+1013904223u;
     const double value=(static_cast<double>(noiseSeed)/4294967296.*2.-1.)*.85;
     const double elapsed=std::max(0.,t-plan.start);
     const double gain=plan.noiseDecay>0?std::exp(-elapsed/std::max(.002,plan.noiseDecay/5.)):1.;
     mix+=static_cast<float>(value*plan.noise*gain);
     if(++noiseIndex>=static_cast<std::uint32_t>(std::ceil(rate*2.))){noiseIndex=0;noiseSeed=0x7f41a08b;}
    }
   }
   if(movingCutoff)filter.configure(plan.filterType,cutoffAt(t)*std::pow(2.,std::clamp(offsets[4],-8.f,8.f)),plan.q,rate);
   if(plan.routeCount){const double pan=std::clamp(static_cast<float>(plan.pan)+std::clamp(offsets[5],-2.f,2.f),-1.f,1.f);left=std::cos((pan+1)*pi/4);right=std::sin((pan+1)*pi/4);}
   const float filtered=filter.process(mix);
   const float sample=t>=plan.graphEnd?0:static_cast<float>(filtered)*envelope(t);
   interleavedStereo[2*i]=static_cast<float>(sample*left);interleavedStereo[2*i+1]=static_cast<float>(sample*right);
  }
 }
};
}
