#pragma once
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <stdexcept>
namespace premidi {
// Prepared control-side. These linked, feed-forward processors operate on a
// frame AFTER source articulation/gain. They are not master-output protection.
struct DynamicsRecipe {
 enum Mode {compressor,gate,limiter};
 Mode mode=compressor;
 double threshold=-18,ratio=4,knee=6,attack=.01,release=.1,makeup=0,range=60,hold=.02,mix=1;
 double attackCoefficient=0,releaseCoefficient=0,makeupGain=1,ceiling=1;
 unsigned holdFrames=0;
 DynamicsRecipe prepared(unsigned rate)const{
  const auto finite=[](double v,double low,double high){return std::isfinite(v)&&v>=low&&v<=high;};
  if(rate<8000||rate>192000||(mode<compressor||mode>limiter)||!finite(threshold,-96,0)||!finite(ratio,1,40)||!finite(knee,0,24)||!finite(attack,0,1)||!finite(release,.001,5)||!finite(makeup,-24,24)||!finite(range,0,96)||!finite(hold,0,2)||!finite(mix,0,1))throw std::invalid_argument("Invalid dynamics recipe");
  auto p=*this;p.attackCoefficient=attack==0?0:std::exp(-1/(attack*rate));p.releaseCoefficient=std::exp(-1/(release*rate));p.makeupGain=std::pow(10.,makeup/20);p.ceiling=std::pow(10.,threshold/20);p.holdFrames=static_cast<unsigned>(std::ceil(hold*rate));return p;
 }
 double compression(double level)const noexcept{
  const double x=level-threshold,slope=1/ratio-1;
  if(knee==0)return x>0?slope*x:0;
  if(x<=-knee/2)return 0;
  if(x>=knee/2)return slope*x;
  return slope*(x+knee/2)*(x+knee/2)/(2*knee);
 }
};
class Dynamics {
 double reduction=0;unsigned held=0;
public:
 void reset(const DynamicsRecipe& p)noexcept{reduction=p.mode==DynamicsRecipe::gate?-p.range:0;held=0;}
 // Supply all channels together; one maximum-absolute detector and gain keep
 // stereo/surround images linked. No allocation, lookahead, or hidden latency.
 void process(float* frame,std::size_t channels,const DynamicsRecipe& p)noexcept{
  if(!channels||p.mix==0)return;
  double peak=0;for(std::size_t i=0;i<channels;i++)peak=std::max(peak,std::abs(static_cast<double>(frame[i])));
  const double level=20*std::log10(std::max(1e-12,peak));double desired=0;
  if(p.mode==DynamicsRecipe::compressor)desired=p.compression(level);
  else if(p.mode==DynamicsRecipe::gate){
   if(level>=p.threshold){held=p.holdFrames;desired=0;}
   else if(held){held--;desired=0;}else desired=-p.range;
  }else desired=std::min(0.,p.threshold-level);
  // Gain-domain control uses dB reduction. Gate opening uses attack; closing
  // uses release. The sample-peak limiter attacks immediately by definition.
  const bool attacking=p.mode==DynamicsRecipe::gate?desired>reduction:desired<reduction;
  const double coefficient=p.mode==DynamicsRecipe::limiter&&attacking?0:attacking?p.attackCoefficient:p.releaseCoefficient;
  reduction=desired+coefficient*(reduction-desired);
  double gain=std::pow(10.,reduction/20)*(p.mode==DynamicsRecipe::limiter?1:p.makeupGain);
  if(p.mode==DynamicsRecipe::limiter&&peak>0)gain=std::min(gain,p.ceiling/peak);
  const double blended=1-p.mix+p.mix*gain;
  for(std::size_t i=0;i<channels;i++)frame[i]=static_cast<float>(frame[i]*blended);
 }
};
}
