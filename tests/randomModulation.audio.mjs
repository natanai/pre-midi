// Focused host oracle, opt-in: external Web Audio module and local C++ compiler.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {attachModulation} from '../src/hosts/web/modulation.js';
import {modulationWave} from '../src/dsp/modulation.js';
const {OfflineAudioContext}=await import(process.env.WEB_AUDIO_MODULE??'node-web-audio-api');
const folder=await mkdtemp(join(tmpdir(),'premidi-random-'));
try{
 const source=join(folder,'oracle.cpp'),binary=join(folder,'oracle');
 await writeFile(source,`#include "native/modulation.hpp"
#include <iostream>
#include <iomanip>
int main(){std::cout<<std::setprecision(17);for(unsigned kind:{7u,8u,9u})for(double seed:{1.,17.,127.}){
 std::array<premidi::Route,16> routes{};auto& r=routes[0];r.kind=kind;r.target=7;r.depth=1;r.bipolar=1;r.rate=3;r.root=seed;if(kind==9)r.envelope={.8,-.2,-.6,.1};
 premidi::Modulation m(routes,1,16000,0,100,101,60,1);
 for(double t:{0.,.1,.37,1.,20.13})std::cout<<kind<<" "<<seed<<" "<<t<<" "<<m.next(t)[7]<<"\\n";}}
`);
 execFileSync(process.env.CXX||'c++',['-std=c++17','-O1','-I',resolve('.'),source,'-o',binary]);
 for(const line of execFileSync(binary,{encoding:'utf8'}).trim().split('\n')){
  const [kind,seed,time,value]=line.split(' ').map(Number);
  assert.ok(Math.abs(value-modulationWave(kind===7?'sample-hold':kind===8?'smooth-random':'steps',time*3,seed,kind===9?[.8,-.2,-.6,.1]:undefined))<1e-7,JSON.stringify({kind,seed,time,value,expected:modulationWave(kind===7?'sample-hold':kind===8?'smooth-random':'steps',time*3,seed,kind===9?[.8,-.2,-.6,.1]:undefined)}));
 }
 console.log('PASS native random sequence matches JS knot/interpolation oracle, including direct seeks');
 for(const shape of ['sample-hold','smooth-random','steps'])for(const elapsed of [0,.37]){
  const rate=16000,context=new OfflineAudioContext(1,rate,rate),gain=context.createGain(),tone=context.createConstantSource();tone.offset.value=1;tone.connect(gain);gain.connect(context.destination);tone.start(0);tone.stop(1);
  const owner={nodes:[],sources:[]},route={id:'r',source:{kind:'lfo',shape,rate:3,seed:17,...(shape==='steps'?{steps:[.8,-.2,-.6,.1]}:{})},target:'amplitude',unit:'linear_gain',depth:.5,polarity:'bipolar',smoothing:0};
  attachModulation(context,{start:.125,off:.9,graphEnd:1,elapsed,expression:{pitch:60,velocity:1},modulation:{version:1,routes:[route]}},new Map([['amplitude',gain.gain]]),owner);
  const pcm=(await context.startRendering()).getChannelData(0);let error=0,bad=[];
  // Exclude the ConstantSource startup sample; inspect every later frame.
  for(let i=2001;i<pcm.length;i++){
   const cycles=(elapsed+i/rate-.125)*3;
   const d=Math.abs(pcm[i]-(1+.5*modulationWave(shape,cycles,17,route.source.steps)));error=Math.max(error,d);if(d>2e-5&&bad.length<8)bad.push({i,cycles,actual:pcm[i],expected:1+.5*modulationWave(shape,cycles,17,route.source.steps)});
  }
  assert.ok(error<1e-4,shape+' resume error '+error+' '+JSON.stringify(bad));
  console.log('PASS Web Audio random source',JSON.stringify({shape,elapsed,maxError:error}));
 }
}finally{await rm(folder,{recursive:true,force:true});}
