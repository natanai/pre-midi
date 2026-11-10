// One parameter authority for all sound sources. Serialization paths belong to
// context adapters; these IDs describe musical meaning, not storage shape.
const all=["synth","sample","vocal"],recorded=["sample","vocal"];
const freeze=value=>{
 if(value&&typeof value==="object"&&!Object.isFrozen(value)){
  Object.values(value).forEach(freeze);Object.freeze(value);
 }
 return value;
};
const parameter=(id,unit,min,max,defaultValue,step,display,extra={})=>({
 id,unit,min,max,default:defaultValue,interpolation:"linear",contexts:all,
 scope:"processing",bypass:{mode:"none"},ui:{step,display},...extra
});
const choice=(id,values,defaultValue,extra={})=>({
 id,unit:"enum",values,default:defaultValue,interpolation:"step",contexts:all,
 scope:"processing",bypass:{mode:"none"},...extra
});
const nonzero=(id,reason)=>({id,equals:0,reason});
const filterBypass={mode:"null",owner:"filter",contexts:recorded};
export const SOUND_PARAMETERS=freeze([
 parameter("envelope.attack","seconds",0,3,.01,.01,"seconds",{
  scope:"articulation",effectiveMin:.002,trigger:"note-on",
  variants:{sample:{max:2,default:.005,effectiveMin:0,ui:{step:.005,display:"seconds"},trigger:"sample-on"},
   vocal:{max:2,default:.005,effectiveMin:0,ui:{step:.005,display:"seconds"},trigger:"clip-start"}}
 }),
 parameter("envelope.decay","seconds",0,3,.16,.01,"seconds",{scope:"articulation",contexts:["synth"],trigger:"attack-end"}),
 parameter("envelope.sustain","linear_gain",0,1,.65,.01,"percent",{scope:"articulation",contexts:["synth"],trigger:"decay-end"}),
 parameter("envelope.release","seconds",.01,4,.2,.01,"seconds",{
  scope:"articulation",trigger:"note-off",
  variants:{sample:{min:0,max:3,default:.17,trigger:"sample-gate-or-source-end"},
   vocal:{min:0,max:3,default:.03,trigger:"clip-end"}}
 }),
 ...[0,1].flatMap(i=>[
  choice(`oscillators.${i}.wave`,["sine","triangle","square","sawtooth","harmonic"],i?"sine":"triangle",{scope:"source",contexts:["synth"]}),
  parameter(`oscillators.${i}.level`,"linear_gain",0,1,i?.2:.8,.01,"percent",{
   scope:"source",contexts:["synth"],modulation:{index:i*2+1,name:`oscillator ${i+1} level`,unit:"linear_gain",limit:1}
  }),
  parameter(`oscillators.${i}.octave`,"octaves",-2,2,0,1,"number",{scope:"source",contexts:["synth"],integer:true,interpolation:"step"}),
  parameter(`oscillators.${i}.detune`,"cents",-100,100,0,1,"cents",{
   scope:"source",contexts:["synth"],modulation:{index:i*2,name:`oscillator ${i+1} pitch`,unit:"cents",limit:2400}
  }),
  ...Array.from({length:32},(_,n)=>parameter(`oscillators.${i}.harmonics.${n}`,"linear_gain",0,1,n===0?1:0,.01,"percent",{scope:"source",contexts:["synth"]}))
 ]),
 choice("filter.type",["lowpass","highpass","bandpass","notch"],"lowpass",{bypass:filterBypass}),
 parameter("filter.cutoff","hz",50,14000,8000,1,"hz",{
  interpolation:"exponential",bypass:filterBypass,ui:{step:1,display:"hz",log:true},
  variants:{sample:{default:14000},vocal:{default:14000}},
  modulation:{index:4,name:"brightness",unit:"octaves",limit:8}
 }),
 parameter("filter.resonance","filter_resonance",.1,16,.7,.1,"number",{
  modulation:{index:6,name:"resonance",unit:"filter_resonance",limit:15.9},
  bypass:filterBypass,interpretation:{lowpass:"db",highpass:"db",bandpass:"linear_q",notch:"linear_q"}
 }),
 parameter("filter.sweep","octaves",-5,5,0,.1,"number",{bypass:{mode:"zero"}}),
 parameter("filter.sweepTime","seconds",.01,3,.2,.01,"seconds",{inactiveWhen:[nonzero("filter.sweep","filter sweep is zero")]}),
 parameter("noise","linear_gain",0,1,0,.01,"percent",{contexts:["synth"],scope:"source",bypass:{mode:"zero"},automation:{index:10}}),
 parameter("noiseDecay","seconds",0,4,0,.01,"seconds",{contexts:["synth"],scope:"source",bypass:{mode:"zero",meaning:"continuous noise"},inactiveWhen:[nonzero("noise","noise level is zero")]}),
 parameter("pan","pan",-1,1,0,.01,"pan",{modulation:{index:5,name:"pan",unit:"pan",limit:2}}),
 parameter("amplitude","linear_gain",0,2,1,.01,"percent",{routeOnly:true,modulation:{index:7,name:"amplitude",unit:"linear_gain",limit:1}}),
 parameter("effects.drive","normalized",0,1,0,.01,"percent",{bypass:{mode:"zero"}}),
 parameter("stereoWidth","ratio",0,2,1,.01,"percent",{automation:{index:8}}),
 parameter("msBalance","balance",-1,1,0,.01,"number",{automation:{index:9}}),
 parameter("delayTone","hz",20,20000,20000,1,"hz",{inactiveWhen:[nonzero("effects.delayMix","delay mix is zero")]}),
 {id:"delayPingPong",unit:"boolean",default:false,interpolation:"step",contexts:all,scope:"processing",bypass:{mode:"none"}},
 parameter("effects.delayMix","normalized",0,1,0,.01,"percent",{bypass:{mode:"zero"}}),
 parameter("effects.delayTime","seconds",.05,2,.24,.01,"seconds",{inactiveWhen:[nonzero("effects.delayMix","delay mix is zero")]}),
 parameter("effects.delayFeedback","linear_gain",0,.8,.26,.01,"percent",{inactiveWhen:[nonzero("effects.delayMix","delay mix is zero")]}),
 ...[
  ["rate","hz",.1,20,5,.1,"hz","depth"],
  ["depth","cents",0,100,0,1,"cents"],
  ["delay","seconds",0,3,0,.05,"seconds","depth"],
  ["glide","semitones",-12,12,0,.1,"semitones"],
  ["glideTime","seconds",.01,3,.18,.01,"seconds","glide"],
  ["tremolo","normalized",0,1,0,.01,"percent"],
  ["tremoloRate","hz",.1,20,5,.1,"hz","tremolo"],
  ["tone","normalized",0,1,0,.01,"percent"],
  ["toneRate","hz",.1,20,2,.1,"hz","tone"]
 ].map(([id,unit,min,max,value,step,display,parent])=>parameter("movement."+id,unit,min,max,value,step,display,{
  ...(parent?{inactiveWhen:[nonzero("movement."+parent,({depth:"vibrato",tremolo:"pulse",tone:"tone movement"}[parent]??parent)+" amount is zero")]}:{bypass:{mode:"zero"}})
 })),
 choice("bend.shape",["straight","scoop","rise","fall","dip","wail","wave"],"straight",{bypass:{mode:"value",value:"straight"}}),
 parameter("bend.amount","semitones",0,12,2,.25,"semitones",{inactiveWhen:[{id:"bend.shape",equals:"straight",reason:"straight has no pitch bend"}]}),
 parameter("bend.rate","hz",.1,12,4,.1,"hz",{inactiveWhen:[{id:"bend.shape",notEquals:"wave",reason:"speed affects the wave bend shape"},nonzero("bend.amount","bend amount is zero")]}),
 parameter("gain","linear_gain",0,2,.9,.01,"percent",{contexts:recorded,variants:{vocal:{default:1}},bypass:{mode:"zero",meaning:"mute"}}),
 parameter("transpose","semitones",-24,24,0,1,"semitones",{contexts:recorded,scope:"source",interpolation:"step"}),
 parameter("strumMs","milliseconds",-25,25,0,1,"number",{contexts:["sample"],scope:"source"}),
 parameter("zones.root","midi_note",0,127,60,1,"number",{contexts:["sample"],scope:"source",integer:true,interpolation:"step"}),
 ...["followPitch","oneShot","preserveDynamics"].map(id=>({
  id,unit:"boolean",default:id==="followPitch",interpolation:"step",contexts:["sample"],scope:"source",bypass:{mode:"none"}
 }))
]);
// Cached projections are derived from the frozen authority. Validation runs
// while preparing voices, so it must not rebuild context overlays per note.
const contextLists=new Map(all.map(context=>[context,freeze(SOUND_PARAMETERS.filter(p=>p.contexts.includes(context))
 .map(p=>p.variants?.[context]?freeze({...p,...p.variants[context]}):p))]));
