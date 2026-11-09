// Portable numerical reference and browser audio-worklet kernel. A kernel owns
// one note/Clip's stereo-linked detector, never another Sound's state.
export class DynamicsKernel {
 constructor(p,rate){
  this.p=p;this.attack=p.attack===0?0:Math.exp(-1/(p.attack*rate));this.release=Math.exp(-1/(p.release*rate));this.makeup=10**(p.makeup/20);this.ceiling=10**(p.threshold/20);this.holdFrames=Math.ceil(p.hold*rate);this.reduction=p.kind==='gate'?-p.range:0;this.held=0;
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
  }else desired=Math.min(0,p.threshold-level);
  const attacking=p.kind==='gate'?desired>this.reduction:desired<this.reduction;
  const coefficient=p.kind==='limiter'&&attacking?0:attacking?this.attack:this.release;
  this.reduction=desired+coefficient*(this.reduction-desired);
  let gain=10**(this.reduction/20)*(p.kind==='limiter'?1:this.makeup);
  if(p.kind==='limiter'&&peak>0)gain=Math.min(gain,this.ceiling/peak);
  return 1-p.mix+p.mix*gain;
 }
}
