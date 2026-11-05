// Real native page packet/resource-lease qualification; not a shipping
// paged host. Uses Session's original prevalidated native DSP preparer.
#include "prepared-page.hpp"
#include <atomic>
#include <array>
#include <cmath>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <iterator>
#include <new>
#include <string>
#include <vector>

static thread_local bool callbackScope=false;
static std::atomic<unsigned> callbackAllocations{0};
__attribute__((noinline)) void* operator new(std::size_t count){
 if(callbackScope)callbackAllocations.fetch_add(1);
 if(auto* p=std::malloc(count))return p;
 throw std::bad_alloc();
}
__attribute__((noinline)) void operator delete(void* p)noexcept{std::free(p);}
__attribute__((noinline)) void operator delete(void* p,std::size_t)noexcept{std::free(p);}
__attribute__((noinline)) void* operator new[](std::size_t count){return ::operator new(count);}
__attribute__((noinline)) void operator delete[](void* p)noexcept{std::free(p);}
__attribute__((noinline)) void operator delete[](void* p,std::size_t)noexcept{std::free(p);}

int main(int argc,char** argv){
 try{
  premidi::require(argc==4,"Usage: native-prepared-page-test packet rate kind");
  const unsigned rate=static_cast<unsigned>(std::stoul(argv[2]));
  const std::string kind=argv[3];
  std::ifstream input(argv[1],std::ios::binary);
  premidi::require(bool(input),"Missing native prepared page packet");
  std::vector<std::uint8_t> packet((std::istreambuf_iterator<char>(input)),{});
  const std::uint64_t origin=std::uint64_t(937)*rate;
  premidi::PageDescriptor authored{91,7,1,origin,
   origin+rate/4,1,0,false,true};
  auto lease=std::make_shared<premidi::PreparedPageLease>(
   authored,packet.data(),packet.size(),rate);
  const auto ready=lease->descriptor();
  const auto retainedUntil=lease->keepThroughFrame();
  premidi::require(ready.prepared&&ready.resources==lease->resourceCount()&&
   ready.onsets==1,"Native page did not validate and bind its real audio resources");
  premidi::require(lease->keepThroughFrame()>=ready.endFrame,
   "Prepared audio resource lease ends before its page metadata");
  const auto& prepared=lease->resources().notes.at(0);
  premidi::require((kind=="synth"&&prepared.plan.kind==0&&
    prepared.plan.sample==nullptr)||
   (kind=="sample"&&prepared.plan.kind==1&&prepared.plan.sample!=nullptr)||
   (kind=="vocal"&&prepared.plan.kind==2&&prepared.plan.sample!=nullptr),
   "Prepared synth/sample/vocal resource identity was not retained");
  if(kind=="synth")premidi::require(
   ready.resources>0&&lease->keepThroughFrame()>ready.endFrame,
   "Synth oscillator/drive/delay resources are not pinned through their tails");
  else premidi::require(ready.resources>0,
   "Sample/recording PCM was not registered as a pinned page resource");

  // Untrusted client claims never turn into a prepared descriptor.
  bool rejected=false;
  try{
   auto forged=authored;forged.prepared=true;
   premidi::PreparedPageLease bad(forged,packet.data(),packet.size(),rate);
  }catch(const std::exception&){rejected=true;}
  premidi::require(rejected,"Fabricated ready bit bypassed C++ page preparation");
  rejected=false;
  try{
   auto forged=authored;forged.onsets=2;
   premidi::PreparedPageLease bad(forged,packet.data(),packet.size(),rate);
  }catch(const std::exception&){rejected=true;}
  premidi::require(rejected,"Fabricated onset count bypassed decoded voice count");
  rejected=false;
  try{premidi::PreparedPageLease bad(authored,packet.data(),3,rate);}
  catch(const std::exception&){rejected=true;}
  premidi::require(rejected,"Truncated page packet bypassed native parser");

  premidi::PageMailbox mailbox(91,7,origin);
  premidi::require(mailbox.publish(ready),"Validated resource metadata could not publish");
  auto pinned=lease;std::weak_ptr<premidi::PreparedPageLease> observer=lease;
  lease.reset();
  // Voice is a callback-owned state object that only borrows prebuilt pointers.
  // The page's resources must stay alive even after its mailbox slot retires.
  premidi::Voice voice(prepared.plan,rate,prepared.banks,0,&prepared.prepared);
  std::array<float,256> chunk{};
  callbackScope=true;
  const auto started=mailbox.advance(origin);
  const auto ended=mailbox.advance(ready.endFrame);
  callbackScope=false;
  premidi::require(started==premidi::PageResult::playing&&
   ended==premidi::PageResult::finished&&mailbox.reclaim()==1,
   "Page metadata did not acknowledge/reclaim independently of DSP resources");
  premidi::require(!observer.expired()&&pinned->resources().notes.size()==1,
   "Mailbox retirement destroyed audio resources used by a continuing Voice");
  float peak=0;
  for(unsigned at=0;at<rate/4;at+=128){
   callbackScope=true;
   voice.process(chunk.data(),128);
   callbackScope=false;
   for(float value:chunk){
    premidi::require(std::isfinite(value),"Native retained Voice became nonfinite");
    peak=std::max(peak,std::abs(value));
   }
  }
  premidi::require(peak>0,"Voice lost its audible PCM after metadata retirement");
  premidi::require(callbackAllocations.load()==0,
   "Native Voice allocated during retained page callback");
  pinned.reset();
  premidi::require(observer.expired(),"Control did not reclaim the audio lease");
  std::cout<<"{\"kind\":\""<<kind<<"\",\"resources\":"<<ready.resources
   <<",\"onsets\":"<<ready.onsets<<",\"tailFrame\":"<<ready.endFrame
   <<",\"retainedUntil\":"<<retainedUntil<<",\"callbackAllocations\":0}\n";
  return 0;
 }catch(const std::exception& error){
  callbackScope=false;
  std::cerr<<"Native prepared-page lease failed: "<<error.what()<<"\n";
  return 1;
 }
}
