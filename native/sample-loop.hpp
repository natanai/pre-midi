#pragma once
#include "sample.hpp"
namespace premidi {
// The browser prepares these same integer-frame crossfade taps in an ordinary
// AudioBuffer. Native rendering evaluates them without copying the asset or
// allocating callback memory; interpolation happens after the tap crossfade.
struct SampleLoop {
 std::uint64_t start=0,end=0,fade=0;
 SampleLoop()noexcept=default;
 SampleLoop(double a,double b,double f,unsigned rate)noexcept:start(std::llround(a*rate)),end(std::llround(b*rate)),fade(std::llround(f*rate)){}
 double wrap(double position)const noexcept{
  return position<end?position:start+fade+std::fmod(position-end,static_cast<double>(end-start-fade));
 }
 float tap(const SampleData& data,std::uint64_t n,unsigned ch)const noexcept{
  if(n>=end)n=start+fade+(n-end)%(end-start-fade);
  const float raw=data.pcm[n*data.channels+ch];
  if(!fade||n<end-fade)return raw;
  const double mix=static_cast<double>(n-(end-fade))/fade;
  return static_cast<float>(raw*(1-mix)+data.pcm[(start+n-(end-fade))*data.channels+ch]*mix);
 }
 float at(const SampleData& data,double position,unsigned ch)const noexcept{
  const auto a=static_cast<std::uint64_t>(position);const float x=tap(data,a,ch),y=tap(data,a+1,ch);
  return static_cast<float>(x+(y-x)*(position-a));
 }
};
}
