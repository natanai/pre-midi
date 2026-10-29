#include "plan-packet.hpp"
#include "delay.hpp"
#include <cstdio>
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <vector>
#include <new>
#include <cstdlib>
#include <memory>
#include <iterator>
#ifdef _WIN32
#include <io.h>
#include <fcntl.h>
#endif
static std::uint64_t allocations=0;
void* operator new(std::size_t size){++allocations;if(void* p=std::malloc(size))return p;throw std::bad_alloc();}
void operator delete(void* p) noexcept{std::free(p);}
void operator delete(void* p,std::size_t) noexcept{std::free(p);}
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
   for(const unsigned rate:{44100u,48000u,96000u})for(const unsigned version:{2u,3u,4u}){
    premidi::Plan plan;plan.version=version;plan.routeCount=16;plan.start=.002;plan.off=.015;plan.sourceEnd=.04;plan.graphEnd=.05;plan.oscillators[0].level=.5;plan.oscillators[1].wave=1;plan.oscillators[1].level=0;
    if(version==4){plan.sweepStart=3600;plan.sweepEnd=.025;}
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
   for(const unsigned rate:{44100u,48000u,96000u})for(const double decay:{0.,.04,.3}){
    premidi::Plan plan;plan.version=5;plan.noise=.8;plan.noiseDecay=decay;plan.sweepStart=8000;plan.sweepEnd=.1;plan.oscillators[0].level=0;plan.oscillators[1].level=0;
    plan.start=0;plan.off=.05;plan.sourceEnd=.08;plan.graphEnd=.1;plan.eventCount=2;plan.events[0]={0,0,.5};plan.events[1]={1,.08,0};
    std::array<float,8192> first{},second{};premidi::WaveBank bank(0,plan.oscillators[0].harmonics,rate);premidi::Voice reference(plan,rate,{&bank,&bank});auto before=allocations;reference.process(first.data(),4096);
    require(allocations==before,"Noise render allocated");
    for(const std::size_t block:{1,17,64,128,511}){
     premidi::Voice voice(plan,rate,{&bank,&bank});before=allocations;
     for(std::size_t at=0;at<4096;at+=block)voice.process(second.data()+2*at,std::min<std::size_t>(block,4096-at));
     require(allocations==before&&first==second,"Noise block-size invariance failed");
     for(float v:second)require(std::isfinite(v)&&std::abs(v)<16,"Unstable noise PCM");
    }
    require(std::any_of(first.begin(),first.end(),[](float v){return std::abs(v)>1e-5f;}),"Noise voice silent");
   }
   std::cerr<<"PASS: 400 waveform/filter/rate/extreme and 9 maximum-route v2/v3/v4 profiles, 5 block sizes, finite bounded PCM and no C++ allocations in process\n";return 0;
  }
#ifdef _WIN32
  _setmode(_fileno(stdin),_O_BINARY);_setmode(_fileno(stdout),_O_BINARY);
#endif
  const std::vector<std::uint8_t> bytes((std::istreambuf_iterator<char>(std::cin)),{});
  premidi::PacketReader header(bytes.data(),bytes.size());require(header.u32()==0x344e4d50,"Unsupported prepared transport version");
  const auto rate=header.u32(),frames=header.u32();require(rate>=8000&&rate<=192000&&frames>0&&frames<=rate*12,"Invalid render size");
  const auto plan=premidi::readPlan(bytes.data(),bytes.size(),rate);
  std::array<std::unique_ptr<premidi::WaveBank>,2> ownedBanks;std::array<const premidi::WaveBank*,2> banks{};
  for(std::size_t i=0;i<2;i++)if(plan.oscillators[i].wave||plan.version>=2){ownedBanks[i]=std::make_unique<premidi::WaveBank>(plan.oscillators[i].wave,plan.oscillators[i].harmonics,rate);banks[i]=ownedBanks[i].get();}
  premidi::Voice voice(plan,rate,banks);std::size_t channels=2;
#ifdef PREMIDI_PROBE
  const bool probeMode=argc==2&&std::strcmp(argv[1],"--probe")==0;if(probeMode)channels=5;
#endif
  std::vector<float> output(static_cast<std::size_t>(frames)*channels);
  premidi::Delay delay(plan.delayMix,plan.delayTime,plan.delayFeedback,rate);
  const auto before=allocations;
#ifdef PREMIDI_PROBE
  if(probeMode){
   for(unsigned i=0;i<frames;i++){float pcm[2];voice.process(pcm,1);const auto& p=voice.probe;output[5*i]=p.wave0;output[5*i+1]=p.cents0;output[5*i+2]=p.frequency0;output[5*i+3]=pcm[0];output[5*i+4]=pcm[1];}
  }else
#endif
  for(std::size_t offset=0;offset<frames;offset+=128){
   const auto count=static_cast<unsigned>(std::min<std::size_t>(128,frames-offset));std::array<float,256> dry{};
   voice.process(dry.data(),count);auto* out=output.data()+2*offset;
   for(unsigned i=0;i<2*count;i++)out[i]=dry[i]*static_cast<float>(1-plan.delayMix*.4);
   if(plan.delayMix>0)delay.process(dry.data(),out,count);
  }
  require(allocations==before,"Audio processing allocated memory");
  for(float sample:output)require(std::isfinite(sample),"Nonfinite PCM");
  // Portable little-endian PCM serialization is a host operation, outside process.
  for(float sample:output){std::uint32_t bits;std::memcpy(&bits,&sample,4);unsigned char bytes[4];for(int i=0;i<4;i++)bytes[i]=static_cast<unsigned char>(bits>>(8*i));if(std::fwrite(bytes,1,4,stdout)!=4)throw std::runtime_error("PCM write failed");}
  return 0;
 }catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}
}
