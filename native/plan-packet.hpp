#pragma once
#include "voice.hpp"
#include <cstring>
#include <stdexcept>
namespace premidi {
inline void require(bool condition,const char* message){if(!condition)throw std::runtime_error(message);}
class PacketReader {
 const std::uint8_t* data;std::size_t length,at=0;
public:
 PacketReader(const std::uint8_t* bytes,std::size_t size):data(bytes),length(size){}
 std::uint32_t u32(){require(length-at>=4,"Truncated native packet");std::uint32_t v=0;for(unsigned i=0;i<4;i++)v|=std::uint32_t(data[at++])<<(8*i);return v;}
 double f64(){require(length-at>=8,"Truncated native packet");std::uint64_t bits=0;for(unsigned i=0;i<8;i++)bits|=std::uint64_t(data[at++])<<(8*i);double v;std::memcpy(&v,&bits,8);require(std::isfinite(v),"Nonfinite native parameter");return v;}
 float f32(){const auto bits=u32();float value;std::memcpy(&value,&bits,4);require(std::isfinite(value)&&std::abs(value)<=32,"Invalid native PCM");return value;}
 std::size_t remaining()const noexcept{return length-at;}
 const std::uint8_t* take(std::size_t size){require(size<=length-at,"Truncated native packet");auto p=data+at;at+=size;return p;}
 bool done()const{return at==length;}
};
inline void readRoutes(PacketReader& in,Plan& p){
 for(unsigned i=0;i<p.routeCount;i++){
  auto& r=p.routes[i];r.target=in.u32();r.kind=in.u32();r.bipolar=in.u32();r.depth=in.f64();r.smoothing=in.f64();r.rate=in.f64();r.root=in.f64();r.span=in.f64();for(auto& v:r.envelope)v=in.f64();
  const double limit=r.target==4?8:r.target==5?2:r.target==6?15.9:r.target==7?1:r.target%2?1:2400;
  require(r.target<8&&r.kind<11&&r.bipolar<=1&&std::abs(r.depth)<=limit&&r.smoothing>=0&&r.smoothing<=.1&&r.rate>=.01&&r.rate<=20&&r.root>=0&&r.root<=127&&((r.kind!=7&&r.kind!=8)||(r.root>=1&&r.root==std::floor(r.root)))&&(r.kind!=10||r.root<=1)&&r.span>=1&&r.span<=127&&(r.kind==9?std::all_of(r.envelope.begin(),r.envelope.end(),[](double v){return v>=-1&&v<=1;}):r.envelope[0]>=0&&r.envelope[0]<=3&&r.envelope[1]>=0&&r.envelope[1]<=3&&r.envelope[2]>=0&&r.envelope[2]<=1&&r.envelope[3]>=.01&&r.envelope[3]<=4),"Invalid native modulation route");
 }
}
inline void readProcessingGraph(PacketReader& in,Plan& p){
 auto& g=p.processing;g.count=in.u32();require(g.count<=graphNodeLimit,"Too many native processor instances");if(!g.count)return;
 unsigned primary=0;
 for(unsigned i=0;i<g.count;i++){
  auto& n=g.nodes[i];n.kind=in.u32();const auto main=in.u32(),bypass=in.u32();n.primary=main!=0;n.bypass=bypass!=0;n.mix=in.f64();
  n.type=in.u32();n.cutoff=in.f64();n.resonance=in.f64();n.stages=in.u32();n.amount=in.f64();
  require(n.kind<=2&&main<=1&&bypass<=1&&(!main||n.kind==0)&&n.mix>=0&&n.mix<=1&&n.type<4&&n.cutoff>=50&&n.cutoff<=14000&&n.resonance>=.1&&n.resonance<=16&&(n.stages==1||n.stages==2||n.stages==4)&&n.amount>=0&&n.amount<=1,"Invalid native processor instance");primary+=main;
  for(auto& band:n.bands){for(auto& v:band.c){v=in.f64();require(std::abs(v)<1000,"Invalid instance EQ coefficient");}const auto& c=band.c;require(std::abs(c[4])<1&&1+c[3]+c[4]>0&&1-c[3]+c[4]>0,"Unstable instance EQ poles");}
 }
 require(primary<=1,"Duplicate primary native filter");
 unsigned used=0;
 const auto readOrder=[&](GraphRoute& route){
  route.count=in.u32();require(route.count<=g.count,"Invalid native processing route");
  for(unsigned i=0;i<route.count;i++){const auto index=in.u32();require(index<g.count&&!(used&(1u<<index)),"Processor must have one native route");used|=1u<<index;route.order[i]=index;}
 };
 readOrder(g.serial);g.routeCount=in.u32();g.dry=in.f64();require(g.routeCount<=graphRouteLimit&&g.dry>=0&&g.dry<=1,"Invalid native parallel routing");
 double shares=g.dry;for(unsigned i=0;i<g.routeCount;i++){auto& route=g.routes[i];route.gain=in.f64();require(route.gain>=0&&route.gain<=1,"Invalid native route share");shares+=route.gain;readOrder(route);}
 require(used==((1u<<g.count)-1)&&(!g.routeCount||shares<=1+1e-9),"Invalid native graph ownership or headroom");
}

inline void readParameterAutomation(PacketReader& in,Plan& p){
 auto& a=p.parameterAutomation;a.count=in.u32();require(a.count<=automationLaneLimit,"Too many parameter automation lanes");
 constexpr std::array<double,11> minimum{-100,0,-100,0,50,-1,.1,0,0,-1,0},maximum{100,1,100,1,14000,1,16,2,2,1,1};
 for(unsigned n=0;n<a.count;n++){
  auto& lane=a.lanes[n];lane.target=in.u32();lane.mode=in.u32();lane.count=in.u32();
  const bool custom=lane.target>=256&&lane.target<256+p.processing.count*2;
  require((lane.target<automationTargetLimit||custom)&&lane.mode<3&&lane.count>=2&&lane.count<=automationPointLimit,"Invalid parameter automation lane");
  if(custom)require(p.processing.nodes[(lane.target-256)/2].kind==0,"Automation instance must be a filter");
  if(p.kind)require(lane.target>=4&&lane.target!=10,"Recording automation targets a synth source");
  for(unsigned prior=0;prior<n;prior++)require(a.lanes[prior].target!=lane.target,"Duplicate parameter automation target");
  const double low=custom?((lane.target-256)%2?.1:50):minimum[lane.target],high=custom?((lane.target-256)%2?16:14000):maximum[lane.target];double previous=-1;
  for(unsigned i=0;i<lane.count;i++){auto& point=lane.points[i];point.time=in.f64();point.value=in.f64();require(point.time>previous&&point.time>=p.start&&point.time<=p.graphEnd&&point.value>=low&&point.value<=high&&(lane.mode!=1||point.value>0),"Invalid parameter automation point");previous=point.time;}
 }
}
inline void readProcessing(PacketReader& in,Plan& p){
 const auto flags=in.u32();require(flags<=63,"Invalid processing order/bypass flags");
 p.filterMix=in.f64();p.driveMix=in.f64();require(p.filterMix>=0&&p.filterMix<=1&&p.driveMix>=0&&p.driveMix<=1,"Invalid processor mix");
 p.eqMix=in.f64();p.filterStages=in.u32();require(p.eqMix>=0&&p.eqMix<=1&&(p.filterStages==1||p.filterStages==2||p.filterStages==4),"Invalid EQ mix/filter slope");
 for(auto& band:p.eqBands){for(auto& v:band.c){v=in.f64();require(std::abs(v)<1000,"Invalid EQ coefficients");}const auto& c=band.c;require(std::abs(c[4])<1&&1+c[3]+c[4]>0&&1-c[3]+c[4]>0,"Unstable EQ poles");}
 p.stereoWidth=in.f64();p.msBalance=in.f64();p.delayTone=in.f64();const auto ping=in.u32();require(p.stereoWidth>=0&&p.stereoWidth<=2&&std::abs(p.msBalance)<=1&&p.delayTone>=20&&p.delayTone<=20000&&ping<=1,"Invalid stereo/delay configuration");p.delayPingPong=ping!=0;
 p.eqPosition=(flags>>3)&3;p.bypassEq=(flags&32)!=0;
 p.driveFirst=(flags&1)!=0;p.bypassFilter=p.bypassFilter||(flags&2)!=0;p.bypassDrive=(flags&4)!=0;
 readProcessingGraph(in,p);readParameterAutomation(in,p);
}
inline void readPostProcessing(PacketReader& in,Plan& p,unsigned rate){
 p.postCount=in.u32();require(p.postCount<=postLimit,"Too many post-level processors");
 for(unsigned i=0;i<p.postCount;i++){
  auto& node=p.post[i];const auto mode=in.u32();require(mode<=9,"Invalid post processor kind");node.kind=mode;
  if(mode>=4){auto& m=node.motion;m.kind=mode-4;m.rate=in.f64();m.depth=in.f64();m.phase=in.f64();m.stereo=in.f64();m.feedback=in.f64();m.delay=in.f64();m.frequency=in.f64();m.mix=in.f64();m.validate();continue;}
  auto& d=node.dynamics;d.mode=static_cast<DynamicsRecipe::Mode>(mode);
  d.threshold=in.f64();d.ratio=in.f64();d.knee=in.f64();d.attack=in.f64();d.release=in.f64();d.makeup=in.f64();d.range=in.f64();d.hold=in.f64();d.mix=in.f64();
  if(d.mode==DynamicsRecipe::deesser){d.frequency=in.f64();d.bandwidth=in.f64();d.amount=in.f64();}
  d=d.prepared(rate);
 }
 p.reverb.mix=in.f64();p.reverb.preDelay=in.f64();p.reverb.decay=in.f64();p.reverb.damping=in.f64();p.reverb.size=in.f64();p.reverb.width=in.f64();p.reverb.validate();
}
inline Plan readPlan(const std::uint8_t* data,std::size_t size,unsigned rate){
 PacketReader in(data,size);const auto magic=in.u32();
 if(magic==0x38564d50){
  require(in.u32()==rate&&in.u32()==1,"Invalid native sample execution header");const auto version=in.u32();require(version==22,"Unknown native sample execution version");Plan p;p.version=version;p.kind=in.u32();p.asset=in.u32();
  p.start=in.f64();p.duration=in.f64();p.sourceEnd=in.f64();p.graphEnd=in.f64();p.off=in.f64();p.pan=in.f64();p.playbackRate=in.f64();p.sampleOffset=in.f64();p.sampleLimit=in.f64();p.cutoff=in.f64();p.q=in.f64();p.drive=in.f64();p.vibratoRate=in.f64();p.vibratoDepth=in.f64();p.vibratoDelay=in.f64();p.tremolo=in.f64();p.tremoloRate=in.f64();p.delayMix=in.f64();p.delayTime=in.f64();p.delayFeedback=in.f64();require(p.delayMix>=0&&p.delayMix<=1&&p.delayTime>=.04999999&&p.delayTime<=2&&p.delayFeedback>=0&&p.delayFeedback<=.80000002,"Invalid native sample delay");p.tone=in.f64();p.toneRate=in.f64();p.sweepStart=in.f64();p.sweepEnd=in.f64();require(p.sweepStart>=50&&p.sweepStart<=14000&&p.sweepEnd>p.start&&p.sweepEnd<=p.graphEnd,"Invalid recording filter sweep");require(p.tone>=0&&p.tone<=1&&p.toneRate>=.1&&p.toneRate<=20,"Invalid sample tone motion");p.filterType=in.u32();const auto bypass=in.u32();p.bypassFilter=bypass!=0;
  require((p.kind==1||p.kind==2)&&p.asset>0&&p.start>=0&&p.start<=601&&p.duration>0&&p.duration<=601&&p.sourceEnd>p.start&&p.graphEnd>=p.sourceEnd&&p.graphEnd-p.start<=625&&p.off>=p.start&&p.off<=p.sourceEnd&&std::abs(p.pan)<=1&&p.playbackRate>0&&p.playbackRate<=65536&&p.sampleOffset>=0&&p.sampleOffset<p.sampleLimit&&p.sampleLimit<=602&&p.cutoff>=50&&p.cutoff<=14000&&p.q>=.1&&p.q<=16&&p.drive>=0&&p.drive<=1&&p.filterType<4&&bypass<=1&&p.vibratoRate>=.1&&p.vibratoRate<=20&&p.vibratoDepth>=0&&p.vibratoDepth<=100&&p.vibratoDelay>=0&&p.vibratoDelay<=3&&p.tremolo>=0&&p.tremolo<=1&&p.tremoloRate>=.1&&p.tremoloRate<=20,"Invalid native sample voice bounds");
  auto& osc=p.oscillators[0];osc.count=in.u32();require(osc.count<=600,"Native sample pitch curve exceeds 600 points");for(unsigned i=0;i<osc.count;i++){osc.curve[i]=in.f64();require(std::abs(osc.curve[i])<=2500,"Invalid native sample pitch curve");}
  p.eventCount=in.u32();require(p.eventCount>=2&&p.eventCount<=6,"Invalid native sample envelope count");double previous=-1;
  for(unsigned i=0;i<p.eventCount;i++){auto& e=p.events[i];e.kind=in.u32();e.time=in.f64();e.value=in.f64();require(e.kind<=1&&e.time>=previous&&e.time>=p.start&&e.time<=p.graphEnd&&e.value>=0&&e.value<=2,"Invalid native sample envelope");previous=e.time;}
  p.pitch=in.f64();p.velocity=in.f64();p.routeCount=in.u32();
  require(p.pitch>=0&&p.pitch<=127&&p.velocity>=0&&p.velocity<=1&&p.routeCount<=16,"Invalid recording routes");
  readRoutes(in,p);for(unsigned i=0;i<p.routeCount;i++)require(p.routes[i].target>=4&&p.routes[i].target<8,"Recording route targets an oscillator");
  p.automationCount=in.u32();require(p.automationCount==0||(p.automationCount>=2&&p.automationCount<=36),"Invalid recording automation");
  previous=-1;for(unsigned i=0;i<p.automationCount;i++){auto& point=p.automation[i];point.time=in.f64();point.value=in.f64();require(point.time>previous&&point.time>=p.start&&point.time<=p.graphEnd&&point.value>=50&&point.value<=14000,"Invalid recording cutoff point");previous=point.time;}
  readProcessing(in,p);readPostProcessing(in,p,rate);require(in.done(),"Trailing native sample packet");return p;
 }
 require(magic==0x344e4d50,"Unknown prepared voice transport");
 require(in.u32()==rate,"Voice/device sample rate mismatch");const auto frames=in.u32();require(frames>0&&frames<=rate*12,"Invalid prepared frame bound");
 Plan p;p.version=in.u32();require(((p.version>=1&&p.version<=7)||p.version==9),"Unknown synth voice version");
 p.start=in.f64();p.duration=in.f64();p.sourceEnd=in.f64();p.graphEnd=in.f64();p.pan=in.f64();p.cutoff=in.f64();p.q=in.f64();p.filterType=in.u32();if(p.version>=4){p.sweepStart=in.f64();p.sweepEnd=in.f64();if(p.version>=5){p.noise=in.f64();p.noiseDecay=in.f64();}}
 if(p.version>=6){p.delayMix=in.f64();p.delayTime=in.f64();p.delayFeedback=in.f64();require(p.delayMix>=0&&p.delayMix<=1&&p.delayTime>=.04999999&&p.delayTime<=2&&p.delayFeedback>=0&&p.delayFeedback<=.80000002,"Invalid native delay");}
 if(p.version>=7){p.drive=in.f64();p.vibratoRate=in.f64();p.vibratoDepth=in.f64();p.vibratoDelay=in.f64();p.tone=in.f64();p.toneRate=in.f64();p.tremolo=in.f64();p.tremoloRate=in.f64();require(p.drive>=0&&p.drive<=1&&p.vibratoRate>=.1&&p.vibratoRate<=20&&p.vibratoDepth>=0&&p.vibratoDepth<=100&&p.vibratoDelay>=0&&p.vibratoDelay<=3&&p.tone>=0&&p.tone<=1&&p.toneRate>=.1&&p.toneRate<=20&&p.tremolo>=0&&p.tremolo<=1&&p.tremoloRate>=.1&&p.tremoloRate<=20,"Invalid native drive/movement");}
 require(p.start>=0&&p.start<=601&&p.duration>0&&p.sourceEnd>p.start&&p.graphEnd>=p.sourceEnd&&p.duration<=601&&p.graphEnd-p.start<=625&&p.filterType<4&&std::abs(p.pan)<=1&&p.cutoff>=50&&p.cutoff<=14000&&p.q>=.1&&p.q<=16&&(p.version<4||(p.sweepStart>=50&&p.sweepStart<=14000&&p.sweepEnd>p.start&&p.sweepEnd<=p.graphEnd))&&(p.version<5||(p.noise>=0&&p.noise<=1&&p.noiseDecay>=0&&p.noiseDecay<=5)),"Invalid native voice lifetime or parameter bounds");
 for(auto& o:p.oscillators){
  o.frequency=in.f64();o.level=in.f64();o.detune=in.f64();o.wave=in.u32();require(o.wave<=4&&o.frequency>0&&o.frequency<=18000&&o.level>=0&&o.level<=1&&std::abs(o.detune)<=100,"Invalid native oscillator");
  for(auto& h:o.harmonics){h=in.f64();require(h>=0&&h<=1,"Invalid harmonic recipe");}
  o.count=in.u32();require(o.count<=600,"Native pitch curve exceeds 600 points");
  double highest=o.detune;for(unsigned i=0;i<o.count;i++){o.curve[i]=in.f64();require(std::abs(o.curve[i])<=2500,"Native pitch curve out of range");highest=std::max(highest,o.curve[i]);}
  require(p.version==9||o.frequency*std::pow(2.,highest/1200.)<rate/2.,"Native pitch reaches Nyquist");
 }
 p.off=in.f64();p.pitch=in.f64();p.velocity=in.f64();p.routeCount=in.u32();
 require(p.off>p.start&&p.off<=p.sourceEnd&&p.pitch>=0&&p.pitch<=127&&p.velocity>=0&&p.velocity<=1&&p.routeCount<=16&&(p.version>=2||p.routeCount==0),"Invalid native modulation bounds");
 readRoutes(in,p);
 p.automationCount=in.u32();require(p.automationCount<=36&&(p.version==3?(p.automationCount==0||p.automationCount>=2):p.version>=4?(p.automationCount==0||p.automationCount>=2):p.automationCount==0),"Invalid native automation count");
 for(unsigned index=0;index<2;index++){
  const auto& o=p.oscillators[index];double highest=o.detune,offset=0;
  for(unsigned i=0;i<o.count;i++)highest=std::max(highest,o.curve[i]);
  for(unsigned i=0;i<p.routeCount;i++)if(p.routes[i].target==index*2)offset+=std::abs(p.routes[i].depth);
  require(p.version==9||o.frequency*std::pow(2.,(highest+std::min(2400.,offset))/1200.)<rate/2.,"Native modulated pitch reaches Nyquist");
 }
 double previous=-1;for(unsigned i=0;i<p.automationCount;i++){auto& e=p.automation[i];e.time=in.f64();e.value=in.f64();require(e.time>previous&&e.time>=p.start&&e.time<=p.graphEnd&&e.value>=50&&e.value<=14000,"Invalid native automation point");previous=e.time;}
 p.eventCount=in.u32();require(p.eventCount>=4&&p.eventCount<=6,"Invalid native envelope count");previous=-1;
 for(unsigned i=0;i<p.eventCount;i++){auto& e=p.events[i];e.kind=in.u32();e.time=in.f64();e.value=in.f64();require(e.kind<=1&&e.time>=previous&&e.time>=p.start&&e.time<=p.sourceEnd&&e.value>=0&&e.value<=1,"Invalid native envelope event");previous=e.time;}
 readProcessing(in,p);readPostProcessing(in,p,rate);require(in.done(),"Trailing native voice data");return p;
}
}
