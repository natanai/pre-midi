#pragma once
// Control-side preparation only. No instance or transformed-buffer ownership
// enters a device callback: playback borrows immutable ordinary SampleData.
#include "sample.hpp"
#include "vendor/signalsmith-stretch/signalsmith-stretch.h"
namespace premidi {
struct SourceRecipe {double start=0,duration=1,time=1,semitones=0,formant=0;unsigned preserve=1,reverse=0;};
inline std::vector<float> processSource(const SampleData& source,const SourceRecipe& p){
 const auto bounded=[](double v,double a,double b){return std::isfinite(v)&&v>=a&&v<=b;};
 if(!bounded(p.start,0,301)||!bounded(p.duration,.00001,301)||!bounded(p.time,.5,2)||!bounded(p.semitones,-48,48)||!bounded(p.formant,-12,12)||p.preserve>1||p.reverse>1)throw std::runtime_error("Invalid source pitch/time parameters");
 const auto first=static_cast<std::uint64_t>(std::floor(p.start*source.rate+1e-7)),last=std::min(source.frames,static_cast<std::uint64_t>(std::round((p.start+p.duration)*source.rate)));
 if(first>=last)throw std::runtime_error("Source region is empty");
 const unsigned channels=source.channels;const auto count=last-first,outputCount=static_cast<std::uint64_t>(std::round(count*p.time));
 if(outputCount<1||outputCount>std::uint64_t(source.rate)*602||outputCount*channels>128000000)throw std::runtime_error("Processed source exceeds the PCM memory or duration limit");
 const bool spectral=p.time!=1||p.semitones!=0||p.formant!=0;
 if(spectral&&channels>2)throw std::runtime_error("Independent pitch/time/formants support mono or stereo sources; downmix the recording first");
 if((count+outputCount)*channels*sizeof(float)>256ull*1024*1024)throw std::runtime_error("Source processing scratch exceeds 256 MiB");
 std::vector<float> result(outputCount*channels);
 if(!spectral){for(std::uint64_t i=0;i<count;i++)for(unsigned c=0;c<channels;c++)result[i*channels+c]=source.pcm[(p.reverse?last-1-i:first+i)*channels+c];return result;}
 signalsmith::stretch::SignalsmithStretch<float> stretch(0);
 stretch.presetDefault(channels,source.rate);stretch.setTransposeSemitones(p.semitones,8000.f/source.rate);stretch.setFormantSemitones(p.formant,p.preserve!=0);stretch.setFormantBase(0);
 const auto inLatency=stretch.inputLatency(),outLatency=stretch.outputLatency();
 std::vector<std::vector<float>> inputs(channels,std::vector<float>(count+inLatency)),outputs(channels,std::vector<float>(outputCount+outLatency));
 std::vector<const float*> in(channels);std::vector<float*> out(channels);
 for(unsigned c=0;c<channels;c++){for(std::uint64_t i=0;i<count;i++)inputs[c][i]=source.pcm[(p.reverse?last-1-i:first+i)*channels+c];in[c]=inputs[c].data();out[c]=outputs[c].data();}
 stretch.seek(in,inLatency,1/p.time);for(auto& ptr:in)ptr+=inLatency;
 stretch.process(in,static_cast<int>(count),out,static_cast<int>(outputCount));for(auto& ptr:out)ptr+=outputCount;
 stretch.flush(out,outLatency);
 for(std::uint64_t i=0;i<outputCount;i++)for(unsigned c=0;c<channels;c++){const float value=outputs[c][i+outLatency];if(!std::isfinite(value)||std::abs(value)>32)throw std::runtime_error("Source processor exceeded its finite output bound");result[i*channels+c]=value;}
 return result;
}
}
