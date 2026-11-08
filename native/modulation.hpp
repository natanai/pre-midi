#pragma once
#include <array>
#include <cmath>
#include <algorithm>
#include <cstdint>
#include "waves.hpp"
namespace premidi {
struct Route {
// root is key center for kind 3, sequence seed for kinds 7/8.
 unsigned target=0,kind=0,bipolar=0;double depth=0,smoothing=0,rate=.5,root=60,span=24;
 std::array<double,4> envelope{.8,.5,.5,.5};
};
class Modulation {
 std::array<Route,16> routes;std::array<double,16> state{},alpha{},phase{};
 bool started=false;unsigned count;double sampleRate,start,off,end,pitch,velocity;
 const SineLfoTable* lfoBank;
 static double held(const Route& route,double time) noexcept {
  const auto& e=route.envelope;const double attack=std::max(.002,e[0]);
  return time<attack?time/attack:e[1]>0&&time<attack+e[1]?1-(1-e[2])*(time-attack)/e[1]:e[2];
 }
 static double randomValue(uint32_t seed,uint32_t index) noexcept {
  uint32_t x=index^(seed*0x9e3779b9u);x=(x^(x>>16))*0x7feb352du;
  x=(x^(x>>15))*0x846ca68bu;x^=x>>16;
  return static_cast<double>(x)/4294967295.0*2-1;
 }
public:
 Modulation(const std::array<Route,16>& input,unsigned length,double sr,double onset,double noteOff,double graphEnd,double key,double touch,const std::array<double,16>* preparedAlpha=nullptr,const SineLfoTable* lfo=nullptr) noexcept:
  routes(input),count(length),sampleRate(sr),start(onset),off(noteOff),end(graphEnd),pitch(key),velocity(touch),lfoBank(lfo){
  if(preparedAlpha)alpha=*preparedAlpha;
  else for(unsigned i=0;i<count;i++)alpha[i]=routes[i].smoothing>0?1-std::exp(-1/(sr*routes[i].smoothing)):1;
 }
 std::array<double,16> preparedAlpha()const noexcept{return alpha;}
 std::array<float,8> next(double time) noexcept {
  std::array<float,8> sums{};if(time<start||time>=end)return sums;
  if(!started){for(unsigned i=0;i<count;i++)if(routes[i].kind==0)phase[i]=(lfoBank?lfoBank->initial(time-start,static_cast<float>(routes[i].rate)):(time-start)*static_cast<float>(routes[i].rate)*2*3.14159265358979323846);started=true;}
  for(unsigned i=0;i<count;i++){
   const auto& route=routes[i];float value;
   if(route.kind==0){
    if(lfoBank){value=lfoBank->lfo(phase[i],static_cast<float>(route.rate));phase[i]=lfoBank->advance(phase[i],static_cast<float>(route.rate));}
    else{
    value=static_cast<float>(std::sin(phase[i]));
    const float size=sampleRate<=24000?2048:sampleRate<=88200?4096:16384;
    phase[i]+=static_cast<float>(static_cast<float>(route.rate)*(size/static_cast<float>(sampleRate)))*2*3.14159265358979323846/size;
    phase[i]=std::fmod(phase[i],2*3.14159265358979323846);
    }
   }else if(route.kind>=4){
    const double cycles=(time-start)*route.rate,position=cycles-std::floor(cycles);
    if(route.kind==9)value=static_cast<float>(route.envelope[std::min(3u,static_cast<unsigned>(position*4))]);
    else if(route.kind>=7){
     const auto index=static_cast<uint32_t>(std::floor(cycles));
     const double a=randomValue(static_cast<uint32_t>(route.root),index);
     value=static_cast<float>(route.kind==7?a:a+(randomValue(static_cast<uint32_t>(route.root),index+1)-a)*position);
    }else value=static_cast<float>(route.kind==4?1-4*std::abs(position-.5):route.kind==5?2*position-1:position<.5?1:-1);
   }else if(route.kind==1){
    const double elapsed=time-start,gate=off-start;const auto& e=route.envelope;
    value=static_cast<float>(elapsed<=gate?held(route,elapsed):elapsed<gate+e[3]?held(route,gate)+(1e-6-held(route,gate))*(elapsed-gate)/e[3]:1e-6);
   }else value=static_cast<float>(route.kind==2?velocity:std::clamp((pitch-route.root)/route.span,-1.,1.));
   const bool signedSource=route.kind==0||route.kind==3||route.kind>=4;
   if(signedSource&&!route.bipolar)value=value*.5f+.5f;
   if(!signedSource&&route.bipolar)value=value*2-1;
   state[i]=alpha[i]*value+(1-alpha[i])*state[i];
   sums[route.target]+=static_cast<float>(state[i])*static_cast<float>(route.depth);
  }
  return sums;
 }
};
}
