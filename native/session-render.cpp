#include "session.hpp"
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <iterator>
#include <new>
#ifdef _WIN32
#include <io.h>
#include <fcntl.h>
#endif
static bool audioScope=false;static std::uint64_t allocations=0;
__attribute__((noinline)) void* operator new(std::size_t size){if(audioScope)++allocations;if(auto* p=std::malloc(size))return p;throw std::bad_alloc();}
__attribute__((noinline)) void operator delete(void* p)noexcept{std::free(p);}
__attribute__((noinline)) void operator delete(void* p,std::size_t)noexcept{std::free(p);}
static void write32(std::uint32_t value){unsigned char out[4];for(unsigned i=0;i<4;i++)out[i]=static_cast<unsigned char>(value>>(8*i));if(std::fwrite(out,1,4,stdout)!=4)throw std::runtime_error("Native PCM write failed");}
static void writeFloat(float value){std::uint32_t bits;std::memcpy(&bits,&value,4);write32(bits);}
int main(int argc,char** argv){try{
#ifdef _WIN32
 _setmode(_fileno(stdin),_O_BINARY);_setmode(_fileno(stdout),_O_BINARY);
#endif
 std::vector<std::uint8_t> bytes((std::istreambuf_iterator<char>(std::cin)),{});
 if(argc==3&&std::string(argv[1])=="--asset"){
  const unsigned rate=static_cast<unsigned>(std::stoul(argv[2]));premidi::PacketReader in(bytes.data(),bytes.size());const auto sourceRate=in.u32(),channels=in.u32(),frames=in.u32();
  premidi::require(sourceRate>=8000&&sourceRate<=192000&&channels>=1&&channels<=32&&frames>0&&std::uint64_t(frames)*channels*4==in.remaining(),"Invalid decoded native asset");
  std::vector<float> pcm(static_cast<std::size_t>(frames)*channels);for(auto& value:pcm)value=in.f32();premidi::SampleData sample(pcm.data(),frames,sourceRate,channels,rate);
  write32(sample.rate);write32(sample.channels);write32(static_cast<std::uint32_t>(sample.frames));writeFloat(sample.normalization);for(auto value:sample.pcm)writeFloat(value);return 0;
 }
 premidi::require(argc==8,"session-render: rate cycle seek loop frames block state");
 const auto rate=static_cast<unsigned>(std::stoul(argv[1])),frames=static_cast<unsigned>(std::stoul(argv[5])),block=static_cast<unsigned>(std::stoul(argv[6]));
 premidi::require(rate>=8000&&rate<=192000&&frames>0&&frames<=rate*600&&block>0&&block<=8192,"Invalid native session render size");
 premidi::Session session(bytes.data(),bytes.size(),rate,std::stod(argv[2]),std::stod(argv[3]));const bool loop=std::stoi(argv[4])!=0;
 std::vector<float> pcm(static_cast<std::size_t>(frames)*2);for(unsigned at=0;at<frames;){const auto count=std::min(block,frames-at);unsigned budget=premidi::maxOnsets;audioScope=true;session.process(pcm.data()+2*at,count,loop,budget);audioScope=false;at+=count;}
 premidi::require(!allocations&&!session.fault.load(),"Native render allocated or exceeded callback bounds");for(float value:pcm){premidi::require(std::isfinite(value),"Nonfinite native session PCM");writeFloat(value);}return 0;
}catch(const std::exception& error){audioScope=false;std::cerr<<error.what()<<'\n';return 1;}}
