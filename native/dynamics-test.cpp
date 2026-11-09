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
 recipe.mode=DynamicsRecipe::limiter;recipe.threshold=-1;p=recipe.prepared(48000);state.reset();
 for(unsigned i=0;i<100000;i++){float v[2]={float(4*std::sin(i*.17)),float(3*std::cos(i*.11))};state.process(v,2,p);for(float n:v)assert(std::isfinite(n)&&std::abs(n)<=p.ceiling+1e-7);}
 recipe.mode=DynamicsRecipe::gate;recipe.threshold=-30;recipe.hold=.01;recipe.release=.001;p=recipe.prepared(8000);state.reset();float loud[1]={1};state.process(loud,1,p);
 for(unsigned i=0;i<p.holdFrames;i++){float v[1]={.001f};state.process(v,1,p);assert(v[0]==.001f);}
 for(unsigned i=0;i<800;i++){float v[1]={.001f};state.process(v,1,p);if(i==799)assert(v[0]<.000002f);}
 p.mix=0;float dry[2]={.7f,-.2f};state.process(dry,2,p);assert(dry[0]==.7f&&dry[1]==-.2f);
 bool rejected=false;try{recipe.ratio=0;recipe.prepared(48000);}catch(...){rejected=true;}assert(rejected);
 std::cout<<"PASS linked dynamics static/knee oracles, sample-peak ceiling, gate hold/range and dry bypass\n";
}
