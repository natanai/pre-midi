#pragma once
#include "dynamics.hpp"
#include "modulation-effects.hpp"
#include "automation.hpp"
#include <memory>
namespace premidi {
using PostMeter=std::array<double,postLimit>;
struct PostRecipe {unsigned kind=0,automationMask=0;DynamicsRecipe dynamics;ModEffectRecipe motion;};
inline bool samePostRecipe(const PostRecipe& a,const PostRecipe& b)noexcept{
 if(a.kind!=b.kind||a.automationMask!=b.automationMask)return false;
 if(a.kind>=4)return a.motion==b.motion;
 const auto& p=a.dynamics;const auto& q=b.dynamics;
 return p.mode==q.mode&&p.threshold==q.threshold&&p.ratio==q.ratio&&p.knee==q.knee&&p.attack==q.attack&&p.release==q.release&&p.makeup==q.makeup&&p.range==q.range&&p.hold==q.hold&&p.mix==q.mix&&p.frequency==q.frequency&&p.bandwidth==q.bandwidth&&p.amount==q.amount;
}
inline bool postFieldBounds(unsigned kind,unsigned field,double& low,double& high)noexcept{
 constexpr unsigned common=(1u<<0)|(1u<<1),dynamicsMasks[4]={
  common|(1u<<2)|(1u<<3)|(1u<<4)|(1u<<5)|(1u<<6)|(1u<<7),
  common|(1u<<2)|(1u<<5)|(1u<<6)|(1u<<8)|(1u<<9),
  common|(1u<<2)|(1u<<6),
  common|(1u<<2)|(1u<<5)|(1u<<6)|(1u<<10)|(1u<<11)|(1u<<12)
 };
 if(field>=postAutomationFields||kind>9)return false;
 if(kind<4){
  constexpr double minimum[13]={0,0,-96,1,0,0,.001,-24,0,0,1000,.1,0};
  constexpr double maximum[13]={1,1,0,40,24,1,5,24,96,2,14000,3,24};
  if(!(dynamicsMasks[kind]&(1u<<field)))return false;
  low=minimum[field];high=maximum[field];return true;
 }
 const auto motion=kind-4;
 const unsigned timing=common|(1u<<13)|(1u<<14)|(1u<<15),stereo=timing|(1u<<16)|(1u<<17);
 const unsigned allowed=motion<2?stereo|(1u<<18):motion==2?stereo|(1u<<10):motion==3?timing:common|(1u<<10)|(1u<<15)|(1u<<16);
 if(!(allowed&(1u<<field)))return false;
 low=0;high=1;
 if(field==10){low=motion==2?50:motion==4?0:-2000;high=motion==2?8000:2000;}
 else if(field==13){low=.01;high=20;}
 else if(field==14)high=motion==0?.012:motion==1?.005:motion==2?4:1;
 else if(field==17){low=-.8;high=.8;}
 else if(field==18){low=motion==0?.005:.0002;high=motion==0?.04:.01;}
 return true;
}
struct PreparedPostProcessing {
 unsigned count;std::array<PostRecipe,postLimit> recipes;std::array<std::unique_ptr<ModEffectPrepared>,postLimit> motion{};
 PreparedPostProcessing(unsigned length,const std::array<PostRecipe,postLimit>& input,unsigned rate):count(length),recipes(input){for(unsigned i=0;i<count;i++)if(recipes[i].kind>=4)motion[i]=std::make_unique<ModEffectPrepared>(recipes[i].motion,rate);}
 bool matches(unsigned length,const std::array<PostRecipe,postLimit>& input)const noexcept{if(length!=count)return false;for(unsigned i=0;i<count;i++)if(!samePostRecipe(input[i],recipes[i]))return false;return true;}
};
inline bool usesPostDelay(unsigned length,const std::array<PostRecipe,postLimit>& recipes)noexcept{for(unsigned i=0;i<length;i++)if(recipes[i].kind==4||recipes[i].kind==5||recipes[i].kind==8||recipes[i].kind==9)return true;return false;}
class PostState {
 Dynamics dynamics;ModEffectState motion;
 DynamicsRecipe currentDynamics;
 unsigned rate=48000;
public:
 void reset(const PostRecipe& p,const ModEffectPrepared* prepared,unsigned sampleRate,float* ring)noexcept{
  rate=sampleRate;currentDynamics=p.dynamics;
  if(p.kind<4)dynamics.reset(p.dynamics);else motion.reset(prepared,rate,ring);
 }
 double gainReductionDb(const PostRecipe& p)const noexcept{
  return p.kind<4?dynamics.gainReductionDb(p.automationMask?currentDynamics.mix:p.dynamics.mix):0;
 }
 void process(float* frame,double age,const PostRecipe& p,const AutomatedValues* values=nullptr,unsigned slot=0)noexcept{
  if(!values||!p.automationMask){if(p.kind<4)dynamics.process(frame,2,p.dynamics);else motion.process(frame,age);return;}
  const auto value=[&](unsigned field,double base){return values->post(slot,field,base);};
  if(p.kind<4){
   const auto previous=currentDynamics;auto& d=currentDynamics;const auto& base=p.dynamics;
   d.mix=value(0,base.mix)*value(1,1);d.threshold=value(2,base.threshold);d.ratio=value(3,base.ratio);d.knee=value(4,base.knee);
   d.attack=value(5,base.attack);d.release=value(6,base.release);d.makeup=value(7,base.makeup);d.range=value(8,base.range);
   d.hold=value(9,base.hold);d.frequency=value(10,base.frequency);d.bandwidth=value(11,base.bandwidth);d.amount=value(12,base.amount);
   d.update(previous,rate);dynamics.process(frame,2,d);
  }else{
   auto m=p.motion;m.mix=value(0,m.mix)*value(1,1);m.frequency=value(10,m.frequency);m.rate=value(13,m.rate);m.depth=value(14,m.depth);
   m.phase=value(15,m.phase);m.stereo=value(16,m.stereo);m.feedback=value(17,m.feedback);m.delay=value(18,m.delay);
   motion.process(frame,age,&m,p.automationMask);
  }
 }
};
}