const contextMaps=new Map([...contextLists].map(([context,items])=>[context,new Map(items.map(p=>[p.id,p]))]));
export const parameterFor=(id,context="synth")=>contextMaps.get(context)?.get(id)??null;
export const parametersFor=context=>contextLists.get(context)??[];
export const SYNTH_PARAMETERS=parametersFor("synth");
// Live-safe automation reuses the modulation indices and parameter bounds.
export const automationParametersFor=context=>parametersFor(context).filter(p=>p.modulation||p.automation).map(p=>({...p,automationIndex:p.modulation?.index??p.automation.index}));
export function validParameterValue(id,value,context="synth"){
 const p=parameterFor(id,context);
 if(!p)return false;
 if(p.unit==="boolean")return typeof value==="boolean";
 if(p.values)return p.values.includes(value);
 return Number.isFinite(value)&&value>=p.min&&value<=p.max&&(!p.integer||Number.isInteger(value));
}
export function clampParameterValue(id,value,context="synth"){
 const p=parameterFor(id,context);
 if(!p||p.values||p.unit==="boolean"||!Number.isFinite(value))throw Error("Invalid numeric parameter: "+id);
 return Math.max(p.min,Math.min(p.max,value));
}
export function parameterDefaults(prefix,context="synth"){
 const start=prefix?prefix+".":"";
 return Object.fromEntries(parametersFor(context).filter(p=>!p.routeOnly&&p.id.startsWith(start)&&!p.id.slice(start.length).includes("."))
  .map(p=>[p.id.slice(start.length),p.default]));
}
export function parameterField(id,{context="synth",...presentation}={}){
 const p=parameterFor(id,context);
 if(!p)throw Error("Unsupported "+context+" parameter: "+id);
 return {path:id.split("."),min:p.min,max:p.max,...p.ui,
  defaultValue:p.default,...(p.values?{options:p.values}:{}),...presentation};
}
// read() accepts stable IDs. The caller maps them to its own serialized shape.
export function parameterCapability(id,context,read=()=>undefined){
 const p=parameterFor(id,context);
 if(!p)return {state:"unsupported",supported:false,reason:"this source does not implement "+id};
 const value=key=>read(key)??parameterFor(key,context)?.default;
 const bypass=read("chain.bypass")??[];
 const stage=id.startsWith("filter.")||["movement.tone","movement.toneRate"].includes(id)?"filter":id==="effects.drive"?"drive":(id.startsWith("effects.delay")||["delayTone","delayPingPong"].includes(id))?"delay":null;
 const order=read("chain.order"),parallel=read("chain.parallel")??[];
 if(stage&&stage!=="delay"&&Array.isArray(order)&&!order.includes(stage)&&!parallel.some(route=>route.order.includes(stage)))return {state:"inactive",supported:true,reason:stage+" is outside the processing chain"};
 if(stage&&parallel.some(route=>route.order.includes(stage)&&route.gain===0))return {state:"inactive",supported:true,reason:"parallel route share is zero"};
 if(stage&&bypass.includes(stage))return {state:"inactive",supported:true,reason:stage+" is bypassed"};
 const filterOff=context!=="synth"&&read("filter")===null;
 if(filterOff&&(id.startsWith("filter.")||["movement.tone","movement.toneRate"].includes(id)))
  return {state:"inactive",supported:true,reason:"the filter is off"};
 const inactive=p.inactiveWhen?.find(rule=>"equals" in rule?value(rule.id)===rule.equals:value(rule.id)!==rule.notEquals);
 return inactive?{state:"inactive",supported:true,reason:inactive.reason}:
  {state:p.scope==="source"?"source-only":"implemented",supported:true};
}
// Route envelopes reuse ordinary synth ADSR. Route-only controls live here too.
export const MODULATION_CONTROLS=freeze({
 rate:{id:"modulation.lfo.rate",unit:"hz",min:.01,max:20,default:.5,step:.01,display:"hz"},
 step:{id:"modulation.lfo.step",unit:"number",min:-1,max:1,default:0,step:.01,display:"number"},
 seed:{id:"modulation.lfo.seed",unit:"number",min:1,max:127,default:1,step:1,display:"number"},
 smoothing:{id:"modulation.smoothing",unit:"seconds",min:0,max:.1,default:.005,step:.001,display:"seconds"},
 root:{id:"modulation.keytrack.root",unit:"midi_note",min:0,max:127,default:60,step:1,display:"number"},
 span:{id:"modulation.keytrack.span",unit:"semitones",min:1,max:127,default:24,step:1,display:"number"}
});
export const MODULATION_SOURCE_CONTEXTS=freeze({macro:all,lfo:all,envelope:all,velocity:["synth","sample"],keytrack:["synth","sample"]});
export const modulationSourcesFor=context=>Object.keys(MODULATION_SOURCE_CONTEXTS).filter(id=>MODULATION_SOURCE_CONTEXTS[id].includes(context));
export const modulationTargetsFor=context=>parametersFor(context).filter(p=>p.modulation)
 .sort((a,b)=>a.modulation.index-b.modulation.index)
 .map(p=>freeze({id:p.id,...p.modulation,parameter:p}));
