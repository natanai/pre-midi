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
 float send,feedback;
 // Web Audio's feedback cycle contributes one 128-frame render quantum.
 // Keep that acoustic timing independent of the native device callback size.
 std::array<float,256> feedbackRing{};unsigned feedbackCursor=0;
public:
 Delay(double mix,double time,double fb,unsigned rate):length(static_cast<std::size_t>(std::ceil(time*rate))+2),frames(time*rate),send(static_cast<float>(mix*.55)),feedback(static_cast<float>(fb)) {ring.resize(2*length);}
 static double tail(double mix,double time,double fb)noexcept{
  if(!(mix>0))return 0;
  const double repeats=fb>0?std::max(0.,std::ceil(std::log(.00001/(mix*.55*.8))/std::log(fb))):0;
  return (1+repeats)*time+repeats*.016+.02;
 }
 void process(const float* input,float* output,unsigned count)noexcept{
  const auto whole=static_cast<std::size_t>(std::floor(frames));const float fraction=static_cast<float>(frames-whole);
  for(unsigned i=0;i<count;i++){
   const auto recent=(cursor+length-whole)%length,older=(recent+length-1)%length;
   for(unsigned ch=0;ch<2;ch++){
    const float a=ring[2*recent+ch],b=ring[2*older+ch],echo=a+(b-a)*fraction;
    ring[2*cursor+ch]=input[2*i+ch]*send+feedbackRing[2*feedbackCursor+ch]*feedback;
    feedbackRing[2*feedbackCursor+ch]=echo;
    output[2*i+ch]+=echo*.8f;
   }
   if(++cursor==length)cursor=0;
   if(++feedbackCursor==128)feedbackCursor=0;
  }
 }
};
}
