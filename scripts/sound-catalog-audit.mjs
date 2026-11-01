// Run "node scripts/sound-catalog-audit.mjs" for the full computed catalogue.
// The catalog is intentionally derived from factory and example patches, not
// an independent hand-maintained inventory.
import {PRESETS,makePatch} from "../synth.js";
import {SAMPLE_LIBRARY,makeSamplerPatch} from "../samples.js";
import {EXAMPLE_SOUND_PRESETS} from "../examples.js";
import {DRUM_RACKS} from "../drumRacks.js";

const factory=[...PRESETS,...SAMPLE_LIBRARY,...EXAMPLE_SOUND_PRESETS,...DRUM_RACKS];
const pitch=60;
const details=p=>{
 const patch=p.patch|| (p.assets?makeSamplerPatch(p):makePatch(p.id));
 const zones=patch.type==="sample"?
   patch.zones.map(z=>z.assetId).sort():[];
 const osc=patch.type==="synth"?patch.oscillators.filter(o=>o.level>.035).map(o=>({
  wave:o.wave,octave:o.octave,ratio:+(o.level/patch.oscillators[0].level).toFixed(2),
  harmonics:o.harmonics?.map(x=>+x.toFixed(3))
 })):[];
 return {id:p.id,name:p.name,category:p.category,source:p.id.startsWith("example-")?"example":
   p.sounds?"rack":p.assets?"sample":"synth",type:patch.type,patch,
   zones,osc,origin:p.sounds?null:patch.presetId,trigger:p.trigger,
   gain:p.gain??1,volume:p.volume??1,sourceCount:p.sounds?.length??0};
};
const all=factory.map(details);
function baseKey(p){
 if(p.type==="sample")return "sample:"+p.zones.join(",");
 if(p.type==="synth")return "synth:"+p.osc.map(o=>o.wave+":"+o.octave+":"+
  (o.harmonics||[]).map(x=>x.toFixed(2)).join(",")).join("|");
 return null;
}
const properties=p=>{
 const x=p.patch,m=x.movement||{},e=x.effects||{};
 const f=x.filter||{};
 return {gain:x.gain??1,attack:x.attack??x.envelope?.attack??0,
  release:x.release??x.envelope?.release??0,filter:f.cutoff??8000,
  filterType:f.type??"lowpass",drive:x.drive??e.drive??0,
  glide:m.glide??0,glideTime:m.glideTime??0,depth:m.depth??0,
  tremolo:m.tremolo??0,tone:m.tone??0,strum:x.strumMs??0,
  noise:x.noise??0,pan:x.pan??0,oneShot:x.oneShot??false,
  followPitch:x.followPitch??false,modulation:JSON.stringify(x.modulation??null)};
};
function distance(a,b){
 const x=properties(a),y=properties(b),out={};
 for(const k of Object.keys(x)){
  const p=x[k],q=y[k];
  if(typeof p==="number"&&typeof q==="number"){
   let d;
   if(k==="filter"||k==="gain")d=Math.abs(Math.log2(Math.max(.01,p)/Math.max(.01,q)));
   else d=Math.abs(p-q);
   const thresh={gain:.15,filter:.18,attack:.02,release:.15,drive:.05,glide:.25,glideTime:.12,depth:5,tremolo:.05,tone:.08,strum:3,noise:.08,pan:.1}[k]??0;
   if(d>thresh)out[k]=+d.toFixed(3);
  }else if(p!==q)out[k]=true;
 }
 return out;
}
const singles=all.filter(p=>!p.sourceCount);
const families=new Map();
for(const p of singles){const key=baseKey(p);if(!key)continue;if(!families.has(key))families.set(key,[]);families.get(key).push(p);}
const shared=[...families].filter(([k,v])=>v.length>1).map(([key,items])=>({
 kind:key.split(":")[0],family:key.slice(0,100),
 entries:items.map(p=>p.id+" ("+p.name+")"),
 comparisons:items.flatMap((p,i)=>items.slice(i+1).map(q=>({
  a:p.id,b:q.id,delta:distance(p,q)
 })))
}));
const examples=singles.filter(p=>p.source==="example");
const selfSimilar=examples.map(e=>{
 const b=singles.find(p=>p.id===e.origin);
 return {id:e.id,name:e.name,category:e.category,origin:e.origin,
  sameSource:!!b&&baseKey(e)===baseKey(b),
  diff:b?distance(e,b):null};
});
const summary={total:all.length,singles:singles.length,racks:all.length-singles.length,
 counts:Object.fromEntries([...new Set(all.map(p=>p.source))].map(src=>[src,all.filter(p=>p.source===src).length])),
 byCategory:Object.fromEntries([...new Set(all.map(p=>p.category))].map(cat=>[cat,all.filter(p=>p.category===cat).length]))};
console.log(JSON.stringify({summary,shared,selfSimilar},null,2));
