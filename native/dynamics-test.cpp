#include "dynamics.hpp"
#include <array>
#include <cassert>
#include <iostream>
int main(){
 using namespace premidi;
 DynamicsRecipe recipe;recipe.threshold=-20;recipe.ratio=4;recipe.knee=0;recipe.attack=0;auto p=recipe.prepared(48000);
 // Independent 4:1 oracle: input -4 dB is 16 dB above threshold;
 // output is threshold + 16/4 = -16 dB.
 Dynamics state;float frame[2]={float(std::pow(10.,-4./20)),float(-.5*std::pow(10.,-4./20))};state.process(frame,2,p);
 assert(std::abs(frame[0]-std::pow(10.,-16./20))<1e-7);assert(frame[1]==-.5f*frame[0]);
 recipe.knee=12;p=recipe.prepared(48000);assert(std::abs(p.compression(-20)+1.125)<1e-12);assert(p.compression(-26)==0);assert(std::abs(p.compression(-14)+4.5)<1e-12);
 recipe.mode=DynamicsRecipe::limiter;recipe.threshold=-1;p=recipe.prepared(48000);state.reset(p);
 for(unsigned i=0;i<100000;i++){float v[2]={float(4*std::sin(i*.17)),float(3*std::cos(i*.11))};state.process(v,2,p);for(float n:v)assert(std::isfinite(n)&&std::abs(n)<=p.ceiling+1e-7);}
 recipe.mode=DynamicsRecipe::gate;recipe.threshold=-30;recipe.hold=.01;recipe.release=.001;p=recipe.prepared(8000);state.reset(p);float loud[1]={1};state.process(loud,1,p);
 for(unsigned i=0;i<p.holdFrames;i++){float v[1]={.001f};state.process(v,1,p);assert(v[0]==.001f);}
 for(unsigned i=0;i<800;i++){float v[1]={.001f};state.process(v,1,p);if(i==799)assert(v[0]<.000002f);}
 p.mix=0;float dry[2]={.7f,-.2f};state.process(dry,2,p);assert(dry[0]==.7f&&dry[1]==-.2f);
 bool rejected=false;try{recipe.ratio=0;recipe.prepared(48000);}catch(...){rejected=true;}assert(rejected);
 recipe=DynamicsRecipe{};recipe.mode=DynamicsRecipe::deesser;recipe.frequency=6000;recipe.threshold=-96;recipe.amount=12;recipe.attack=0;
 const auto tone=[&](double frequency){
  p=recipe.prepared(48000);state.reset(p);double re=0,im=0;
  for(unsigned i=0;i<96000;i++){
   const double phase=2*3.14159265358979323846*frequency*i/48000;const float input=static_cast<float>(.5*std::sin(phase));float v[2]={input,-.5f*input};state.process(v,2,p);
   assert(v[1]==-.5f*v[0]);if(i>=48000){re+=v[0]*std::cos(phase);im+=v[0]*std::sin(phase);}
  }
  return 20*std::log10(2*std::hypot(re,im)/48000/.5);
 };
 assert(std::abs(tone(6000)+12)<.02);assert(std::abs(tone(200))<.02);
 for(unsigned rate:{8000,48000,192000})for(double frequency:{1000.,14000.})for(double bandwidth:{.1,3.}){
  recipe.frequency=frequency;recipe.bandwidth=bandwidth;recipe.amount=24;p=recipe.prepared(rate);state.reset(p);
  for(unsigned i=0;i<4096;i++){float v[2]={i==0?1.f:0.f,i==0?-.5f:0.f};state.process(v,2,p);for(float n:v)assert(std::isfinite(n)&&std::abs(n)<2);}
 }
 std::cout<<"PASS linked dynamics curves, sample-peak ceiling, gate hold/range, de-esser frequency selection/amount/stereo and stable extremes\n";
}
