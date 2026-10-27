import {phaseCoefficients} from '../../dsp/periodic-wave.js';
import {setOscillatorWave} from '../../../harmonics.js';
// A v2/v3 source may be started on the preceding render boundary.
// Its periodic recipe compensates that silent pre-roll, keeping phase zero at
// the authored onset. The carrier then consumes complete control quanta.
const phases=new WeakMap();
export function prepareOscillator(context,slot,plan,index=0){
 const oscillator=context.createOscillator();
 const frame=plan.start*context.sampleRate,quantum=128,warmFrame=Math.floor(frame/quantum)*quantum;
 const warmed=plan.version>=2&&frame%quantum!==0;
 let sourceStart=plan.start;
 if(warmed){
  sourceStart=warmFrame/context.sampleRate;
  // Avoid representing a nominal integer frame just above its boundary.
  if(sourceStart*context.sampleRate>warmFrame){const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,sourceStart);view.setBigUint64(0,view.getBigUint64(0)-1n);sourceStart=view.getFloat64(0);}
  const cents=slot.pitch.values?.[0]??slot.detune;
  oscillator.detune.value=cents;
  const phase=-2*Math.PI*Math.fround(slot.frequency)*2**(cents/1200)*(frame-warmFrame)/context.sampleRate;
  let cache=phases.get(context);if(!cache){cache=new Map();phases.set(context,cache);}
  const key=slot.wave+':'+(slot.harmonics??[]).join(',')+':'+phase;let wave=cache.get(key);
  if(!wave){const {real,imag}=phaseCoefficients(slot,phase,context.sampleRate);wave=context.createPeriodicWave(real,imag,{disableNormalization:true});if(cache.size>=64)cache.clear();cache.set(key,wave);}
  oscillator.setPeriodicWave(wave);
 }else setOscillatorWave(context,oscillator,slot);
 return {oscillator,sourceStart,warmed};
}
