#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <memory>
#include <stdexcept>
#include <vector>
namespace premidi {
struct SampleData {
 unsigned rate,channels;std::uint64_t frames;std::vector<float> pcm;float normalization=1;
 SampleData(const float* input,std::uint64_t count,unsigned sourceRate,unsigned channelCount,unsigned outputRate):rate(outputRate),channels(channelCount),frames(0){
  if(sourceRate<8000||sourceRate>192000||rate<8000||rate>192000||channels<1||channels>32||!count||count>std::uint64_t(sourceRate)*301||count*channels>128000000)throw std::runtime_error("Invalid native sample dimensions");
  frames=static_cast<std::uint64_t>(std::ceil(static_cast<double>(count)*outputRate/sourceRate));if(frames*channels>128000000)throw std::runtime_error("Native resampled asset exceeds 512 MB");
  for(std::uint64_t i=0;i<count*channels;i++)if(!std::isfinite(input[i])||std::abs(input[i])>32)throw std::runtime_error("Invalid native sample PCM");
  pcm.resize(static_cast<std::size_t>(frames)*channels);
  if(sourceRate==rate)std::copy(input,input+count*channels,pcm.begin());
  else{
   // Control-side band-limited rate conversion; note playback remains the
   // canonical linear AudioBufferSource interpolation at the device rate.
   constexpr unsigned phases=1024,taps=64;constexpr double pi=3.14159265358979323846;
   const double cutoff=.94*std::min(1.,static_cast<double>(rate)/sourceRate);
   std::vector<float> kernels(phases*taps);
   for(unsigned phase=0;phase<phases;phase++){
    double sum=0;for(unsigned k=0;k<taps;k++){
     const double x=static_cast<double>(k)-31-static_cast<double>(phase)/phases,s=pi*x*cutoff;
     const double window=.42-.5*std::cos(2*pi*k/(taps-1))+.08*std::cos(4*pi*k/(taps-1));
     const float value=static_cast<float>((std::abs(s)<1e-12?1:std::sin(s)/s)*cutoff*window);kernels[phase*taps+k]=value;sum+=value;
    }
    for(unsigned k=0;k<taps;k++)kernels[phase*taps+k]=static_cast<float>(kernels[phase*taps+k]/sum);
   }
   for(std::uint64_t frame=0;frame<frames;frame++){
    const double position=static_cast<double>(frame)*sourceRate/rate;const auto base=static_cast<std::int64_t>(position);const auto phase=std::min(phases-1,static_cast<unsigned>((position-base)*phases));
    for(unsigned ch=0;ch<channels;ch++){double sum=0;for(unsigned k=0;k<taps;k++){const auto at=base+static_cast<std::int64_t>(k)-31;if(at>=0&&static_cast<std::uint64_t>(at)<count)sum+=input[static_cast<std::uint64_t>(at)*channels+ch]*kernels[phase*taps+k];}pcm[frame*channels+ch]=static_cast<float>(sum);}
   }
  }
  float peak=0;for(std::uint64_t frame=0;frame<frames;frame+=4)for(unsigned ch=0;ch<channels;ch++)peak=std::max(peak,std::abs(pcm[frame*channels+ch]));
  normalization=std::clamp(.65f/std::max(.08f,peak),.5f,5.f);
 }
 float at(double position,unsigned channel)const noexcept{
  if(position<0||position>=frames)return 0;
  const auto a=static_cast<std::uint64_t>(position),b=std::min(a+1,frames-1);const float x=pcm[a*channels+channel],y=pcm[b*channels+channel];
  return static_cast<float>(x+(y-x)*(position-a));
 }
};
using SampleStore=std::vector<std::shared_ptr<const SampleData>>;
}
