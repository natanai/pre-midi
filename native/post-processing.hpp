#pragma once
#include "dynamics.hpp"
#include "modulation-effects.hpp"
#include <memory>
namespace premidi {
struct PostRecipe {unsigned kind=0;DynamicsRecipe dynamics;ModEffectRecipe motion;};
inline bool samePostRecipe(const PostRecipe& a,const PostRecipe& b)noexcept{
 if(a.kind!=b.kind)return false;
 if(a.kind>=4)return a.motion==b.motion;
 const auto& p=a.dynamics;const auto& q=b.dynamics;
 return p.mode==q.mode&&p.threshold==q.threshold&&p.ratio==q.ratio&&p.knee==q.knee&&p.attack==q.attack&&p.release==q.release&&p.makeup==q.makeup&&p.range==q.range&&p.hold==q.hold&&p.mix==q.mix&&p.frequency==q.frequency&&p.bandwidth==q.bandwidth&&p.amount==q.amount;
}
struct PreparedPostProcessing {
 unsigned count;std::array<PostRecipe,postLimit> recipes;std::array<std::unique_ptr<ModEffectPrepared>,postLimit> motion{};
 PreparedPostProcessing(unsigned length,const std::array<PostRecipe,postLimit>& input,unsigned rate):count(length),recipes(input){for(unsigned i=0;i<count;i++)if(recipes[i].kind>=4)motion[i]=std::make_unique<ModEffectPrepared>(recipes[i].motion,rate);}
 bool matches(unsigned length,const std::array<PostRecipe,postLimit>& input)const noexcept{if(length!=count)return false;for(unsigned i=0;i<count;i++)if(!samePostRecipe(input[i],recipes[i]))return false;return true;}
};
inline bool usesPostDelay(unsigned length,const std::array<PostRecipe,postLimit>& recipes)noexcept{for(unsigned i=0;i<length;i++)if(recipes[i].kind==4||recipes[i].kind==5||recipes[i].kind==8||recipes[i].kind==9)return true;return false;}
class PostState {
 Dynamics dynamics;ModEffectState motion;
public:
 void reset(const PostRecipe& p,const ModEffectPrepared* prepared,unsigned rate,float* ring)noexcept{if(p.kind<4)dynamics.reset(p.dynamics);else motion.reset(prepared,rate,ring);}
 void process(float* frame,double age,const PostRecipe& p)noexcept{if(p.kind<4)dynamics.process(frame,2,p.dynamics);else motion.process(frame,age);}
};
}
