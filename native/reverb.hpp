#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <vector>
#include <stdexcept>
namespace premidi {
struct ReverbRecipe{
 double mix=0,preDelay=.02,decay=1.5,damping=.45,size=.5,width=1;
 bool operator==(const ReverbRecipe& r)const noexcept{return mix==r.mix&&preDelay==r.preDelay&&decay==r.decay&&damping==r.damping&&size==r.size&&width==r.width;}
 void validate()const{
  const auto bound=[](double v,double a,double b){return std::isfinite(v)&&v>=a&&v<=b;};
  if(!bound(mix,0,1)||!bound(preDelay,0,.2)||!bound(decay,.2,6)||!bound(damping,0,1)||!bound(size,0,1)||!bound(width,0,1))throw std::invalid_argument("Invalid reverb recipe");
 }
 double tail()const noexcept{return mix>0?preDelay+3*decay+.5:0;}
};
// Schroeder parallel comb/cascaded-allpass topology, JAES 10(3), 1962.
// All storage is control-owned. process() allocates, locks and destroys nothing.
class Reverb{
 struct Comb{std::vector<float> ring;std::size_t at=0;double state=0,feedback=0,level=0;};
 struct Diffuser{std::vector<float> ring;std::size_t at=0;};
 ReverbRecipe p;std::vector<float> pre;std::size_t preFrames=0,preCursor=0;
 std::array<Comb,8> combs;std::array<Diffuser,4> diffusers;double alpha;
public:
 Reverb(const ReverbRecipe& recipe,unsigned rate):p(recipe){
  p.validate();if(rate<8000||rate>192000)throw std::invalid_argument("Invalid reverb rate");
  preFrames=static_cast<std::size_t>(std::llround(p.preDelay*rate));pre.resize(std::max(std::size_t(1),preFrames)*2);
  alpha=1-std::exp(-2*3.14159265358979323846*std::min(rate*.45,1000*std::pow(18.,1-p.damping))/rate);
  const double size=.5+p.size;constexpr unsigned lengths[]{1557,1617,1491,1422},diffuse[]{225,556};
  for(unsigned i=0;i<8;i++){
   auto& c=combs[i];const auto length=std::max(1ll,std::llround((lengths[i%4]*size+(i>=4?23:0))*rate/44100));c.ring.resize(static_cast<std::size_t>(length));
   c.feedback=std::pow(10.,-3.*length/rate/p.decay);c.level=std::sqrt(1-c.feedback*c.feedback);
  }
  for(unsigned i=0;i<4;i++)diffusers[i].ring.resize(static_cast<std::size_t>(std::max(1ll,std::llround((diffuse[i%2]*size+(i>=2?23:0))*rate/44100))));
 }
 void process(const float* input,float* output,unsigned count)noexcept{
  for(unsigned n=0;n<count;n++){
   float left=input[2*n],right=input[2*n+1];
   if(preFrames){const auto at=preCursor*2;const float a=pre[at],b=pre[at+1];pre[at]=left;pre[at+1]=right;left=a;right=b;if(++preCursor==preFrames)preCursor=0;}
   const float send=static_cast<float>((static_cast<double>(left)+right)*.5);double a=0,b=0;
   for(unsigned i=0;i<8;i++){
    auto& c=combs[i];const float delayed=c.ring[c.at];c.state=alpha*delayed+(1-alpha)*c.state;if(std::abs(c.state)<1e-30)c.state=0;
    c.ring[c.at]=static_cast<float>(send+c.feedback*c.state);if(++c.at==c.ring.size())c.at=0;
    if(i<4)a+=delayed*c.level*.25;else b+=delayed*c.level*.25;
   }
   for(unsigned i=0;i<4;i++){
    auto& d=diffusers[i];const double source=i<2?a:b,value=d.ring[d.at]-.5*source;d.ring[d.at]=static_cast<float>(source+.5*value);if(++d.at==d.ring.size())d.at=0;
    if(i<2)a=value;else b=value;
   }
   const double mid=(a+b)*.5,side=(a-b)*.5*p.width,gain=p.mix*.8;
   output[2*n]+=static_cast<float>((mid+side)*gain);output[2*n+1]+=static_cast<float>((mid-side)*gain);
  }
 }
};
}
