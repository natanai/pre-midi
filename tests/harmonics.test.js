import test from "node:test";
import assert from "node:assert/strict";
import {harmonicRecipe,harmonicWave,HARMONIC_COUNT,setOscillatorWave} from "../harmonics.js";
import {makePatch,validatePatch} from "../synth.js";
import {create,parse} from "../schema.js";
import {exportProject} from "../packageIO.js";
test("editable harmonics survive a small sample-free native export",async()=>{
 const score=create(),patch=makePatch("harmonic-keys");
 patch.oscillators[0].harmonics[24]=.3;
 score.instruments[0].sounds[0].patch=patch;
 const exported=exportProject(score),raw=await exported.blob.text();
 assert.match(exported.name,/\.premidi$/);
 assert.ok(raw.length<5000);
 assert.deepEqual(parse(raw).instruments[0].sounds[0].patch,patch);
 assert.deepEqual(validatePatch(makePatch("harmonic-reed")),[]);
});
test("harmonics are bounded numeric parameters, including malformed imported data",()=>{
 for(const invalid of [null,[],Array(31).fill(1),Array(33).fill(1),Array(32).fill(NaN),Array(32).fill(-.1),Array(32).fill(2)]){
  const patch=makePatch("harmonic-keys");patch.oscillators[0].harmonics=invalid;
  assert.ok(validatePatch(patch).length);
 }
});
test("the harmonic oscillator sets the intended Fourier coefficients on Web Audio",()=>{
 const values=harmonicRecipe();values[2]=.4;
 let generated,selected;
 const context={createPeriodicWave(real,imag){generated={real,imag};return generated;}};
 const oscillator={setPeriodicWave(value){selected=value;}};
 setOscillatorWave(context,oscillator,{wave:"harmonic",harmonics:values});
 assert.equal(selected,generated);
 assert.equal(generated.imag.length,HARMONIC_COUNT+1);
 assert.equal(generated.imag[0],0);assert.equal(generated.imag[1],1);
 assert.ok(Math.abs(generated.imag[3]-.4)<1e-6);
 const phase=.73;
 assert.ok(Math.abs(harmonicWave(values,phase)-(Math.sin(phase)+.4*Math.sin(3*phase))/1.4)<1e-9);
});
