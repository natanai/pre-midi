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
inline Plan readPlan(const std::uint8_t* data,std::size_t size,unsigned rate){
 PacketReader in(data,size);const auto magic=in.u32();
 if(magic==0x38564d50){
  require(in.u32()==rate&&in.u32()==1&&in.u32()==8,"Invalid native sample execution header");Plan p;p.version=8;p.kind=in.u32();p.asset=in.u32();
  p.start=in.f64();p.duration=in.f64();p.sourceEnd=in.f64();p.graphEnd=in.f64();p.off=in.f64();p.pan=in.f64();p.playbackRate=in.f64();p.sampleOffset=in.f64();p.cutoff=in.f64();p.q=in.f64();p.drive=in.f64();p.vibratoRate=in.f64();p.vibratoDepth=in.f64();p.vibratoDelay=in.f64();p.tremolo=in.f64();p.tremoloRate=in.f64();p.filterType=in.u32();const auto bypass=in.u32();p.bypassFilter=bypass!=0;
  require((p.kind==1||p.kind==2)&&p.asset>0&&p.start>=0&&p.start<=601&&p.duration>0&&p.duration<=601&&p.sourceEnd>p.start&&p.graphEnd>=p.sourceEnd&&p.graphEnd-p.start<=602&&p.off>=p.start&&p.off<=p.sourceEnd&&std::abs(p.pan)<=1&&p.playbackRate>0&&p.playbackRate<=65536&&p.sampleOffset>=0&&p.sampleOffset<=301&&p.cutoff>=50&&p.cutoff<=14000&&p.q>=.1&&p.q<=16&&p.drive>=0&&p.drive<=1&&p.filterType<4&&bypass<=1&&p.vibratoRate>=.1&&p.vibratoRate<=20&&p.vibratoDepth>=0&&p.vibratoDepth<=100&&p.vibratoDelay>=0&&p.vibratoDelay<=3&&p.tremolo>=0&&p.tremolo<=1&&p.tremoloRate>=.1&&p.tremoloRate<=20,"Invalid native sample voice bounds");
  auto& osc=p.oscillators[0];osc.count=in.u32();require(osc.count<=600,"Native sample pitch curve exceeds 600 points");for(unsigned i=0;i<osc.count;i++){osc.curve[i]=in.f64();require(std::abs(osc.curve[i])<=2500,"Invalid native sample pitch curve");}
  p.eventCount=in.u32();require(p.eventCount>=2&&p.eventCount<=6,"Invalid native sample envelope count");double previous=-1;
  for(unsigned i=0;i<p.eventCount;i++){auto& e=p.events[i];e.kind=in.u32();e.time=in.f64();e.value=in.f64();require(e.kind<=1&&e.time>=previous&&e.time>=p.start&&e.time<=p.graphEnd&&e.value>=0&&e.value<=2,"Invalid native sample envelope");previous=e.time;}
  require(in.done(),"Trailing native sample packet");return p;
 }
 require(magic==0x344e4d50,"Unknown prepared voice transport");
 require(in.u32()==rate,"Voice/device sample rate mismatch");const auto frames=in.u32();require(frames>0&&frames<=rate*12,"Invalid prepared frame bound");
 Plan p;p.version=in.u32();require(p.version>=1&&p.version<=7,"Unknown synth voice version");
 p.start=in.f64();p.duration=in.f64();p.sourceEnd=in.f64();p.graphEnd=in.f64();p.pan=in.f64();p.cutoff=in.f64();p.q=in.f64();p.filterType=in.u32();if(p.version>=4){p.sweepStart=in.f64();p.sweepEnd=in.f64();if(p.version>=5){p.noise=in.f64();p.noiseDecay=in.f64();}}
 if(p.version>=6){p.delayMix=in.f64();p.delayTime=in.f64();p.delayFeedback=in.f64();require(p.delayMix>=0&&p.delayMix<=1&&p.delayTime>=.04999999&&p.delayTime<=1&&p.delayFeedback>=0&&p.delayFeedback<=.80000002,"Invalid native delay");}
 if(p.version>=7){p.drive=in.f64();p.vibratoRate=in.f64();p.vibratoDepth=in.f64();p.vibratoDelay=in.f64();p.tone=in.f64();p.toneRate=in.f64();p.tremolo=in.f64();p.tremoloRate=in.f64();require(p.drive>=0&&p.drive<=1&&p.vibratoRate>=.1&&p.vibratoRate<=20&&p.vibratoDepth>=0&&p.vibratoDepth<=100&&p.vibratoDelay>=0&&p.vibratoDelay<=3&&p.tone>=0&&p.tone<=1&&p.toneRate>=.1&&p.toneRate<=20&&p.tremolo>=0&&p.tremolo<=1&&p.tremoloRate>=.1&&p.tremoloRate<=20,"Invalid native drive/movement");}
 require(p.start>=0&&p.start<=601&&p.duration>0&&p.sourceEnd>p.start&&p.graphEnd>=p.sourceEnd&&p.graphEnd-p.start<=30&&p.filterType<4&&std::abs(p.pan)<=1&&p.cutoff>=50&&p.cutoff<=14000&&p.q>=.1&&p.q<=16&&(p.version<4||(p.sweepStart>=50&&p.sweepStart<=14000&&p.sweepEnd>p.start&&p.sweepEnd<=p.graphEnd))&&(p.version<5||(p.noise>=0&&p.noise<=1&&p.noiseDecay>=0&&p.noiseDecay<=5)),"Invalid native voice bounds (maximum voice lifetime 30 seconds)");
 for(auto& o:p.oscillators){
  o.frequency=in.f64();o.level=in.f64();o.detune=in.f64();o.wave=in.u32();require(o.wave<=4&&o.frequency>0&&o.frequency<=18000&&o.level>=0&&o.level<=1&&std::abs(o.detune)<=100,"Invalid native oscillator");
  for(auto& h:o.harmonics){h=in.f64();require(h>=0&&h<=1,"Invalid harmonic recipe");}
  o.count=in.u32();require(o.count<=600,"Native pitch curve exceeds 600 points");
  double highest=o.detune;for(unsigned i=0;i<o.count;i++){o.curve[i]=in.f64();require(std::abs(o.curve[i])<=2500,"Native pitch curve out of range");highest=std::max(highest,o.curve[i]);}
  require(o.frequency*std::pow(2.,highest/1200.)<rate/2.,"Native pitch reaches Nyquist");
 }
 p.off=in.f64();p.pitch=in.f64();p.velocity=in.f64();p.routeCount=in.u32();
 require(p.off>p.start&&p.off<=p.sourceEnd&&p.pitch>=0&&p.pitch<=127&&p.velocity>=0&&p.velocity<=1&&p.routeCount<=16&&(p.version>=2||p.routeCount==0),"Invalid native modulation bounds");
 for(unsigned i=0;i<p.routeCount;i++){
  auto& r=p.routes[i];r.target=in.u32();r.kind=in.u32();r.bipolar=in.u32();r.depth=in.f64();r.smoothing=in.f64();r.rate=in.f64();r.root=in.f64();r.span=in.f64();for(auto& v:r.envelope)v=in.f64();
  const double limit=r.target==4?8:r.target==5?2:r.target%2?1:2400;
  require(r.target<6&&r.kind<4&&r.bipolar<=1&&std::abs(r.depth)<=limit&&r.smoothing>=0&&r.smoothing<=.1&&r.rate>=.05&&r.rate<=20&&r.root>=0&&r.root<=127&&r.span>=1&&r.span<=127&&r.envelope[0]>=0&&r.envelope[0]<=3&&r.envelope[1]>=0&&r.envelope[1]<=3&&r.envelope[2]>=0&&r.envelope[2]<=1&&r.envelope[3]>=.01&&r.envelope[3]<=4,"Invalid native modulation route");
 }
 p.automationCount=in.u32();require(p.automationCount<=6&&(p.version==3?p.automationCount>=2:p.version>=4?(p.automationCount==0||p.automationCount>=2):p.automationCount==0),"Invalid native automation count");
 for(unsigned index=0;index<2;index++){
  const auto& o=p.oscillators[index];double highest=o.detune,offset=0;
  for(unsigned i=0;i<o.count;i++)highest=std::max(highest,o.curve[i]);
  for(unsigned i=0;i<p.routeCount;i++)if(p.routes[i].target==index*2)offset+=std::abs(p.routes[i].depth);
  require(o.frequency*std::pow(2.,(highest+std::min(2400.,offset))/1200.)<rate/2.,"Native modulated pitch reaches Nyquist");
 }
 double previous=-1;for(unsigned i=0;i<p.automationCount;i++){auto& e=p.automation[i];e.time=in.f64();e.value=in.f64();require(e.time>previous&&e.time>=p.start&&e.time<=p.graphEnd&&e.value>=50&&e.value<=14000,"Invalid native automation point");previous=e.time;}
 p.eventCount=in.u32();require(p.eventCount>=4&&p.eventCount<=6,"Invalid native envelope count");previous=-1;
 for(unsigned i=0;i<p.eventCount;i++){auto& e=p.events[i];e.kind=in.u32();e.time=in.f64();e.value=in.f64();require(e.kind<=1&&e.time>=previous&&e.time>=p.start&&e.time<=p.sourceEnd&&e.value>=0&&e.value<=1,"Invalid native envelope event");previous=e.time;}
 require(in.done(),"Trailing native voice data");return p;
}
}
