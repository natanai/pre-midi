import {postAutomationFields,POST_AUTOMATION_FIELDS} from './processor-automation.js';
import {modulationWave,smoothingAlpha,modulationStateBefore,DEFAULT_LFO_STEPS} from './modulation.js';
const held=(e,age)=>{
 const attack=Math.max(.002,e.attack);
 return age<attack?age/attack:e.decay>0&&age<attack+e.decay?1-(1-e.sustain)*(age-attack)/e.decay:e.sustain;
};

// Prepared per-note/Clip movement. All storage, route selection and waveform
// tables are created before process(). Each frame uses fixed-size state only.
export class PostModulationCursor {
 constructor(definition,recipe,{start,off,end,elapsed=0,clockStart=0,expression={pitch:60,velocity:1}},rate){
  this.routes=(definition?.routes??[]).filter(r=>r.target.startsWith('processor.'+recipe.id+'.'))
   .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  this.start=start;this.gate=off-start+elapsed;this.elapsed=elapsed;this.clockStart=clockStart;this.expression=expression;this.rate=rate;
  this.state=new Float64Array(this.routes.length);this.alpha=this.routes.map(r=>smoothingAlpha(r.smoothing,rate));
  this.fields=this.routes.map(r=>r.target.split('.')[2]);
  this.changed=[...new Set(this.fields)];this.base=this.changed.map(field=>recipe[field]);
  const definitions=postAutomationFields(recipe.kind);
  this.bounds=this.changed.map(field=>definitions[field]);
  this.sums=new Float32Array(POST_AUTOMATION_FIELDS.length);
  this.indexes=this.fields.map(field=>POST_AUTOMATION_FIELDS.indexOf(field));
  if(elapsed>0)for(let i=0;i<this.routes.length;i++)this.state[i]=modulationStateBefore(this.routes[i],
   {...expression,elapsed,clockStart,gate:this.gate},rate);
 }
 reset(p){for(let i=0;i<this.changed.length;i++)p[this.changed[i]]=this.base[i];}
 apply(p,time){
  this.sums.fill(0);
  const elapsed=time-this.start+this.elapsed;
  for(let i=0;i<this.routes.length;i++){
   const route=this.routes[i],s=route.source;let value,signed=false;
   if(s.kind==='lfo'){
    const cycles=elapsed*s.rate+(s.clock==='timeline'?this.clockStart*s.rate:0)+(s.phase??0);signed=true;
    value=Math.fround(modulationWave(s.shape,cycles,s.seed??1,s.steps??DEFAULT_LFO_STEPS));
   }else if(s.kind==='macro')value=Math.fround(s.value??0);
   else if(s.kind==='velocity')value=Math.fround(this.expression.velocity);
   else if(s.kind==='keytrack'){value=Math.fround(Math.max(-1,Math.min(1,(this.expression.pitch-s.root)/s.span)));signed=true;}
   else{
    const e=s.envelope;
    value=Math.fround(elapsed<=this.gate?held(e,elapsed):elapsed<this.gate+e.release?held(e,this.gate)+(1e-6-held(e,this.gate))*(elapsed-this.gate)/e.release:1e-6);
   }
   if(signed&&route.polarity==='unipolar')value=Math.fround(Math.fround(value*.5)+.5);
   if(!signed&&route.polarity==='bipolar')value=Math.fround(Math.fround(value*2)-1);
   const alpha=this.alpha[i];this.state[i]=alpha*value+(1-alpha)*this.state[i];
   const index=this.indexes[i];this.sums[index]=Math.fround(this.sums[index]+Math.fround(Math.fround(this.state[i])*Math.fround(route.depth)));
  }
  for(let i=0;i<this.changed.length;i++){
   const field=this.changed[i],bounds=this.bounds[i];
   p[field]=Math.max(bounds.min,Math.min(bounds.max,p[field]+this.sums[POST_AUTOMATION_FIELDS.indexOf(field)]));
  }
 }
}
