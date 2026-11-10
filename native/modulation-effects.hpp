#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <stdexcept>
namespace premidi {
constexpr unsigned motionTableSize=1024,postLimit=4;
constexpr double modDelaySeconds=.06;
inline unsigned postDelayFrames(unsigned rate)noexcept{return static_cast<unsigned>(std::ceil(modDelaySeconds*rate))+2;}
struct ModEffectRecipe {
 unsigned kind=0; // chorus, flanger, phaser, auto-pan
 double rate=.5,depth=.004,phase=0,stereo=.25,feedback=.1,delay=.018,frequency=1000,mix=.5;
 bool usesDelay()const noexcept{return kind<2;}
 void validate()const{
  const auto bounded=[](double v,double a,double b){return std::isfinite(v)&&v>=a&&v<=b;};
  if(kind>3||!bounded(rate,.0025,32)||!bounded(phase,0,1)||!bounded(stereo,0,1)||!bounded(feedback,-.8,.8)||!bounded(mix,0,1)||
   !bounded(depth,0,kind==0?.012:kind==1?.005:kind==2?4:1)||!bounded(delay,kind==0?.005:kind==1?.0002:.0002,kind==0?.04:.01)||!bounded(frequency,50,8000))throw std::invalid_argument("Invalid modulation effect recipe");
  if(kind==3&&(feedback!=0||stereo!=0))throw std::invalid_argument("Invalid auto-pan stereo or feedback");
 }
 bool operator==(const ModEffectRecipe& p)const noexcept{return kind==p.kind&&rate==p.rate&&depth==p.depth&&phase==p.phase&&stereo==p.stereo&&feedback==p.feedback&&delay==p.delay&&frequency==p.frequency&&mix==p.mix;}
};
struct ModEffectPrepared {
 ModEffectRecipe recipe;
 std::array<double,motionTableSize*4> table{};
 explicit ModEffectPrepared(const ModEffectRecipe& p,unsigned rate):recipe(p){
  p.validate();if(rate<8000||rate>192000)throw std::invalid_argument("Invalid modulation effect sample rate");
  constexpr double pi=3.14159265358979323846;
  for(unsigned i=0;i<motionTableSize;i++)for(unsigned ch=0;ch<2;ch++){
   const double angle=2*pi*(double(i)/motionTableSize+p.phase+(ch?p.stereo:0)),wave=std::sin(angle);const auto at=i*4+ch*2;
   if(p.usesDelay())table[at]=std::clamp((p.delay+p.depth*wave)*rate,1.,modDelaySeconds*rate);
   else if(p.kind==2){const double f=std::clamp(p.frequency*std::pow(2.,p.depth*wave),20.,rate*.45),g=std::tan(pi*f/rate),a=(g-1)/(g+1);table[at]=a;table[at+1]=std::sqrt(std::max(0.,1-a*a));}
   else {const double pan=p.depth*std::sin(2*pi*(double(i)/motionTableSize+p.phase)),anglePan=(pan+1)*pi/4;table[at]=p.depth==0?1:std::sqrt(2.)*(ch?std::sin(anglePan):std::cos(anglePan));}
  }
 }
};
// Small callback state borrows preallocated per-voice delay storage. Reuse does
// not clear the ring: age guards prevent reading a prior voice's unwritten slots.
class ModEffectState {
 const ModEffectPrepared* prepared=nullptr;float* ring=nullptr;
 std::array<double,12> states{};std::array<double,2> prior{};
 unsigned capacity=0,cursor=0,age=0;
public:
 void reset(const ModEffectPrepared* p,unsigned rate,float* storage)noexcept{prepared=p;ring=p&&p->recipe.usesDelay()?storage:nullptr;capacity=postDelayFrames(rate);cursor=age=0;states={};prior={};}
 void process(float* frame,double seconds)noexcept{
  if(!prepared)return;
  const auto& p=prepared->recipe;const auto& table=prepared->table;
  const double cycles=seconds*p.rate,position=(cycles-std::floor(cycles))*motionTableSize;const auto index=static_cast<unsigned>(position),next=(index+1)%motionTableSize;const double t=position-index;
  for(unsigned ch=0;ch<2;ch++){
   const auto at=index*4+ch*2,other=next*4+ch*2;const double a=table[at]+(table[other]-table[at])*t,input=frame[ch];double wet=0;
   if(p.usesDelay()){
    if(!ring){frame[ch]=0;continue;} // admission checks reject missing storage before publication
    const auto whole=static_cast<unsigned>(a),recent=(cursor+capacity-whole)%capacity,older=(recent+capacity-1)%capacity;const double fraction=a-whole;
    const double v=age>=whole?ring[recent*2+ch]:0,w=age>=whole+1?ring[older*2+ch]:0;
    wet=v+(w-v)*fraction;ring[cursor*2+ch]=static_cast<float>(input*(1-std::abs(p.feedback))+p.feedback*wet);
   }else if(p.kind==2){
    const double b=table[at+1]+(table[other+1]-table[at+1])*t;wet=input*(1-std::abs(p.feedback))+p.feedback*prior[ch];
    for(unsigned n=0;n<6;n++){const auto offset=ch*6+n;const double z=states[offset],y=a*wet+b*z;states[offset]=b*wet-a*z;if(std::abs(states[offset])<1e-30)states[offset]=0;wet=y;}prior[ch]=std::abs(wet)<1e-30?0:wet;
   }else wet=input*a;
   frame[ch]=static_cast<float>((1-p.mix)*input+p.mix*wet);
  }
  if(ring){if(++cursor==capacity)cursor=0;age=std::min(capacity,age+1);}
 }
};
}
