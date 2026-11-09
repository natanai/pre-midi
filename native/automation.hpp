#pragma once
#include <array>
#include <cmath>
#include <limits>
#include <algorithm>
namespace premidi {
constexpr unsigned automationLaneLimit=8,automationPointLimit=36,automationTargetLimit=11;
struct AutomationPoint{double time=0,value=0;};
struct AutomationLane{unsigned target=0,mode=0,count=0;std::array<AutomationPoint,automationPointLimit> points{};};
struct ParameterAutomation{unsigned count=0;std::array<AutomationLane,automationLaneLimit> lanes{};};
// No search through the whole curve on each sample. Each lane advances its
// cursor monotonically, including a voice first reconstructed after its onset.
class AutomatedValues {
 std::array<unsigned,automationLaneLimit> cursors{};
 std::array<double,automationTargetLimit> values;
 std::array<double,16> processing;
public:
 AutomatedValues()noexcept{values.fill(std::numeric_limits<double>::quiet_NaN());processing.fill(std::numeric_limits<double>::quiet_NaN());}
 void next(const ParameterAutomation& block,double time,double rate)noexcept{
  for(unsigned n=0;n<block.count;n++){
   const auto& lane=block.lanes[n];auto& i=cursors[n];while(i+1<lane.count&&time+1e-9/rate>=lane.points[i+1].time)i++;
   const auto& a=lane.points[i];double value=a.value;
   if(i+1<lane.count&&time>a.time&&lane.mode!=2){const auto& b=lane.points[i+1];const double t=std::clamp((time-a.time)/(b.time-a.time),0.,1.);value=lane.mode==1?a.value*std::pow(b.value/a.value,t):a.value+(b.value-a.value)*t;}
   if(lane.target<automationTargetLimit)values[lane.target]=value;else processing[lane.target-256]=value;
  }
 }
 double value(unsigned target,double base)const noexcept{return std::isnan(values[target])?base:values[target];}
 double processor(unsigned index,unsigned field,double base)const noexcept{const auto v=processing[index*2+field];return std::isnan(v)?base:v;}
 bool has(unsigned target)const noexcept{return !std::isnan(values[target]);}
};
}
