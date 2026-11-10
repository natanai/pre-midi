#include "modulation-effects.hpp"
#include <iostream>
#include <limits>
#include <memory>
#include <stdexcept>
static void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
int main(){try{
 const unsigned rate=8000,size=premidi::postDelayFrames(rate)*2;
 auto first=std::make_unique<float[]>(size),second=std::make_unique<float[]>(size);
 std::fill(first.get(),first.get()+size,std::numeric_limits<float>::quiet_NaN());
 std::fill(second.get(),second.get()+size,1234.f);
 premidi::ModEffectRecipe p;p.kind=0;p.delay=.01;p.depth=0;p.feedback=.8;p.stereo=0;p.mix=1;
 premidi::ModEffectPrepared prepared(p,rate);premidi::ModEffectState active;active.reset(&prepared,rate,first.get());
 for(unsigned i=0;i<40;i++){float frame[2]={i==0?1.f:0,0};active.process(frame,double(i)/rate);check(frame[0]==0&&frame[1]==0,"An unwritten ring slot was read");}
 // Voice retirement copies only small state and retains the old ring. A new
 // active voice borrows the former retiring slot's independent preallocation.
 auto retiring=active;active.reset(&prepared,rate,second.get());
 for(unsigned i=40;i<170;i++){
  float tail[2]={0,0},fresh[2]={0,0};retiring.process(tail,double(i)/rate);active.process(fresh,double(i-40)/rate);
  check(fresh[0]==0&&fresh[1]==0,"A reused delay leaked the preceding voice");
  if(i==80)check(std::abs(tail[0]-.2)<1e-7,"Voice retirement lost its delay storage");
  if(i==160)check(std::abs(tail[0]-.16)<1e-7,"Voice retirement lost its feedback history");
 }
 std::cout<<"PASS native post-delay age guards, poisoned storage, voice reuse and retiring ownership\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
