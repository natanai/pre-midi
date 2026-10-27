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
   std::cerr<<"PASS: 400 waveform/filter/rate/extreme profiles, 5 block sizes, finite bounded PCM and no C++ allocations in process\n";return 0;
  }
#ifdef _WIN32
  _setmode(_fileno(stdin),_O_BINARY);_setmode(_fileno(stdout),_O_BINARY);
#endif
  require(u32()==0x324e4d50,"Unsupported prepared transport version");
  const auto rate=u32(),frames=u32();require(rate>=8000&&rate<=192000&&frames>0&&frames<=rate*12,"Invalid render size");
  premidi::Plan plan;plan.start=f64();plan.duration=f64();plan.sourceEnd=f64();plan.graphEnd=f64();plan.pan=f64();plan.cutoff=f64();plan.q=f64();plan.filterType=u32();require(plan.filterType<=3,"Invalid filter type");
  require(plan.start>=0&&plan.duration>0&&plan.sourceEnd>plan.start&&plan.graphEnd>=plan.sourceEnd&&std::abs(plan.pan)<=1&&plan.cutoff>=50&&plan.cutoff<=14000&&plan.q>=.1&&plan.q<=16,"Invalid prepared voice");
  for(auto& osc:plan.oscillators){osc.frequency=f64();osc.level=f64();osc.detune=f64();osc.wave=u32();require(osc.wave<=4,"Invalid waveform");for(auto& h:osc.harmonics){h=f64();require(h>=0&&h<=1,"Invalid harmonic recipe");}osc.count=u32();require(osc.count<=600&&osc.frequency>0&&osc.frequency<=18000&&osc.level>=0&&osc.level<=1&&std::abs(osc.detune)<=100,"Invalid oscillator");for(std::uint32_t i=0;i<osc.count;i++){osc.curve[i]=f64();require(std::abs(osc.curve[i])<=2500,"Pitch curve out of range");}}
  plan.eventCount=u32();require(plan.eventCount>=4&&plan.eventCount<=6,"Invalid envelope count");
  double previous=-1;for(std::uint32_t i=0;i<plan.eventCount;i++){auto& event=plan.events[i];event.kind=u32();event.time=f64();event.value=f64();require(event.kind<=1&&event.time>=previous&&event.value>=0&&event.value<=1,"Invalid envelope event");previous=event.time;}
  require(std::cin.peek()==std::char_traits<char>::eof(),"Trailing prepared data");
  std::array<std::unique_ptr<premidi::WaveBank>,2> ownedBanks;std::array<const premidi::WaveBank*,2> banks{};
  for(std::size_t i=0;i<2;i++)if(plan.oscillators[i].wave){ownedBanks[i]=std::make_unique<premidi::WaveBank>(plan.oscillators[i].wave,plan.oscillators[i].harmonics,rate);banks[i]=ownedBanks[i].get();}
  premidi::Voice voice(plan,rate,banks);std::vector<float> output(static_cast<std::size_t>(frames)*2);
  const auto before=allocations;for(std::size_t offset=0;offset<frames;offset+=128)voice.process(output.data()+2*offset,std::min<std::size_t>(128,frames-offset));
  require(allocations==before,"Audio processing allocated memory");
  for(float sample:output)require(std::isfinite(sample),"Nonfinite PCM");
  // Portable little-endian PCM serialization is a host operation, outside process.
  for(float sample:output){std::uint32_t bits;std::memcpy(&bits,&sample,4);unsigned char bytes[4];for(int i=0;i<4;i++)bytes[i]=static_cast<unsigned char>(bits>>(8*i));if(std::fwrite(bytes,1,4,stdout)!=4)throw std::runtime_error("PCM write failed");}
  return 0;
 }catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}
}
