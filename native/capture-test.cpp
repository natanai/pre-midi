#include "session.hpp"
#include "capture.hpp"
#include <cstdlib>
#include <iostream>
#include <new>
static thread_local bool callback=false;static unsigned allocations=0;
__attribute__((noinline)) void* operator new(std::size_t n){if(callback)allocations++;if(auto* p=std::malloc(n))return p;throw std::bad_alloc();}
__attribute__((noinline)) void operator delete(void* p)noexcept{std::free(p);}
__attribute__((noinline)) void operator delete(void* p,std::size_t)noexcept{std::free(p);}
__attribute__((noinline)) void* operator new[](std::size_t n){return ::operator new(n);}
__attribute__((noinline)) void operator delete[](void* p)noexcept{std::free(p);}
__attribute__((noinline)) void operator delete[](void* p,std::size_t)noexcept{std::free(p);}
static float sample(std::uint64_t frame){return static_cast<float>(frame*1e-7);}
int main(){try{
 unsigned cases=0;const std::uint8_t empty[]={0x50,0x4d,0x53,0x31,0,0,0,0};
 for(const unsigned rate:{8000,44100,48000,96000,192000})for(const unsigned block:{1,17,128,511,8192}){
  auto session=std::make_unique<premidi::Session>(empty,sizeof(empty),rate,.2,0);session->countIn(137,1);
  premidi::Capture take;take.prepare(rate,.1,2,true);take.arm();std::vector<float> input(block),output(2*block);std::uint64_t clock=0;double clickEnergy=0;
  while(take.phase.load()!=3){
   for(unsigned i=0;i<block;i++)input[i]=sample(clock+i);
   unsigned budget=256;callback=true;session->process(output.data(),block,false,budget);
   take.process(input.data(),block,clock,true,session->lastLeadFrames,session->lastMusicFrames,session->state==premidi::paused);callback=false;
   for(auto value:output)clickEnergy+=std::abs(value);
   clock+=block;premidi::require(clock<rate*3,"Native capture did not complete");
  }
  const auto lead=static_cast<std::uint64_t>(std::ceil(rate*60./137*4-1e-9)),offset=static_cast<std::uint64_t>(std::llround(.002*rate));
  premidi::require(take.startFrame.load()==lead,"Count-in/capture frame mismatch");premidi::require(take.size()==static_cast<std::uint64_t>(std::ceil(.1*rate)),"Capture duration drift");
  premidi::require(clickEnergy>1&&take.missing.load()==0,"Count-in or microphone data missing");
  for(std::uint64_t i=0;i<take.size();i++)premidi::require(take.data()[i]==sample(lead+offset+i),"Capture lost input alignment or latency compensation");
  cases++;
 }
 {
  premidi::Capture take;take.prepare(48000,.1,0,true);take.arm();std::array<float,128> input{};input.fill(.25f);callback=true;
  take.process(input.data(),128,0,true,0,128,false);const auto prior=take.frames.load();take.process(input.data(),128,128,true,0,0,true);
  premidi::require(take.frames.load()==prior,"Paused capture consumed microphone frames");take.stop();take.process(input.data(),128,256,true,0,0,true);callback=false;
  premidi::require(take.phase.load()==3&&take.size()==128,"Paused take could not stop safely");cases++;
 }
 {
  premidi::Capture take;take.prepare(48000,.1,2,false);take.arm();take.start(48000,.003);std::array<float,128> input{};input.fill(.4f);std::uint64_t clock=0;
  while(take.phase.load()!=2){callback=true;take.process(input.data(),128,clock,false,0,0,true);callback=false;clock+=128;}
  premidi::require(take.startFrame.load()==144,"Standalone countdown used a wall timer");take.stop();callback=true;take.process(input.data(),128,clock,false,0,0,true);callback=false;
  premidi::require(take.phase.load()==3&&take.size()==112,"Manual stop lost latency-compensation tail");cases++;
 }
 {
  auto session=std::make_unique<premidi::Session>(empty,sizeof(empty),48000,.2,0);session->countIn(120,1);std::array<float,256> out{};session->command(2);unsigned budget=256;
  while(session->state==premidi::playing){callback=true;session->process(out.data(),128,false,budget);callback=false;}
  const auto remaining=session->leadRemaining.load();callback=true;session->process(out.data(),128,false,budget);callback=false;
  premidi::require(session->state==premidi::paused&&session->leadRemaining.load()==remaining&&session->position.load()==0,"Paused count-in clock moved");session->command(3);cases++;
 }
 premidi::require(allocations==0,"Native count-in/capture callback allocated");std::cout<<"{\"cases\":"<<cases<<",\"allocations\":0,\"hardwareQualification\":false}\n";return 0;
}catch(const std::exception& e){callback=false;std::cerr<<e.what()<<'\n';return 1;}}
