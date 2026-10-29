#pragma once
#include <array>
#include <algorithm>
#include <cmath>
#if defined(__SSE2__) || defined(_M_X64)
#include <emmintrin.h>
#endif
namespace premidi {
// Streaming polyphase realization of the browser's two-stage Blackman-windowed
// sinc 4x oversampler. No block buffering, lazy initialization or callback heap.
// Reference and upstream notice: THIRD-PARTY-NOTICES.txt, fidelity-policy.json.
struct DriveRecipe {
 std::array<float,128> up{},down{};std::array<float,1024> curve{};float compensation;
 explicit DriveRecipe(double amount):compensation(static_cast<float>(1/(1+amount*1.1))){
  constexpr double p=3.14159265358979323846;
  for(unsigned i=0;i<128;i++){
   const double x=(i+.5)/128,s=p*(static_cast<double>(i)-63.5);
   up[i]=static_cast<float>(std::sin(s)/s*(.42-.5*std::cos(2*p*x)+.08*std::cos(4*p*x)));
   const double j=2*i+1,y=j/256,t=.5*p*(j-128);
   down[i]=static_cast<float>(.5*std::sin(t)/t*(.42-.5*std::cos(2*p*y)+.08*std::cos(4*p*y)));
  }
  const double k=1+std::floor(amount*100+.5)*.65;
  for(unsigned i=0;i<1024;i++)curve[i]=static_cast<float>(std::tanh(k*(2.*i/1023-1))/std::tanh(k));
 }
 float shape(float value)const noexcept{
  const float position=std::clamp(.5f*(value+1)*1023,0.f,1023.f);const auto a=static_cast<unsigned>(position),b=std::min(a+1,1023u);
  return curve[a]+(curve[b]-curve[a])*(position-a);
 }
};
struct FirHistory {
 std::array<float,256> values{};unsigned cursor=0;
 void push(float sample)noexcept{cursor=(cursor+127)%128;values[cursor]=values[cursor+128]=sample;}
 float at(unsigned delay)const noexcept{return values[cursor+delay];}
 float convolve(const std::array<float,128>& kernel)const noexcept{
#if defined(__SSE2__) || defined(_M_X64)
  __m128 a=_mm_setzero_ps(),b=a,c=a,d=a;
  for(unsigned i=0;i<128;i+=16){
   a=_mm_add_ps(a,_mm_mul_ps(_mm_loadu_ps(values.data()+cursor+i),_mm_loadu_ps(kernel.data()+i)));
   b=_mm_add_ps(b,_mm_mul_ps(_mm_loadu_ps(values.data()+cursor+i+4),_mm_loadu_ps(kernel.data()+i+4)));
   c=_mm_add_ps(c,_mm_mul_ps(_mm_loadu_ps(values.data()+cursor+i+8),_mm_loadu_ps(kernel.data()+i+8)));
   d=_mm_add_ps(d,_mm_mul_ps(_mm_loadu_ps(values.data()+cursor+i+12),_mm_loadu_ps(kernel.data()+i+12)));
  }
  std::array<float,4> out{};_mm_storeu_ps(out.data(),_mm_add_ps(_mm_add_ps(a,b),_mm_add_ps(c,d)));return (out[0]+out[1])+(out[2]+out[3]);
#else
  float a=0,b=0,c=0,d=0;for(unsigned i=0;i<128;i+=4){a+=values[cursor+i]*kernel[i];b+=values[cursor+i+1]*kernel[i+1];c+=values[cursor+i+2]*kernel[i+2];d+=values[cursor+i+3]*kernel[i+3];}return (a+b)+(c+d);
#endif
 }
};
struct Upsample2 {
 FirHistory history;
 std::array<float,2> next(float input,const DriveRecipe& recipe)noexcept{history.push(input);return {history.at(64),history.convolve(recipe.up)};}
};
struct Downsample2 {
 FirHistory odd,even;float previous=0;
 float next(float a,float b,const DriveRecipe& recipe)noexcept{odd.push(previous);even.push(a);previous=b;return odd.convolve(recipe.down)+.5f*even.at(64);}
};
class Drive {
 const DriveRecipe* recipe;Upsample2 first,second;Downsample2 third,fourth;
public:
 explicit Drive(const DriveRecipe* input=nullptr)noexcept:recipe(input){}
 float process(float input)noexcept{
  if(!recipe)return input;
  const auto up=first.next(input,*recipe),a=second.next(up[0],*recipe),b=second.next(up[1],*recipe);
  const float low=third.next(recipe->shape(a[0]),recipe->shape(a[1]),*recipe),high=third.next(recipe->shape(b[0]),recipe->shape(b[1]),*recipe);
  return fourth.next(low,high,*recipe)*recipe->compensation;
 }
};
}
