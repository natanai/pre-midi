import {attachModulation} from "../../src/hosts/web/modulation.js";
import {routeValueAt,combineParameter,smoothingAlpha} from "../../src/dsp/modulation.js";
import {modulationFixtures} from "./modulation-fixtures.js";
import {difference} from "./metrics.js";
export async function qualifyModulationMath(add){
 const targets=["oscillators.0.detune","oscillators.0.level","oscillators.1.detune","oscillators.1.level","filter.cutoff","pan"];
 for(const sampleRate of [44100,48000,96000])for(const fixture of modulationFixtures()){
  const frames=Math.round(.48*sampleRate),context=new OfflineAudioContext(7,frames,sampleRate),merger=context.createChannelMerger(7);merger.connect(context.destination);
  const plan={modulation:fixture.patch.modulation,start:fixture.start??.01,off:(fixture.start??.01)+.2,graphEnd:.6,expression:{pitch:fixture.pitch,velocity:fixture.velocity}};
  const owner={sources:[],nodes:[]},params=new Map(),bases=[17,fixture.patch.oscillators[0].level,-23,fixture.patch.oscillators[1].level,0,fixture.patch.pan];
  const input=context.createConstantSource();input.offset.value=1;input.start(0);
  for(let i=0;i<5;i++){const gain=context.createGain();gain.gain.value=bases[i];input.connect(gain);gain.connect(merger,0,i);params.set(targets[i],gain.gain);}
  const pan=context.createStereoPanner();pan.pan.value=bases[5];input.connect(pan);const split=context.createChannelSplitter(2);pan.connect(split);split.connect(merger,0,5);split.connect(merger,1,6);params.set("pan",pan.pan);
  attachModulation(context,plan,params,owner);
  const buffer=await context.startRendering(),expected=targets.map(()=>new Float32Array(frames)),states=new Map();
  const routes=[...plan.modulation.routes].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  for(let frame=0;frame<frames;frame++){
   const elapsed=frame/sampleRate-plan.start,offsets=Object.fromEntries(targets.map(id=>[id,0]));
   for(const route of routes){let value=0;if(elapsed>=0){const alpha=smoothingAlpha(route.smoothing,sampleRate);value=alpha*routeValueAt(route,{elapsed,gate:plan.off-plan.start,pitch:fixture.pitch,velocity:fixture.velocity})+(1-alpha)*(states.get(route.id)??0);}states.set(route.id,value);offsets[route.target]+=value;}
   targets.forEach((target,i)=>{
    if(target==="filter.cutoff")expected[i][frame]=Math.max(-8,Math.min(8,offsets[target]))*1200;
    else if(target.endsWith(".level")&&routes.some(route=>route.target===target)&&elapsed<0)expected[i][frame]=0;
    else expected[i][frame]=combineParameter(target,bases[i],offsets[target]);
   });
  }
  const errors=targets.map((target,i)=>{
   const actual=i<5?buffer.getChannelData(i):Float32Array.from(buffer.getChannelData(5),(left,frame)=>4/Math.PI*Math.atan2(buffer.getChannelData(6)[frame],left)-1);
   return {target,...difference(actual,expected[i]),tolerance:i===4?.04:i%2===0&&i<4?.02:.000005};
  });
  add("contract/"+sampleRate+"/"+fixture.id,{errors,routes:routes.length},{math:errors.every(error=>error.max<error.tolerance),finite:errors.every(error=>Number.isFinite(error.max))});
 }
}
