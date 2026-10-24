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
// A musical event is a note in a reusable chunk at an absolute timeline step.
// Read from the latest score at scheduling time so edits can be heard without stopping.
export function stepEvents(doc, absoluteStep) {
 const cycle=Math.max(1,doc.bars*16),stepInSong=absoluteStep%cycle;
 const barIndex=Math.floor(stepInSong/16),step=stepInSong%16,events=[];
 for(const instrument of doc.instruments) {
  const chunk=instrument.chunks.find(p=>p.id===instrument.timeline[barIndex]);
  if(!chunk)continue;
  for(const n of chunk.notes)if(n.start===step)events.push({instrument,note:n,barIndex,step});
 }
 return events;
}
function bar(ctx,out,doc,index,start) {
 const unit=secondsPerStep(doc);
 for(const instrument of doc.instruments){const chunk=instrument.chunks.find(c=>c.id===instrument.timeline[index]);if(chunk)for(const n of chunk.notes)note(ctx,out,instrument,n,start+n.start*unit,n.duration*unit); }
}
let context;
export async function audition(t,pitch) {
 context||=new AudioContext();await context.resume();note(context,context.destination,t,{pitch,velocity:.8},context.currentTime+.01,.13);
}
/**
 * Score is optionally a callback: the studio provides its currently edited
 * document rather than a snapshot. Only the near-future sixteenth-note steps
 * are scheduled, so edits and undo/redo take effect while playback continues.
 */
export async function play(score,{loop=false,onPosition=()=>{},onStop=()=>{}}={}) {
 context||=new AudioContext();await context.resume();
 const ctx=context,out=ctx.createGain(),read=typeof score==="function"?score:()=>score;
 const loops=()=>typeof loop==="function"?loop():loop;
 out.gain.value=.85;out.connect(ctx.destination);
 let scheduled=0,nextTime=ctx.currentTime+.07,shown=-1,stopped=false,timer;
 const positionQueue=[];
 function stop(){
  if(stopped)return;stopped=true;clearInterval(timer);
  const now=ctx.currentTime;
  out.gain.cancelScheduledValues(now);out.gain.setValueAtTime(Math.max(0,out.gain.value),now);
  out.gain.linearRampToValueAtTime(0,now+.025);
  setTimeout(()=>{try{out.disconnect();}catch{}},100);onStop();
 }
 function tick(){
  if(stopped)return;
  const ahead=ctx.currentTime+.095;
  let guarded=0;
  while(nextTime<ahead && guarded++<24){
   const doc=read(),cycle=doc.bars*16;
   if(!loops() && scheduled>=cycle)break;
   const step=scheduled%cycle,barIndex=Math.floor(step/16),unit=secondsPerStep(doc);
   for(const event of stepEvents(doc,scheduled)){
    note(ctx,out,event.instrument,event.note,nextTime,event.note.duration*unit);
   }
   positionQueue.push({time:nextTime,barIndex,step:step%16,absolute:scheduled});
   nextTime+=unit;scheduled++;
  }
  while(positionQueue.length&&positionQueue[0].time<=ctx.currentTime){
   const now=positionQueue.shift();
   if(now.absolute!==shown){shown=now.absolute;onPosition(now.barIndex,now.step);}
  }
  const current=read();
  if(!loops()&&scheduled>=current.bars*16&&ctx.currentTime>nextTime+.75)stop();
 }
 timer=setInterval(tick,25);tick();return {stop};
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
