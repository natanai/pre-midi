import test from 'node:test';import assert from 'node:assert/strict';
import {phaseCoefficients,periodicTableSize} from '../src/dsp/periodic-wave.js';
test('phase compensation preserves a normalized sine and editable Fourier identity',()=>{
 for(const rate of [44100,48000,96000]){
  const phase=.37,{real,imag}=phaseCoefficients({wave:'sine'},phase,rate);
  assert.ok(Math.abs(real[1]-Math.sin(phase))<1e-7);assert.ok(Math.abs(imag[1]-Math.cos(phase))<1e-7);
  const slot={wave:'harmonic',harmonics:Array.from({length:32},(_,i)=>i===0?1:i===2?.4:0)},a=phaseCoefficients(slot,0,rate),b=phaseCoefficients(slot,phase,rate);
  for(const angle of [0,.2,1,2,3]){
   let expected=0,actual=0;for(let n=1;n<a.imag.length;n++){expected+=a.imag[n]*Math.sin(n*(angle+phase));actual+=b.real[n]*Math.cos(n*angle)+b.imag[n]*Math.sin(n*angle);}
   assert.ok(Math.abs(actual-expected)<2e-7);
  }
  const empty=phaseCoefficients({wave:'harmonic',harmonics:Array(32).fill(0)},phase,rate);assert.ok(empty.real.every(x=>x===0)&&empty.imag.every(x=>x===0));
 }
 assert.equal(periodicTableSize(48000),4096);assert.equal(periodicTableSize(96000),16384);
});
