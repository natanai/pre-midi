export const secondsPerStep = doc => 60/doc.bpm/4;
const frequency = pitch => 440 * 2**((pitch-69)/12);
function note(ctx,out,t,n,start,duration) {
 const osc=ctx.createOscillator(),env=ctx.createGain();
 const attack=Math.min(t.attack,duration*.5),release=Math.max(.01,t.release),peak=Math.max(.00001,t.volume*n.velocity*.16);
 osc.type=t.waveform;osc.frequency.setValueAtTime(frequency(n.pitch),start);
 env.gain.setValueAtTime(0,start);env.gain.linearRampToValueAtTime(peak,start+Math.max(.004,attack));
 env.gain.setValueAtTime(peak,start+duration);env.gain.exponentialRampToValueAtTime(.00001,start+duration+release);
 osc.connect(env);env.connect(out);osc.start(start);osc.stop(start+duration+release+.01);
 osc.onended=()=>{osc.disconnect();env.disconnect();};
}
function bar(ctx,out,doc,index,start) {
 const unit=secondsPerStep(doc);
 for(const t of doc.tracks){const p=t.patterns.find(p=>p.id===t.arrangement[index]);if(p)for(const n of p.notes)note(ctx,out,t,n,start+n.start*unit,n.duration*unit);}
}
let context;
export async function audition(t,pitch) {
 context||=new AudioContext();await context.resume();note(context,context.destination,t,{pitch,velocity:.8},context.currentTime+.01,.13);
}
export async function play(doc,{loop=false,onPosition=()=>{},onStop=()=>{}}={}) {
 context||=new AudioContext();await context.resume();const ctx=context,out=ctx.createGain();
 out.gain.value=.85;out.connect(ctx.destination);const unit=secondsPerStep(doc),barDuration=16*unit,origin=ctx.currentTime+.08;
 let scheduled=0,stopped=false,timer;
 function stop() {if(stopped)return;stopped=true;clearInterval(timer);const now=ctx.currentTime;out.gain.cancelScheduledValues(now);out.gain.setValueAtTime(out.gain.value,now);out.gain.linearRampToValueAtTime(0,now+.025);setTimeout(()=>out.disconnect(),100);onStop();}
 function tick() {
  if(stopped)return;
  while(origin+scheduled*barDuration<ctx.currentTime+.2&&(loop||scheduled<doc.bars)){bar(ctx,out,doc,scheduled%doc.bars,origin+scheduled*barDuration);scheduled++;}
  const elapsed=Math.max(0,ctx.currentTime-origin),step=Math.floor(elapsed/unit);
  onPosition(Math.floor(step/16)%doc.bars,step%16);
  if(!loop&&elapsed>doc.bars*barDuration+.1)stop();
 }
 timer=setInterval(tick,40);tick();return {stop};
}
function pcmWav(buffer) {
 const ch=Math.min(2,buffer.numberOfChannels),size=buffer.length*ch*2,result=new ArrayBuffer(44+size),v=new DataView(result),data=Array.from({length:ch},(_,c)=>buffer.getChannelData(c));
 const label=(offset,s)=>{for(let i=0;i<s.length;i++)v.setUint8(offset+i,s.charCodeAt(i));};
 label(0,"RIFF");v.setUint32(4,36+size,true);label(8,"WAVE");label(12,"fmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,ch,true);v.setUint32(24,buffer.sampleRate,true);v.setUint32(28,buffer.sampleRate*ch*2,true);v.setUint16(32,ch*2,true);v.setUint16(34,16,true);label(36,"data");v.setUint32(40,size,true);
 let pos=44;for(let i=0;i<buffer.length;i++)for(let c=0;c<ch;c++){const n=Math.max(-1,Math.min(1,data[c][i]));v.setInt16(pos,n<0?n*32768:n*32767,true);pos+=2;}
 return new Blob([result],{type:"audio/wav"});
}
export async function wav(doc) {
 const duration=doc.bars*16*secondsPerStep(doc)+.85,ctx=new OfflineAudioContext(2,Math.ceil(duration*44100),44100),out=ctx.createGain();out.gain.value=.85;out.connect(ctx.destination);
 for(let i=0;i<doc.bars;i++)bar(ctx,out,doc,i,i*16*secondsPerStep(doc));
 return pcmWav(await ctx.startRendering());
}
