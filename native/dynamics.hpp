#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <stdexcept>
namespace premidi {
// Prepared control-side. These linked, feed-forward processors operate on a
// frame AFTER source articulation/gain. They are not master-output protection.
struct DynamicsRecipe {
 enum Mode {compressor,gate,limiter,deesser};
 Mode mode=compressor;
 double threshold=-18,ratio=4,knee=6,attack=.01,release=.1,makeup=0,range=60,hold=.02,mix=1;
 double frequency=6500,bandwidth=1,amount=9;
 std::array<double,5> band{1,0,0,0,0};
 double attackCoefficient=0,releaseCoefficient=0,makeupGain=1,ceiling=1;
 unsigned holdFrames=0;
 DynamicsRecipe prepared(unsigned rate)const{
  const auto finite=[](double v,double low,double high){return std::isfinite(v)&&v>=low&&v<=high;};
  if(rate<8000||rate>192000||(mode<compressor||mode>deesser)||!finite(threshold,-96,0)||!finite(ratio,1,40)||!finite(knee,0,24)||!finite(attack,0,1)||!finite(release,.001,5)||!finite(makeup,-24,24)||!finite(range,0,96)||!finite(hold,0,2)||!finite(mix,0,1)||!finite(frequency,1000,14000)||!finite(bandwidth,.1,3)||!finite(amount,0,24))throw std::invalid_argument("Invalid dynamics recipe");
  auto p=*this;p.attackCoefficient=attack==0?0:std::exp(-1/(attack*rate));p.releaseCoefficient=std::exp(-1/(release*rate));p.makeupGain=std::pow(10.,makeup/20);p.ceiling=std::pow(10.,threshold/20);p.holdFrames=static_cast<unsigned>(std::ceil(hold*rate));
  if(mode==deesser){
   // RBJ constant-0-dB-peak BPF with octave bandwidth and BLT correction.
   // https://www.w3.org/TR/audio-eq-cookbook/#formulae
   const double w=2*3.14159265358979323846*std::min(frequency,rate*.45)/rate,s=std::sin(w),alpha=s*std::sinh(std::log(2.)/2*bandwidth*w/s),a0=1+alpha;
   p.band={alpha/a0,0,-alpha/a0,-2*std::cos(w)/a0,(1-alpha)/a0};
  }
  return p;
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
 std::array<std::array<double,4>,2> history{};
 float filtered(float input,std::size_t channel,const DynamicsRecipe& p)noexcept{
  auto& h=history[channel];const auto& c=p.band;
  const double output=c[0]*input+c[1]*h[0]+c[2]*h[1]-c[3]*h[2]-c[4]*h[3];
  h[1]=h[0];h[0]=input;h[3]=h[2];h[2]=std::abs(output)<1e-30?0:output;
  return static_cast<float>(output);
 }
public:
 void reset(const DynamicsRecipe& p)noexcept{reduction=p.mode==DynamicsRecipe::gate?-p.range:0;held=0;history={};}
 // Supply all channels together; one maximum-absolute detector and gain keep
 // stereo images linked. De-essing is applied to the selected band only.
 // All production voices have already been downmixed to stereo at this point.
 // No allocation, lookahead, or hidden block latency.
 void process(float* frame,std::size_t channels,const DynamicsRecipe& p)noexcept{
  if(!channels||p.mix==0)return;
  const bool selective=p.mode==DynamicsRecipe::deesser;
  std::array<float,2> selected{};
  if(selective){channels=std::min(channels,selected.size());for(std::size_t i=0;i<channels;i++)selected[i]=filtered(frame[i],i,p);}
  double peak=0;for(std::size_t i=0;i<channels;i++)peak=std::max(peak,std::abs(static_cast<double>(selective?selected[i]:frame[i])));
  const double level=20*std::log10(std::max(1e-12,peak));double desired=0;
  if(p.mode==DynamicsRecipe::compressor)desired=p.compression(level);
  else if(p.mode==DynamicsRecipe::gate){
   if(level>=p.threshold){held=p.holdFrames;desired=0;}
   else if(held){held--;desired=0;}else desired=-p.range;
  }else{desired=std::min(0.,p.threshold-level);if(selective)desired=std::max(-p.amount,desired);}
  // Gain-domain control uses dB reduction. Gate opening uses attack; closing
  // uses release. The sample-peak limiter attacks immediately by definition.
  const bool attacking=p.mode==DynamicsRecipe::gate?desired>reduction:desired<reduction;
  const double coefficient=p.mode==DynamicsRecipe::limiter&&attacking?0:attacking?p.attackCoefficient:p.releaseCoefficient;
  reduction=desired+coefficient*(reduction-desired);
  double gain=std::pow(10.,reduction/20)*(p.mode==DynamicsRecipe::limiter||selective?1:p.makeupGain);
  if(p.mode==DynamicsRecipe::limiter&&peak>0)gain=std::min(gain,p.ceiling/peak);
  const double blended=1-p.mix+p.mix*gain;
  for(std::size_t i=0;i<channels;i++)frame[i]=static_cast<float>(selective?frame[i]+selected[i]*(blended-1):frame[i]*blended);
 }
};
}
