#pragma once
#include <algorithm>
#include <cmath>
namespace premidi {
// Web Audio legacy resonance: dB for low/highpass, linear Q for bandpass/notch.
class Biquad {
 double b0=1,b1=0,b2=0,a1=0,a2=0,z1=0,z2=0;
public:
 void configure(unsigned type,double cutoff,double q,double rate) noexcept {
  const double w=2*3.14159265358979323846*std::clamp(cutoff,0.,rate/2)/rate,c=std::cos(w),s=std::sin(w);
  const double alpha=s/(2*(type<2?std::pow(10.,q/20.):q)),a0=1+alpha;
  a1=-2*c/a0;a2=(1-alpha)/a0;
  if(type==0){b0=(1-c)/2/a0;b1=(1-c)/a0;b2=b0;}
  else if(type==1){b0=(1+c)/2/a0;b1=-(1+c)/a0;b2=b0;}
  else if(type==2){b0=alpha/a0;b1=0;b2=-b0;}
  else{b0=1/a0;b1=-2*c/a0;b2=b0;}
 }
 float process(float input) noexcept {
  const double output=b0*input+z1;z1=b1*input-a1*output+z2;z2=b2*input-a2*output;
  // Explicit portable denormal suppression; no host-wide floating-point flags.
  if(std::abs(z1)<1e-30)z1=0;
  if(std::abs(z2)<1e-30)z2=0;
  return static_cast<float>(output);
 }
};
}
