#include "source-processing.hpp"
#include <iostream>
#include <iterator>
#include <cstring>
#ifdef _WIN32
#include <io.h>
#include <fcntl.h>
#endif
int main(int argc,char** argv){try{
#ifdef _WIN32
 _setmode(_fileno(stdin),_O_BINARY);_setmode(_fileno(stdout),_O_BINARY);
#endif
 if(argc!=10)throw std::runtime_error("source-render: rate channels start duration time semitones formant preserve reverse");
 const auto rate=static_cast<unsigned>(std::stoul(argv[1])),channels=static_cast<unsigned>(std::stoul(argv[2]));
 std::vector<char> bytes((std::istreambuf_iterator<char>(std::cin)),{});if(bytes.size()%sizeof(float)||bytes.size()/4%channels)throw std::runtime_error("Invalid PCM input");
 std::vector<float> input(bytes.size()/4);std::memcpy(input.data(),bytes.data(),bytes.size());premidi::SampleData source(input.data(),input.size()/channels,rate,channels,rate);
 auto output=premidi::processSource(source,{std::stod(argv[3]),std::stod(argv[4]),std::stod(argv[5]),std::stod(argv[6]),std::stod(argv[7]),static_cast<unsigned>(std::stoul(argv[8])),static_cast<unsigned>(std::stoul(argv[9]))});
 std::cout.write(reinterpret_cast<const char*>(output.data()),output.size()*sizeof(float));return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
