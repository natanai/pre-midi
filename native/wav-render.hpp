#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include "device-host.h"

namespace premidi {
// ITU-R BS.1770-5 Annex 2, four-phase integer coefficients scaled by 2^14.
// Keep these in sync with src/dsp/wav-export.js.
class RenderMeter {
 static constexpr int phases[4][12]={
  {28,180,-322,544,-974,2250,15928,-1676,780,-436,244,-136},
  {-478,480,-848,1460,-2728,7620,12776,-3282,1664,-954,542,-310},
  {-310,542,-954,1664,-3282,12776,7620,-2728,1460,-848,480,-478},
  {-136,244,-436,780,-1676,15928,2250,-974,544,-322,180,28}
 };
 std::array<std::array<double,24>,2> history{};
 unsigned cursor=0;double energy=0;
 premidi_render_metrics values{};
 void interpolate(unsigned channel,double value)noexcept{
  auto& data=history[channel];data[cursor]=data[cursor+12]=value;
  for(const auto& phase:phases){
   double total=0;
   for(unsigned n=0;n<12;n++)total+=data[cursor+1+n]*phase[n];
   values.true_peak=std::max(values.true_peak,std::abs(total)/16384);
  }
 }
public:
 void push(unsigned channel,double value)noexcept{
  const auto absolute=std::abs(value);values.peak=std::max(values.peak,absolute);
  values.clipped+=absolute>1;energy+=value*value;
  interpolate(channel,value);
  if(channel==1)cursor=(cursor+1)%12;
 }
 premidi_render_metrics finish(std::uint64_t samples)noexcept{
  for(unsigned n=0;n<11;n++){
   interpolate(0,0);interpolate(1,0);cursor=(cursor+1)%12;
  }
  values.true_peak=std::max(values.peak,values.true_peak);
  values.rms=std::sqrt(energy/samples);
  return values;
 }
};
class PcmQuantizer {
 std::uint32_t seed=0x17ca4f9b;
 double random()noexcept{
  seed=seed*1664525u+1013904223u;
  return static_cast<double>(seed)/4294967296.;
 }
public:
 std::uint32_t encode(double value,unsigned bits,bool dither)noexcept{
  const auto range=static_cast<double>(1u<<(bits-1));
  double noise=0;
  if(dither&&value!=0){const double first=random();noise=first-random();}
  const auto encoded=static_cast<std::int32_t>(std::clamp(std::floor(value*(value<0?range:range-1)+noise+.5),-range,range-1));
  return static_cast<std::uint32_t>(encoded);
 }
};
}
