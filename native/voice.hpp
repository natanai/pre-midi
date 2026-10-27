#pragma once
#include <array>
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
namespace premidi {
constexpr double pi=3.14159265358979323846;
struct Event {std::uint32_t kind;double time,value;};
struct Oscillator {double frequency=440,level=0,detune=0;std::uint32_t count=0;std::array<double,600> curve{};};
struct Plan {
 double start=0,duration=1,sourceEnd=1,graphEnd=1.15,pan=0,cutoff=8000,q=.7;
 std::array<Oscillator,2> oscillators{};
 std::uint32_t eventCount=0;std::array<Event,6> events{};
};
// Prepared on the control thread. process() only touches fixed-size state and a
// caller-owned output span: no heap allocation, locks, file/device I/O or UI.
class Voice {
 Plan plan;double rate;std::uint64_t frame=0;std::array<double,2> phases{};
 double b0,b1,b2,a1,a2,z1=0,z2=0,left,right;
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
public:
 Voice(const Plan& input,double sampleRate) noexcept:plan(input),rate(sampleRate){
  // Web Audio lowpass Q is specified in dB, not linear Q. Coefficients follow
  // the normative Web Audio biquad equations (see native/host-comparison.json).
  const double w=2*pi*std::clamp(plan.cutoff,0.,rate/2)/rate,c=std::cos(w);
  const double alpha=std::sin(w)/(2*std::pow(10.,plan.q/20.)),a0=1+alpha;
  b0=(1-c)/2/a0;b1=(1-c)/a0;b2=b0;a1=-2*c/a0;a2=(1-alpha)/a0;
  left=std::cos((plan.pan+1)*pi/4);right=std::sin((plan.pan+1)*pi/4);
 }
 void process(float* interleavedStereo,std::size_t frames) noexcept {
  for(std::size_t i=0;i<frames;i++,frame++){
   const double t=static_cast<double>(frame)/rate;float mix=0;
   if(t>=plan.start&&t<plan.sourceEnd){
    for(std::size_t j=0;j<2;j++){
     const auto& osc=plan.oscillators[j];
     mix+=static_cast<float>(std::sin(phases[j]))*static_cast<float>(osc.level);
     phases[j]+=2*pi*osc.frequency*std::pow(2.,cents(osc,t-plan.start)/1200.)/rate;
     if(phases[j]>=2*pi)phases[j]-=2*pi;
    }
   }
   const double filtered=b0*mix+z1;z1=b1*mix-a1*filtered+z2;z2=b2*mix-a2*filtered;
   const float sample=t>=plan.graphEnd?0:static_cast<float>(filtered)*envelope(t);
   interleavedStereo[2*i]=static_cast<float>(sample*left);interleavedStereo[2*i+1]=static_cast<float>(sample*right);
  }
 }
};
}
