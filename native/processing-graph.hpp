#pragma once
#include "filter.hpp"
#include "drive.hpp"
#include "equalizer.hpp"
#include <array>
#include <algorithm>
#include <memory>
#include <cstdint>
namespace premidi {
constexpr unsigned graphNodeLimit=8,graphRouteLimit=4,graphChannelLimit=6;
struct GraphNode {
 unsigned kind=0,type=0,stages=1;bool primary=false,bypass=false;
 double mix=1,cutoff=8000,resonance=.7,amount=0;
 std::array<EqBand,8> bands{};
};
struct GraphRoute{unsigned count=0;double gain=1;std::array<unsigned,graphNodeLimit> order{};};
struct ProcessingGraph {
 unsigned count=0,routeCount=0;double dry=0;
 std::array<GraphNode,graphNodeLimit> nodes{};
 GraphRoute serial;std::array<GraphRoute,graphRouteLimit> routes{};
};
// Immutable, control-thread-owned recipes. Voices borrow these until their
// prepared page/session's resource watermark has retired.
inline bool sameProcessingGraph(const ProcessingGraph& a,const ProcessingGraph& b)noexcept{
 if(a.count!=b.count||a.routeCount!=b.routeCount||a.dry!=b.dry||a.serial.count!=b.serial.count)return false;
 for(unsigned i=0;i<a.serial.count;i++)if(a.serial.order[i]!=b.serial.order[i])return false;
 for(unsigned i=0;i<a.count;i++){
  const auto& x=a.nodes[i];const auto& y=b.nodes[i];
  if(x.kind!=y.kind||x.type!=y.type||x.stages!=y.stages||x.primary!=y.primary||x.bypass!=y.bypass||x.mix!=y.mix||x.cutoff!=y.cutoff||x.resonance!=y.resonance||x.amount!=y.amount)return false;
  for(unsigned band=0;band<8;band++)if(x.bands[band].c!=y.bands[band].c)return false;
 }
 for(unsigned r=0;r<a.routeCount;r++){const auto& x=a.routes[r];const auto& y=b.routes[r];if(x.gain!=y.gain||x.count!=y.count)return false;for(unsigned i=0;i<x.count;i++)if(x.order[i]!=y.order[i])return false;}
 return true;
}
struct ProcessingGraphRecipe {
 const ProcessingGraph graph;
 std::array<std::unique_ptr<DriveRecipe>,graphNodeLimit> drives;
 explicit ProcessingGraphRecipe(const ProcessingGraph& input):graph(input){
  for(unsigned i=0;i<graph.count;i++){
   const auto& n=graph.nodes[i];if(n.kind==1&&n.amount>0&&!n.bypass&&n.mix>0)drives[i]=std::make_unique<DriveRecipe>(n.amount);
  }
 }
};
class ProcessingGraphState {
 struct Stage{ToneFilter filter;Drive drive;Equalizer eq;double cutoff=0,resonance=0;};
 static constexpr unsigned capacity=graphNodeLimit*192+1;
 struct Align {
  // Reset only the clock. Unwritten samples are explicitly silent, so voice
  // onsets never clear a large history or allocate inside the callback.
  std::array<float,capacity> data;
  unsigned cursor=0,age=0;
  Align()noexcept{}
  void reset()noexcept{cursor=age=0;}
  float next(float input,unsigned delay)noexcept{
   if(!delay)return input;
   const float output=age<delay?0:data[(cursor+capacity-delay)%capacity];
   data[cursor]=input;cursor=(cursor+1)%capacity;age=std::min(capacity,age+1);return output;
  }
 };
 struct Channel{std::array<Stage,graphNodeLimit> stages;std::array<Align,graphRouteLimit+1> align;};
 std::array<Channel,graphChannelLimit> channels;
 unsigned rate=48000,maxLatency=0;std::array<unsigned,graphRouteLimit> latency{};
 float stage(float input,unsigned index,Channel& channel,const ProcessingGraph& graph,double cutoff,double resonance)noexcept{
  const auto& n=graph.nodes[index];if(n.bypass||n.mix==0)return input;
  auto& state=channel.stages[index];float value=input;
  if(n.kind==0){
   const double f=n.primary?cutoff:n.cutoff,q=n.primary?resonance:n.resonance;
   if(f!=state.cutoff||q!=state.resonance){state.filter.configure(n.type,f,q,rate);state.cutoff=f;state.resonance=q;}
   value=state.filter.process(input);
  }else if(n.kind==1)return state.drive.mixed(input,n.mix);
  else value=state.eq.process(input,n.bands);
  return static_cast<float>((1-n.mix)*input+n.mix*value);
 }
 float serial(float value,const GraphRoute& route,Channel& channel,const ProcessingGraph& graph,double cutoff,double resonance)noexcept{
  for(unsigned i=0;i<route.count;i++)value=stage(value,route.order[i],channel,graph,cutoff,resonance);
  return value;
 }
 static unsigned pathLatency(const ProcessingGraph& graph,const GraphRoute& route)noexcept{
  unsigned frames=0;for(unsigned i=0;i<route.count;i++){const auto& n=graph.nodes[route.order[i]];if(n.kind==1&&!n.bypass&&n.mix>0&&n.amount>0)frames+=192;}return frames;
 }
public:
 ProcessingGraphState()noexcept{}
 void reset(const ProcessingGraph& graph,const ProcessingGraphRecipe& recipe,unsigned sampleRate)noexcept{
  rate=sampleRate;maxLatency=0;
  for(unsigned i=0;i<graph.routeCount;i++){latency[i]=pathLatency(graph,graph.routes[i]);maxLatency=std::max(maxLatency,latency[i]);}
  for(auto& channel:channels){
   for(auto& delay:channel.align)delay.reset();
   for(unsigned i=0;i<graph.count;i++){
    const auto& n=graph.nodes[i];auto& s=channel.stages[i];
    s.filter=ToneFilter();s.filter.setStages(n.stages);s.filter.configure(n.type,n.cutoff,n.resonance,rate);s.cutoff=n.cutoff;s.resonance=n.resonance;
    s.drive=Drive(recipe.drives[i].get());s.eq=Equalizer();
   }
  }
 }
 float process(float input,unsigned index,const ProcessingGraph& graph,double cutoff,double resonance)noexcept{
  auto& channel=channels[index];input=serial(input,graph.serial,channel,graph,cutoff,resonance);
  if(!graph.routeCount)return input;
  float sum=channel.align[0].next(input,maxLatency)*static_cast<float>(graph.dry);
  for(unsigned i=0;i<graph.routeCount;i++){
   const auto value=serial(input,graph.routes[i],channel,graph,cutoff,resonance);
   sum+=channel.align[i+1].next(value,maxLatency-latency[i])*static_cast<float>(graph.routes[i].gain);
  }
  return sum;
 }
};
}
