#include "stream-transport.hpp"
#include <algorithm>
#include <cmath>
#include <fstream>
#include <iostream>
#include <iterator>
#include <vector>
static std::vector<std::uint8_t> read(const char* path){std::ifstream f(path,std::ios::binary);if(!f)throw std::runtime_error("Missing revision fixture");return {(std::istreambuf_iterator<char>(f)),{}};}
struct Page{std::uint64_t first,end;unsigned onsets;bool last;std::vector<std::uint8_t> bytes;};
int main(int argc,char** argv){try{
 premidi::require(argc>=8&&(argc-4)%4==0,"revision fixture arguments");
 const auto rate=static_cast<unsigned>(std::stoul(argv[1]));const auto frames=std::stoull(argv[2]);
 const auto full=read(argv[3]);auto referenceOwner=std::make_unique<premidi::Session>(full.data(),full.size(),rate,static_cast<double>(frames)/rate,0);auto& reference=*referenceOwner;
 std::vector<Page> pages;for(int i=4;i<argc;i+=4)pages.push_back({std::stoull(argv[i]),std::stoull(argv[i+1]),static_cast<unsigned>(std::stoul(argv[i+2])),i+4==argc,read(argv[i+3])});
 std::vector<float> expected(2*frames);for(std::uint64_t at=0;at<frames;){const auto n=static_cast<unsigned>(std::min<std::uint64_t>(128,frames-at));unsigned budget=premidi::maxOnsets;reference.process(expected.data()+2*at,n,false,budget);at+=n;}
 const bool processing=std::any_of(reference.notes.begin(),reference.notes.end(),[](const auto& n){return n.plan.processing.count>0;});
 double maximum=0;std::uint64_t errorFrame=0;
 for(const auto seek:{rate/23u,rate/7u,rate/3u}){
  premidi::StreamTransport candidate(1,2,rate,processing);
  for(const auto& n:reference.notes)if(n.plan.delayMix>0)candidate.registerDelay(n.plan.delayMix,n.plan.delayTime,n.plan.delayFeedback,n.plan.delayTone,n.plan.delayPingPong);
  std::size_t sequence=0;auto fill=[&]{candidate.reclaim();while(sequence<pages.size()){auto& p=pages[sequence];if(!candidate.publish({1,2,sequence+1,p.first,p.end,p.onsets,0,false,p.last},p.bytes.data(),p.bytes.size()))break;++sequence;}};
  while(candidate.position()<seek){fill();const auto end=std::min<std::uint64_t>(seek,candidate.acknowledgmentEnd()?candidate.acknowledgmentEnd():pages[0].end);const auto target=std::max(candidate.position()+1,end);premidi::require(candidate.advanceTo(target),"Revision preroll failed");}
  // Count-in must not advance the Song or lose its reconstructed history.
  candidate.countIn(240,1);std::array<float,256> scratch{};std::uint64_t lead=0;
  while(candidate.leadRemaining()){const auto n=static_cast<unsigned>(std::min<std::uint64_t>(128,candidate.leadRemaining()));unsigned budget=premidi::maxOnsets;premidi::require(candidate.process(scratch.data(),n,budget),"Count-in fault");lead+=n;premidi::require(candidate.position()==seek,"Count-in advanced source time");}
  premidi::require(lead==rate,"Count-in clock mismatch");
  for(std::uint64_t at=seek;at<frames;){fill();const auto n=static_cast<unsigned>(std::min<std::uint64_t>(128,frames-at));unsigned budget=premidi::maxOnsets;premidi::require(candidate.process(scratch.data(),n,budget)&&!candidate.fault(),"Seek continuation fault");for(unsigned i=0;i<2*n;i++){const double e=std::abs(static_cast<double>(scratch[i]-expected[2*at+i]));if(e>maximum){maximum=e;errorFrame=at+i/2;}}at+=n;}
 }
 const double seekError=maximum;
 // A loop is a second contiguous set of source pages, with no reset of
 // active voices or feedback buses at the cycle boundary.
 {
  auto loopingOwner=std::make_unique<premidi::Session>(full.data(),full.size(),rate,static_cast<double>(frames)/rate,0);auto& looping=*loopingOwner;
  premidi::StreamTransport stream(3,4,rate,processing);
  for(const auto& n:looping.notes)if(n.plan.delayMix>0)stream.registerDelay(n.plan.delayMix,n.plan.delayTime,n.plan.delayFeedback,n.plan.delayTone,n.plan.delayPingPong);
  std::size_t sequence=0;std::array<float,256> a{},b{};
  for(std::uint64_t at=0;at<2*frames;){
   stream.reclaim();
   while(sequence<2*pages.size()){
    const auto cycle=sequence/pages.size();const auto& p=pages[sequence%pages.size()];
    if(!stream.publish({3,4,sequence+1,p.first+cycle*frames,p.end+cycle*frames,p.onsets,0,false,false},p.bytes.data(),p.bytes.size()))break;
    ++sequence;
   }
   const auto n=static_cast<unsigned>(std::min<std::uint64_t>(128,2*frames-at));unsigned budget=premidi::maxOnsets,referenceBudget=premidi::maxOnsets;
   looping.process(a.data(),n,true,referenceBudget);
   premidi::require(stream.process(b.data(),n,budget)&&!stream.fault(),"Continuous loop page fault");
   for(unsigned i=0;i<2*n;i++)maximum=std::max(maximum,std::abs(static_cast<double>(a[i]-b[i])));
   at+=n;
  }
 }
 if(maximum>=1e-7)std::cerr<<"seek="<<seekError<<" frame="<<errorFrame<<" loop="<<maximum<<"\n";
 premidi::require(maximum<1e-7,"Seek did not preserve oscillator/filter/sample/delay history");
 std::cout<<"{\"rate\":"<<rate<<",\"seekMaximumError\":"<<maximum<<",\"countInClock\":true}\n";
 return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 1;}}
