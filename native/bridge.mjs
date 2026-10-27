// Control-thread adapter: canonical JSON voice -> bounded prepared C++ values.
// The packet is an IPC encoding, not another musical or project file format.
import {execFileSync,spawnSync} from "node:child_process";
import {mkdtemp,rm,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {validatePatch} from "../synth.js";
export function prepareNativePlan(plan,sampleRate,frames){
 if(plan?.contract!=="pre-midi-synth-voice"||plan.version!==1)throw Error("Native prototype supports synth voice contract v1 only");
 if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000||!Number.isInteger(frames)||frames<1||frames>sampleRate*12)throw Error("Invalid native render size");
 const p=plan.patch,errors=validatePatch(p);if(errors.length)throw Error(errors.join("; "));
 if(p.type!=="synth"||p.noise!==0||p.effects.drive!==0||p.effects.delayMix!==0||(p.filter.sweep??0)!==0||
  plan.movement.depth!==0||plan.movement.tone!==0||plan.movement.tremolo!==0)
  throw Error("Unsupported native profile: no noise/drive/delay/filter-sweep/legacy LFO modulation");
 if(plan.oscillators.some(osc=>osc.frequency*2**(Math.max(osc.detune,...(osc.pitch.values??[]))/1200)>=sampleRate/2))throw Error("Unsupported native pitch above Nyquist");
 const parts=[],u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);parts.push(b);},f64=n=>{if(!Number.isFinite(n))throw Error("Nonfinite native parameter");const b=Buffer.alloc(8);b.writeDoubleLE(n);parts.push(b);};
 u32(0x324e4d50);u32(sampleRate);u32(frames);
 for(const n of [plan.start,plan.duration,plan.end,plan.graphEnd,p.pan,p.filter.cutoff,p.filter.resonance])f64(n);u32(["lowpass","highpass","bandpass","notch"].indexOf(p.filter.type));
 if(plan.oscillators.length!==2||plan.amplitude.events.length>6)throw Error("Unsupported native plan bounds");
 for(const osc of plan.oscillators){f64(Math.fround(osc.frequency));f64(Math.fround(osc.level));f64(Math.fround(osc.detune));u32(["sine","triangle","square","sawtooth","harmonic"].indexOf(osc.wave));(osc.harmonics??Array(32).fill(0)).forEach(f64);const values=osc.pitch.values??[];if(values.length>600)throw Error("Native pitch curve too long");u32(values.length);values.forEach(f64);}
 u32(plan.amplitude.events.length);for(const event of plan.amplitude.events){if(!["set","linear"].includes(event.kind))throw Error("Unknown envelope event");u32(event.kind==="set"?0:1);f64(event.time);f64(Math.fround(event.value));}
 return Buffer.concat(parts);
}
export async function buildNativeRenderer(){
 const directory=await mkdtemp(join(tmpdir(),"premidi-native-")),binary=join(directory,process.platform==="win32"?"render.exe":"render");
 const compiler=process.env.CXX||"g++",root=fileURLToPath(new URL("./",import.meta.url));
 try{
  const args=["-std=c++17","-O2","-ffp-contract=off","-Wall","-Wextra","-Werror","-pedantic",join(root,"render.cpp"),"-o",binary];
  execFileSync(compiler,args,{stdio:"pipe"});const selfTest=execFileSync(binary,["--selftest"],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  return {binary,compiler:execFileSync(compiler,["--version"],{encoding:"utf8"}).split("\n")[0],flags:args.slice(0,7),selfTest:"passed: 400 waveform/filter/rate/extreme profiles, five block sizes and allocation assertions",
   render(plan,sampleRate,frames){const result=spawnSync(binary,[],{input:prepareNativePlan(plan,sampleRate,frames),maxBuffer:32*1024*1024});if(result.status!==0)throw Error(result.stderr?.toString()||"Native render failed");if(result.stdout.length!==frames*8)throw Error("Native PCM length mismatch");return result.stdout;},
   dispose:()=>rm(directory,{recursive:true,force:true})};
 }catch(error){await rm(directory,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error("Usage: npm run native:render -- plan.json output.f32le");
 const request=JSON.parse(await readFile(input,"utf8")),renderer=await buildNativeRenderer();
 try{await writeFile(output,renderer.render(request.plan,request.sampleRate,request.frames));process.stderr.write("Rendered native stereo Float32 PCM\n");}finally{await renderer.dispose();}
}
