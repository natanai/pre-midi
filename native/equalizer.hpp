#pragma once
#include <array>
#include <cmath>
namespace premidi {
struct EqBand {std::array<double,5> c{1,0,0,0,0};};
struct Equalizer {
 struct State{double x1=0,x2=0,y1=0,y2=0;};std::array<State,4> states{};
 float process(float input,const std::array<EqBand,4>& bands)noexcept{
  double v=input;for(unsigned i=0;i<4;i++){const auto& c=bands[i].c;auto& s=states[i];const double y=c[0]*v+c[1]*s.x1+c[2]*s.x2-c[3]*s.y1-c[4]*s.y2;s.x2=s.x1;s.x1=v;s.y2=s.y1;s.y1=std::abs(y)<1e-30?0:y;v=y;}return static_cast<float>(v);
 }
};
}
