#pragma once
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <vector>

namespace premidi {
// Aligned with src/dsp/pitch-correction.js. This is control-thread DSP.
constexpr double pitchCorrectionUpdate=.01;
inline bool validPitchCorrection(double amount,double response,unsigned mask){
 return std::isfinite(amount)&&amount>=0&&amount<=1&&std::isfinite(response)&&response>=.02&&response<=.3&&mask<=4095&&(!amount||mask);
}
inline int nearestScaleNote(double note,unsigned mask){
 const auto center=static_cast<int>(std::floor(note));
 int selected=center;
 double distance=100;
 for(int candidate=center-11;candidate<=center+12;candidate++){
  if(!(mask&(1u<<((candidate%12+12)%12))))continue;
  const double error=std::abs(candidate-note);
  if(error<distance){selected=candidate;distance=error;}
 }
 return selected;
}
inline double detectPeriod(const std::vector<float>& mono,std::size_t start,std::size_t width,
 std::size_t minLag,std::size_t maxLag,std::vector<double>& normalized){
 double power=0,sum=0;
 for(std::size_t i=0;i<width;i++){const double v=mono[start+i];sum+=v;power+=v*v;}
 const double variance=power-sum*sum/width;
 if(variance<width*1.6e-5)return 0;
 double total=0;
 normalized[0]=1;
 for(std::size_t lag=1;lag<=maxLag+1;lag++){
  double delta=0;
  for(std::size_t i=start;i<start+width;i++){const double d=double(mono[i])-mono[i+lag];delta+=d*d;}
  total+=delta;normalized[lag]=total>0?delta*lag/total:1;
 }
 std::size_t lag=minLag;
 while(lag<=maxLag&&(normalized[lag]>.12||normalized[lag]>normalized[lag+1]||normalized[lag]>normalized[lag-1]))lag++;
 if(lag>maxLag)return 0;
 const double a=normalized[lag-1],b=normalized[lag],c=normalized[lag+1];
 const double period=lag+std::clamp((a-c)/std::max(1e-12,2*(a-2*b+c)),-.5,.5);
 const double cycles=std::max(1.,std::floor(width/period));
 const auto size=std::min(width,static_cast<std::size_t>(std::round(cycles*period)));
 const double angle=6.28318530717958647692/period;
 double cosine=0,sine=0;
 for(std::size_t i=0;i<size;i++){
  const double v=mono[start+i]-sum/width;
  cosine+=v*std::cos(angle*i);sine+=v*std::sin(angle*i);
 }
 return (cosine*cosine+sine*sine)*2*width>=.075*variance*size*size?period:0;
}
inline bool compatiblePitch(const std::vector<float>& primary,const std::vector<float>& secondary,
 std::size_t start,std::size_t width,double period){
 const auto lag=static_cast<std::size_t>(std::floor(period));
 const double fraction=period-lag;
 double referencePower=0,otherPower=0,difference=0;
 for(std::size_t i=start;i<start+width;i++){
  const double a=primary[i],b=secondary[i],next=secondary[i+lag]+fraction*(secondary[i+lag+1]-secondary[i+lag]);
  referencePower+=a*a;otherPower+=b*b;difference+=(b-next)*(b-next);
 }
 return otherPower<referencePower*.1||difference<otherPower*.22;
}
template<typename Sample>
std::vector<float> preparePitchCorrection(Sample&& sample,std::size_t channels,std::size_t length,double rate,double amount,double response,unsigned mask){
 if(!amount)return {};
 const auto hop=static_cast<std::size_t>(std::round(rate*pitchCorrectionUpdate));
 const auto stride=std::max<std::size_t>(1,static_cast<std::size_t>(std::round(rate/8000)));
 const auto count=length/stride;
 const double analysisRate=rate/stride;
 const auto width=static_cast<std::size_t>(std::round(analysisRate*.03));
 const auto minLag=std::max<std::size_t>(2,static_cast<std::size_t>(std::floor(analysisRate/1000)));
 const auto maxLag=static_cast<std::size_t>(std::ceil(analysisRate/65));
 if(count<=width+maxLag+1)return {};
 std::size_t strongest=0;
 double energy=-1;
 for(std::size_t c=0;c<channels;c++){
  double power=0;
  for(std::size_t i=0;i<length;i+=stride){const double v=sample(i,c);power+=v*v;}
  if(power>energy){strongest=c;energy=power;}
 }
 const auto reduce=[&](std::size_t channel){
  std::vector<float> mono(count);
  for(std::size_t i=0;i<count;i++){
   double sum=0;
   for(std::size_t k=0;k<stride;k++)sum+=sample(i*stride+k,channel);
   mono[i]=static_cast<float>(sum/stride);
  }
  return mono;
 };
 const auto mono=reduce(strongest),other=channels==2?reduce(1-strongest):std::vector<float>{};
 std::vector<double> normalized(maxLag+2);
 std::vector<float> curve((length+hop-1)/hop);
 const double alpha=1-std::exp(-static_cast<double>(hop)/(rate*response));
 double shift=0;
 int lastTarget=-1000;
 bool audibleCorrection=false;
 for(std::size_t i=0;i<curve.size();i++){
  const auto center=i*hop/stride,start=std::min(center>width/2?center-width/2:0,count-width-maxLag-2);
  const double period=detectPeriod(mono,start,width,minLag,maxLag,normalized);
  if(!period||(!other.empty()&&!compatiblePitch(mono,other,start,width,period))){shift=0;lastTarget=-1000;continue;}
  const double note=69+12*std::log2(analysisRate/(440*period));
  int target=nearestScaleNote(note,mask);
  if(std::abs(lastTarget-note)<std::abs(target-note)+.12)target=lastTarget;
  lastTarget=target;
  const double desired=std::clamp((target-note)*amount,-3.,3.);
  shift+=alpha*(desired-shift);curve[i]=static_cast<float>(shift);
  audibleCorrection|=std::abs(shift)>.005;
 }
 if(!audibleCorrection)curve.clear();
 return curve;
}
}
