#pragma once
#include <algorithm>
#include <cmath>
#include <complex>
#include <cstddef>
#include <vector>
#include <array>
namespace premidi {
constexpr double wavePi=3.14159265358979323846;
// Original implementation of sine-series tables. Compatibility choices (fixed
// peak normalization, three bands/octave and table sizes) are documented in
// native/fidelity-policy.json. All FFTs and storage allocation are control work.
class WaveBank {
 std::size_t size,ranges;double rate,normalization=1;std::vector<float> tables;
 static void inverse(std::vector<std::complex<double>>& data){
  const auto n=data.size();
  for(std::size_t i=1,j=0;i<n;i++){
   auto bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)std::swap(data[i],data[j]);
  }
  for(std::size_t step=2;step<=n;step*=2){
   const auto rotation=std::polar(1.,2*wavePi/step);
   for(std::size_t start=0;start<n;start+=step){std::complex<double> w=1;
    for(std::size_t j=0;j<step/2;j++,w*=rotation){const auto a=data[start+j],b=w*data[start+j+step/2];data[start+j]=a+b;data[start+j+step/2]=a-b;}
   }
  }
  for(auto& value:data)value/=n;
 }
public:
 WaveBank(unsigned shape,const std::array<double,32>& harmonics,double sampleRate):
  size(sampleRate<=24000?2048:sampleRate<=88200?4096:16384),ranges(3*static_cast<std::size_t>(std::log2(size))),rate(sampleRate),tables(size*ranges){
  std::vector<double> coefficients(size/2);
  for(std::size_t h=1;h<size/2;h++){
   const float factor=2/(static_cast<float>(h)*static_cast<float>(wavePi));
   coefficients[h]=shape==0?(h==1?1:0):shape==1?(h%2?static_cast<float>(8*std::sin(h*wavePi/2)/(wavePi*wavePi*h*h)):0):
    shape==2?(h%2?2*factor:0):shape==3?(h%2?factor:-factor):h<=32?static_cast<float>(harmonics[h-1]):0;
  }
  std::vector<std::complex<double>> frequency(size);
  for(std::size_t band=0;band<ranges;band++){
   std::fill(frequency.begin(),frequency.end(),0);
   const auto partials=static_cast<std::size_t>(std::pow(2.,-static_cast<double>(band)/3)*(size/2));
   for(std::size_t h=1;h<=partials&&h<size/2;h++){frequency[h]={0,-coefficients[h]*size/2};frequency[size-h]=std::conj(frequency[h]);}
   inverse(frequency);
   if(band==0){double peak=0;for(auto value:frequency)peak=std::max(peak,std::abs(value.real()));if(peak>0)normalization=1/peak;}
   for(std::size_t j=0;j<size;j++)tables[band*size+j]=static_cast<float>(frequency[j].real()*normalization);
  }
 }
 float sample(double phase,double frequency) const noexcept {
  const double position=phase;const auto index=static_cast<std::size_t>(position)&(size-1),next=(index+1)&(size-1);
  const double fraction=static_cast<float>(position)-std::floor(position),range=std::clamp(1+3*std::log2(std::abs(frequency)/(rate/size)),0.,static_cast<double>(ranges-1));
  const auto a=static_cast<std::size_t>(range),b=std::min(a+1,ranges-1);
  const auto at=[&](std::size_t band){const float* table=tables.data()+band*size;return table[index]+(table[next]-table[index])*fraction;};
  return static_cast<float>(at(a)+(at(b)-at(a))*(range-a));
 }
 double advance(double phase,double frequency) const noexcept {return std::fmod(phase+static_cast<float>(frequency*static_cast<float>(size/rate)),static_cast<double>(size));}
 std::size_t tableSize()const noexcept{return size;}
 float lfo(double position,double frequency)const noexcept{
  const auto center=static_cast<std::size_t>(position);const double fraction=position-center;
  const double increment=static_cast<float>(frequency*static_cast<float>(size/rate));
  if(increment>=.3){const auto a=center&(size-1),b=(a+1)&(size-1);return tables[a]+(tables[b]-tables[a])*(static_cast<float>(position)-center);}
  // Local Lagrange interpolation of the immutable sine table at slow rates.
  const int radius=increment>=.16?1:2;double result=0;
  for(int j=-radius;j<=radius;j++){double weight=1;for(int k=-radius;k<=radius;k++)if(k!=j)weight*=(fraction-k)/(j-k);result+=weight*tables[(center+j)&(size-1)];}
  return static_cast<float>(result);
 }
 std::size_t bytes() const noexcept{return tables.size()*sizeof(float);}
};
}
