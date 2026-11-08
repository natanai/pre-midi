#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <vector>
namespace premidi {
// Stereo feedback bus, shared by all voices with the same authored effect.
// Constructed/owned on the control thread. The callback only reads/writes PCM.
class Delay {
 std::vector<float> ring;std::size_t cursor=0,length;double frames;
 float send,feedback;bool ping;double alpha;std::array<double,2> toneState{};
 // Delay time is the complete echo interval, independent of callback size.
public:
 Delay(double mix,double time,double fb,unsigned rate,double tone=20000,bool pingPong=false):length(static_cast<std::size_t>(std::ceil(time*rate))+2),frames(time*rate),send(static_cast<float>(mix*.55)),feedback(static_cast<float>(fb)),ping(pingPong),alpha(tone<20000?1-std::exp(-2*3.14159265358979323846*tone/rate):1) {ring.resize(2*length);}
 static double tail(double mix,double time,double fb,double tone=20000)noexcept{
  if(!(mix>0))return 0;
  const double repeats=fb>0?std::max(0.,std::ceil(std::log(.00001/(mix*.55*.8))/std::log(fb))):0;
  return (1+repeats)*(time+(tone<20000?.12:0))+repeats*.016+.02;
 }
 void process(const float* input,float* output,unsigned count)noexcept{
  const auto whole=static_cast<std::size_t>(std::floor(frames));const float fraction=static_cast<float>(frames-whole);
  for(unsigned i=0;i<count;i++){
   const auto recent=(cursor+length-whole)%length,older=(recent+length-1)%length;
   std::array<float,2> echoes{};
   for(unsigned ch=0;ch<2;ch++){const float a=ring[2*recent+ch],b=ring[2*older+ch];echoes[ch]=a+(b-a)*fraction;toneState[ch]=alpha*echoes[ch]+(1-alpha)*toneState[ch];}
   for(unsigned ch=0;ch<2;ch++){
    const float echo=echoes[ch];
    ring[2*cursor+ch]=(ping?(ch==0?(input[2*i]+input[2*i+1])*static_cast<float>(std::sqrt(.5)):0):input[2*i+ch])*send+static_cast<float>(toneState[ping?1-ch:ch])*feedback;
    output[2*i+ch]+=echo*.8f;
   }
   if(++cursor==length)cursor=0;
  }
 }
};
}
