// Portable numerical reference and browser audio-worklet kernel. A kernel owns
// one note/Clip's stereo-linked detector, never another Sound's state.
// RBJ constant-0-dB-peak bandpass, octave bandwidth with BLT correction:
// https://www.w3.org/TR/audio-eq-cookbook/#formulae
export function deesserBand(p,rate){
 const w=2*Math.PI*Math.min(p.frequency,rate*.45)/rate,s=Math.sin(w),
  alpha=s*Math.sinh(Math.LN2/2*p.bandwidth*w/s),a0=1+alpha;
 return [alpha/a0,0,-alpha/a0,-2*Math.cos(w)/a0,(1-alpha)/a0];
}
export class DynamicsKernel {
 constructor(p,rate){
  this.p=p;this.attack=p.attack===0?0:Math.exp(-1/(p.attack*rate));this.release=Math.exp(-1/(p.release*rate));this.makeup=10**(p.makeup/20);this.ceiling=10**(p.threshold/20);this.holdFrames=Math.ceil(p.hold*rate);this.reduction=p.kind==='gate'?-p.range:0;this.held=0;
  this.band=p.kind==='deesser'?deesserBand(p,rate):null;this.history=new Float64Array(8);
 }
 filtered(input,channel){
  const h=this.history,i=channel*4,c=this.band,
   output=c[0]*input+c[1]*h[i]+c[2]*h[i+1]-c[3]*h[i+2]-c[4]*h[i+3];
  h[i+1]=h[i];h[i]=input;h[i+3]=h[i+2];h[i+2]=Math.abs(output)<1e-30?0:output;
  return Math.fround(output);
 }
 process(frame){
  const left=frame[0],right=frame[1],selective=this.p.kind==='deesser',
   a=selective?this.filtered(left,0):left,b=selective?this.filtered(right,1):right,
   gain=this.gain(Math.max(Math.abs(a),Math.abs(b)));
  frame[0]=Math.fround(selective?left+a*(gain-1):left*gain);
  frame[1]=Math.fround(selective?right+b*(gain-1):right*gain);
 }
 gain(peak){
  const p=this.p;if(p.mix===0)return 1;
  const level=20*Math.log10(Math.max(1e-12,peak));let desired=0;
  if(p.kind==='compressor'){
   const x=level-p.threshold,slope=1/p.ratio-1;
   desired=p.knee===0?Math.min(0,slope*x):x<=-p.knee/2?0:x>=p.knee/2?slope*x:slope*(x+p.knee/2)**2/(2*p.knee);
  }else if(p.kind==='gate'){
   if(level>=p.threshold){this.held=this.holdFrames;desired=0;}
   else if(this.held){this.held--;desired=0;}else desired=-p.range;
  }else desired=Math.max(p.kind==='deesser'?-p.amount:-Infinity,Math.min(0,p.threshold-level));
  const attacking=p.kind==='gate'?desired>this.reduction:desired<this.reduction;
  const coefficient=p.kind==='limiter'&&attacking?0:attacking?this.attack:this.release;
  this.reduction=desired+coefficient*(this.reduction-desired);
  let gain=10**(this.reduction/20)*(p.kind==='limiter'||p.kind==='deesser'?1:this.makeup);
  if(p.kind==='limiter'&&peak>0)gain=Math.min(gain,this.ceiling/peak);
  return 1-p.mix+p.mix*gain;
 }
}
