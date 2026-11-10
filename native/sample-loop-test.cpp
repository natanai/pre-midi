#include "sample-loop.hpp"
#include <iostream>
#include <stdexcept>
int main(){
 const float pcm[]={0,.2f,.4f,.6f,.8f,1,1.2f,1.4f};premidi::SampleData sample(pcm,8,8000,1,8000);premidi::SampleLoop loop(1./8000,7./8000,2./8000,8000);
 const float expected[]={0,.2f,.4f,.6f,.8f,1,.8f,.6f,.8f,1,.8f};
 for(unsigned i=0;i<11;i++)if(std::abs(loop.at(sample,loop.wrap(i),0)-expected[i])>1e-7)throw std::runtime_error("Crossfade or loop period differs from the independent tap oracle");
 if(std::abs(loop.at(sample,6.5,0)-.7f)>1e-7)throw std::runtime_error("Loop-boundary interpolation did not use the crossfaded taps");
 std::cout<<"PASS independent loop overlap, wrap, period and fractional-boundary interpolation\n";
}