const blockDefinitions=new Map();
export function validateParameterBlock(block,prefix,{context="synth",optional=[],extra=[]}={}){
 if(!block||typeof block!=="object"||Array.isArray(block))return ["Invalid "+prefix+" parameters."];
 const cacheKey=context+":"+prefix;
 if(!blockDefinitions.has(cacheKey))blockDefinitions.set(cacheKey,parametersFor(context).filter(p=>p.id.startsWith(prefix+".")&&!p.id.slice(prefix.length+1).includes(".")));
 const definitions=blockDefinitions.get(cacheKey);
 const fields=new Set([...definitions.map(p=>p.id.slice(prefix.length+1)),...extra]),errors=[];
 for(const p of definitions){
  const key=p.id.slice(prefix.length+1);
  if(block[key]===undefined&&optional.includes(key))continue;
  if(!validParameterValue(p.id,block[key],context))errors.push("Invalid "+p.id+".");
 }
 for(const key of Object.keys(block))if(!fields.has(key))errors.push("Unsupported "+prefix+" parameter: "+key+".");
 return errors;
}

// Instance controls share this authority without becoming source-patch fields.
export const DYNAMICS_PARAMETERS=freeze({
 threshold:parameter('dynamics.threshold','db',-96,0,-18,.1,'db'),
 ratio:parameter('dynamics.ratio','ratio',1,40,4,.1,'number'),
 knee:parameter('dynamics.knee','db',0,24,6,.1,'db'),
 attack:parameter('dynamics.attack','seconds',0,1,.01,.001,'seconds'),
 release:parameter('dynamics.release','seconds',.001,5,.1,.001,'seconds'),
 makeup:parameter('dynamics.makeup','db',-24,24,0,.1,'db'),
 range:parameter('dynamics.range','db',0,96,60,.1,'db'),
 hold:parameter('dynamics.hold','seconds',0,2,.02,.001,'seconds'),
 frequency:parameter('dynamics.frequency','hz',1000,14000,6500,10,'hz',{ui:{step:10,display:'hz',log:true}}),
 bandwidth:parameter('dynamics.bandwidth','octaves',.1,3,1,.01,'octaves'),
 amount:parameter('dynamics.amount','db',0,24,9,.1,'db')
});
export const DYNAMICS_FIELDS=freeze({
 compressor:['threshold','ratio','knee','attack','release','makeup'],
 gate:['threshold','range','hold','attack','release'],
 limiter:['threshold','release'],
 deesser:['frequency','bandwidth','threshold','amount','attack','release']
});
export const dynamicsParameter=(kind,key)=>DYNAMICS_FIELDS[kind]?.includes(key)?DYNAMICS_PARAMETERS[key]:null;
export const REVERB_PARAMETERS=freeze({
 mix:parameter('reverb.mix','linear_gain',0,1,0,.01,'percent'),
 preDelay:parameter('reverb.preDelay','seconds',0,.2,.02,.001,'seconds'),
 decay:parameter('reverb.decay','seconds',.2,6,1.5,.01,'seconds'),
 damping:parameter('reverb.damping','linear_gain',0,1,.45,.01,'percent'),
 size:parameter('reverb.size','linear_gain',0,1,.5,.01,'percent'),
 width:parameter('reverb.width','linear_gain',0,1,1,.01,'percent')
});
