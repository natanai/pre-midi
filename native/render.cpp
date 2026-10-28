#include "voice.hpp"
#include <cstdio>
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <vector>
#include <new>
#include <cstdlib>
#include <memory>
#ifdef _WIN32
#include <io.h>
#include <fcntl.h>
#endif
static std::uint64_t allocations=0;
void* operator new(std::size_t size){++allocations;if(void* p=std::malloc(size))return p;throw std::bad_alloc();}
void operator delete(void* p) noexcept{std::free(p);}
void operator delete(void* p,std::size_t) noexcept{std::free(p);}
static std::uint32_t u32(){unsigned char b[4];if(!std::cin.read(reinterpret_cast<char*>(b),4))throw std::runtime_error("Truncated prepared plan");return std::uint32_t(b[0])|(std::uint32_t(b[1])<<8)|(std::uint32_t(b[2])<<16)|(std::uint32_t(b[3])<<24);}
static double f64(){unsigned char b[8];if(!std::cin.read(reinterpret_cast<char*>(b),8))throw std::runtime_error("Truncated prepared plan");std::uint64_t bits=0;for(int i=0;i<8;i++)bits|=std::uint64_t(b[i])<<(8*i);double value;std::memcpy(&value,&bits,8);if(!std::isfinite(value))throw std::runtime_error("Nonfinite prepared parameter");return value;}
static void require(bool condition,const char* message){if(!condition)throw std::runtime_error(message);}
int main(int argc,char** argv){
 try{
  if(argc==2&&std::strcmp(argv[1],"--selftest")==0){
   for(const unsigned rate:{8000u,44100u,48000u,96000u,192000u})for(unsigned shape=0;shape<5;shape++){
    premidi::Plan plan;plan.oscillators[0].level=1;plan.oscillators[0].wave=shape;plan.oscillators[0].harmonics[0]=1;plan.oscillators[0].harmonics[2]=.4;
    plan.eventCount=2;plan.events[0]={0,0,.2};plan.events[1]={1,.08,0};plan.sourceEnd=.08;plan.graphEnd=.12;
    std::unique_ptr<premidi::WaveBank> bank;if(shape)bank=std::make_unique<premidi::WaveBank>(shape,plan.oscillators[0].harmonics,rate);
    for(unsigned type=0;type<4;type++)for(double q:{.1,16.})for(double cutoff:{50.,14000.}){
     plan.filterType=type;plan.q=q;plan.cutoff=cutoff;std::array<float,8192> first{},second{};
     premidi::Voice reference(plan,rate,{bank.get(),nullptr});auto before=allocations;reference.process(first.data(),4096);require(allocations==before,"Reference processing allocated");
     for(const std::size_t block:{1,17,64,128,511}){
      premidi::Voice voice(plan,rate,{bank.get(),nullptr});before=allocations;
      for(std::size_t at=0;at<4096;at+=block)voice.process(second.data()+2*at,std::min<std::size_t>(block,4096-at));
      require(allocations==before,"Audio processing allocated memory");require(first==second,"Block-size dependent output");
      for(float value:second)require(std::isfinite(value)&&std::abs(value)<16,"Unstable PCM");
     }
    }
   }
   for(const unsigned rate:{44100u,48000u,96000u})for(const unsigned version:{2u,3u}){
    premidi::Plan plan;plan.version=version;plan.routeCount=16;plan.start=.002;plan.off=.015;plan.sourceEnd=.04;plan.graphEnd=.05;plan.oscillators[0].level=.5;plan.oscillators[1].wave=1;plan.oscillators[1].level=0;
    if(version==3){plan.automationCount=3;plan.automation[0]={0,.002,1200};plan.automation[1]={0,.02,7200};plan.automation[2]={0,.05,600};}
    plan.eventCount=2;plan.events[0]={0,.002,.1};plan.events[1]={1,.04,0};
    for(unsigned i=0;i<16;i++){auto& r=plan.routes[i];r.target=i%6;r.kind=i%4;r.bipolar=i%2;r.depth=r.target%2?.5:10;r.smoothing=i%2?.01:0;r.envelope={.01,.01,.4,.01};if(r.target==4)r.depth=.5;}
    premidi::WaveBank sine(0,plan.oscillators[0].harmonics,rate),triangle(1,plan.oscillators[1].harmonics,rate);
    std::array<float,8192> first{},second{};premidi::Voice reference(plan,rate,{&sine,&triangle});auto before=allocations;reference.process(first.data(),4096);require(before==allocations,"v2 reference allocated");
    for(const std::size_t block:{1,17,64,128,511}){
     premidi::Voice voice(plan,rate,{&sine,&triangle});before=allocations;
     for(std::size_t at=0;at<4096;at+=block)voice.process(second.data()+2*at,std::min<std::size_t>(block,4096-at));
     require(before==allocations&&first==second,"v2 allocation or block invariance failed");for(float v:second)require(std::isfinite(v)&&std::abs(v)<16,"Unstable v2 PCM");
    }
   }
   std::cerr<<"PASS: 400 waveform/filter/rate/extreme and 6 maximum-route v2/v3 profiles, 5 block sizes, finite bounded PCM and no C++ allocations in process\n";return 0;
  }
#ifdef _WIN32
  _setmode(_fileno(stdin),_O_BINARY);_setmode(_fileno(stdout),_O_BINARY);
#endif
  require(u32()==0x344e4d50,"Unsupported prepared transport version");
  const auto rate=u32(),frames=u32();require(rate>=8000&&rate<=192000&&frames>0&&frames<=rate*12,"Invalid render size");
  premidi::Plan plan;plan.version=u32();require(plan.version==1||plan.version==2||plan.version==3||plan.version==4,"Unsupported execution contract");plan.start=f64();plan.duration=f64();plan.sourceEnd=f64();plan.graphEnd=f64();plan.pan=f64();plan.cutoff=f64();plan.q=f64();plan.filterType=u32();if(plan.version>=4){plan.sweepStart=f64();plan.sweepEnd=f64();}require(plan.filterType<=3,"Invalid filter type");
  require(plan.start>=0&&plan.duration>0&&plan.sourceEnd>plan.start&&plan.graphEnd>=plan.sourceEnd&&std::abs(plan.pan)<=1&&plan.cutoff>=50&&plan.cutoff<=14000&&plan.q>=.1&&plan.q<=16&&(plan.version<4||(plan.sweepStart>=50&&plan.sweepStart<=14000&&plan.sweepEnd>plan.start&&plan.sweepEnd<=plan.graphEnd)),"Invalid prepared voice");
  for(auto& osc:plan.oscillators){osc.frequency=f64();osc.level=f64();osc.detune=f64();osc.wave=u32();require(osc.wave<=4,"Invalid waveform");for(auto& h:osc.harmonics){h=f64();require(h>=0&&h<=1,"Invalid harmonic recipe");}osc.count=u32();require(osc.count<=600&&osc.frequency>0&&osc.frequency<=18000&&osc.level>=0&&osc.level<=1&&std::abs(osc.detune)<=100,"Invalid oscillator");for(std::uint32_t i=0;i<osc.count;i++){osc.curve[i]=f64();require(std::abs(osc.curve[i])<=2500,"Pitch curve out of range");}}
  plan.off=f64();plan.pitch=f64();plan.velocity=f64();plan.routeCount=u32();require(plan.off>plan.start&&plan.off<=plan.sourceEnd&&plan.pitch>=0&&plan.pitch<=127&&plan.velocity>=0&&plan.velocity<=1&&plan.routeCount<=16&&(plan.version>=2||plan.routeCount==0),"Invalid modulation bounds");
  for(unsigned i=0;i<plan.routeCount;i++){
   auto& r=plan.routes[i];r.target=u32();r.kind=u32();r.bipolar=u32();r.depth=f64();r.smoothing=f64();r.rate=f64();r.root=f64();r.span=f64();for(auto& v:r.envelope)v=f64();
   const double limit=r.target==4?8:r.target==5?2:r.target%2?1:2400;
   require(r.target<6&&r.kind<4&&r.bipolar<=1&&std::abs(r.depth)<=limit&&r.smoothing>=0&&r.smoothing<=.1&&r.rate>=.05&&r.rate<=20&&r.root>=0&&r.root<=127&&r.span>=1&&r.span<=127&&r.envelope[0]>=0&&r.envelope[0]<=3&&r.envelope[1]>=0&&r.envelope[1]<=3&&r.envelope[2]>=0&&r.envelope[2]<=1&&r.envelope[3]>=.01&&r.envelope[3]<=4,"Invalid prepared modulation route");
  }
  plan.automationCount=u32();require(plan.automationCount<=6&&(plan.version==3?plan.automationCount>=2:plan.version==4?(plan.automationCount==0||plan.automationCount>=2):plan.automationCount==0),"Invalid automation count");
  double previousAutomation=-1;
  for(unsigned i=0;i<plan.automationCount;i++){auto& event=plan.automation[i];event.time=f64();event.value=f64();require(event.time>previousAutomation&&event.time>=plan.start&&event.time<=plan.graphEnd&&event.value>=50&&event.value<=14000,"Invalid automation event");previousAutomation=event.time;}
  plan.eventCount=u32();require(plan.eventCount>=4&&plan.eventCount<=6,"Invalid envelope count");
  double previous=-1;for(std::uint32_t i=0;i<plan.eventCount;i++){auto& event=plan.events[i];event.kind=u32();event.time=f64();event.value=f64();require(event.kind<=1&&event.time>=previous&&event.value>=0&&event.value<=1,"Invalid envelope event");previous=event.time;}
  require(std::cin.peek()==std::char_traits<char>::eof(),"Trailing prepared data");
  std::array<std::unique_ptr<premidi::WaveBank>,2> ownedBanks;std::array<const premidi::WaveBank*,2> banks{};
  for(std::size_t i=0;i<2;i++)if(plan.oscillators[i].wave||plan.version>=2){ownedBanks[i]=std::make_unique<premidi::WaveBank>(plan.oscillators[i].wave,plan.oscillators[i].harmonics,rate);banks[i]=ownedBanks[i].get();}
  premidi::Voice voice(plan,rate,banks);std::size_t channels=2;
#ifdef PREMIDI_PROBE
  const bool probeMode=argc==2&&std::strcmp(argv[1],"--probe")==0;if(probeMode)channels=5;
#endif
  std::vector<float> output(static_cast<std::size_t>(frames)*channels);
  const auto before=allocations;
#ifdef PREMIDI_PROBE
  if(probeMode){
   for(unsigned i=0;i<frames;i++){float pcm[2];voice.process(pcm,1);const auto& p=voice.probe;output[5*i]=p.wave0;output[5*i+1]=p.cents0;output[5*i+2]=p.frequency0;output[5*i+3]=pcm[0];output[5*i+4]=pcm[1];}
  }else
#endif
  for(std::size_t offset=0;offset<frames;offset+=128)voice.process(output.data()+2*offset,std::min<std::size_t>(128,frames-offset));
  require(allocations==before,"Audio processing allocated memory");
  for(float sample:output)require(std::isfinite(sample),"Nonfinite PCM");
  // Portable little-endian PCM serialization is a host operation, outside process.
  for(float sample:output){std::uint32_t bits;std::memcpy(&bits,&sample,4);unsigned char bytes[4];for(int i=0;i<4;i++)bytes[i]=static_cast<unsigned char>(bits>>(8*i));if(std::fwrite(bytes,1,4,stdout)!=4)throw std::runtime_error("PCM write failed");}
  return 0;
 }catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}
}
