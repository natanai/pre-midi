#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>

namespace premidi {
// Keep the period, filter topology, and coefficients aligned with src/dsp/noise.js.
struct NoiseState {
 static constexpr std::uint32_t initialSeed=0x7f41a08b,multiplier=1664525u,increment=1013904223u;
 std::uint32_t seed=initialSeed,index=0,period=0;
 unsigned color=0;
 std::array<double,3> alpha{},state{},initialState{};
 double brownGain=0,toneAlpha=0,tone=0,initialTone=0;
 static double coefficient(double hz,double rate)noexcept{
  return -std::expm1(-6.28318530717958647692*std::min(hz,rate*.45)/rate);
 }
 float sample()noexcept{
  seed=seed*multiplier+increment;
  double value=static_cast<float>((static_cast<double>(seed)/4294967296.*2.-1.)*.85);
  if(color){
   state[0]+=alpha[0]*(value-state[0]);
   if(color==2)value=std::clamp(state[0]*brownGain,-.85,.85);
   else{
    state[1]+=alpha[1]*(value-state[1]);
    state[2]+=alpha[2]*(value-state[2]);
    value=std::clamp(.21*value+2.8*state[0]+1.12*state[1]+.364*state[2],-.85,.85);
   }
  }
  if(toneAlpha){tone+=toneAlpha*(value-tone);value=tone;}
  return static_cast<float>(value);
 }
 void prepare(double rate,unsigned shade,double cutoff)noexcept{
  period=static_cast<std::uint32_t>(std::ceil(rate*2));color=shade;
  if(!color&&cutoff>=20000)return;
  alpha={coefficient(80,rate),coefficient(800,rate),coefficient(8000,rate)};
  brownGain=.42*std::sqrt((2-alpha[0])/alpha[0]);
  toneAlpha=cutoff<20000?coefficient(cutoff,rate):0;
  const auto warm=static_cast<std::uint32_t>(std::ceil(rate/8));
  auto mul=multiplier,add=increment;
  for(auto frames=period-warm;frames;frames>>=1){
   if(frames&1)seed=seed*mul+add;
   add*=mul+1u;mul*=mul;
  }
  for(unsigned i=0;i<warm;i++)sample();
  seed=initialSeed;initialState=state;initialTone=tone;
 }
 float next()noexcept{
  const auto value=sample();
  if(++index==period){index=0;seed=initialSeed;state=initialState;tone=initialTone;}
  return value;
 }
};
}
