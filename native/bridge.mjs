// Control-thread adapter: canonical JSON voice -> bounded prepared C++ values.
// The packet is an IPC encoding, not another musical or project file format.
import {execFileSync,spawnSync} from "node:child_process";
import {mkdtemp,rm,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {encodeNativePlan} from "../src/hosts/native/plan.js";
export function prepareNativePlan(plan,sampleRate,frames){return Buffer.from(encodeNativePlan(plan,sampleRate,frames));}
export async function buildNativeRenderer({probe=false}={}){
 const directory=await mkdtemp(join(tmpdir(),"premidi-native-")),binary=join(directory,process.platform==="win32"?"render.exe":"render");
 const compiler=process.env.CXX||"g++",root=fileURLToPath(new URL("./",import.meta.url));
 try{
  const args=["-std=c++17","-O2","-ffp-contract=off","-Wall","-Wextra","-Werror","-pedantic",join(root,"render.cpp"),"-o",binary];
  if(probe)args.splice(1,0,"-DPREMIDI_PROBE");
  execFileSync(compiler,args,{stdio:"pipe"});const selfTest=execFileSync(binary,["--selftest"],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  return {binary,compiler:execFileSync(compiler,["--version"],{encoding:"utf8"}).split("\n")[0],flags:args.slice(0,args.indexOf(join(root,"render.cpp"))),selfTest:"passed: 400 waveform/filter/rate/extreme and six 16-route v2/v3 profiles, five block sizes and allocation assertions",
   render(plan,sampleRate,frames,inspect=false){if(inspect&&!probe)throw Error("Native probe build required");const result=spawnSync(binary,inspect&&probe?["--probe"]:[],{input:prepareNativePlan(plan,sampleRate,frames),maxBuffer:32*1024*1024});if(result.status!==0)throw Error(result.stderr?.toString()||"Native render failed");if(result.stdout.length!==frames*(inspect&&probe?20:8))throw Error("Native PCM length mismatch");return result.stdout;},
   dispose:()=>rm(directory,{recursive:true,force:true})};
 }catch(error){await rm(directory,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error("Usage: npm run native:render -- plan.json output.f32le");
 const request=JSON.parse(await readFile(input,"utf8")),renderer=await buildNativeRenderer();
 try{await writeFile(output,renderer.render(request.plan,request.sampleRate,request.frames));process.stderr.write("Rendered native stereo Float32 PCM\n");}finally{await renderer.dispose();}
}
