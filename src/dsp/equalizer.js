// RBJ biquads, normalized for both native DF-I and Web Audio IIRFilterNode.
// Primary equations: https://www.w3.org/TR/audio-eq-cookbook/
export const EQ_TYPES=Object.freeze(['bell','lowshelf','highshelf','highpass','lowpass']);
export const defaultEq=()=>({version:1,bands:[100,500,2500,8000].map((frequency,i)=>({id:'band-'+(i+1),enabled:false,type:i===0?'lowshelf':i===3?'highshelf':'bell',frequency,gain:0,q:.707}))});
export function validateEq(eq){
 if(eq===undefined)return [];
 if(!eq||eq.version!==1||!Array.isArray(eq.bands)||eq.bands.length!==4||Object.keys(eq).some(k=>!['version','bands'].includes(k)))return ['Invalid equalizer.'];
 const ids=new Set();for(const b of eq.bands){
  if(!b||typeof b.id!=='string'||!b.id||ids.has(b.id)||typeof b.enabled!=='boolean'||!EQ_TYPES.includes(b.type)||!Number.isFinite(b.frequency)||b.frequency<20||b.frequency>20000||!Number.isFinite(b.gain)||Math.abs(b.gain)>24||!Number.isFinite(b.q)||b.q<.1||b.q>18||Object.keys(b).some(k=>!['id','enabled','type','frequency','gain','q'].includes(k)))return ['Invalid EQ band.'];ids.add(b.id);
 }return [];
}
export function eqCoefficients(b,rate){
 if(!b.enabled||(['bell','lowshelf','highshelf'].includes(b.type)&&b.gain===0))return [1,0,0,0,0];
 const w=2*Math.PI*Math.min(b.frequency,rate*.499)/rate,c=Math.cos(w),s=Math.sin(w),A=10**(b.gain/40),alpha=s/(2*b.q),shelf=s*Math.SQRT2/2,v=2*Math.sqrt(A)*shelf;
 let x,y,z,a0,a1,a2;
 if(b.type==='bell'){x=1+alpha*A;y=-2*c;z=1-alpha*A;a0=1+alpha/A;a1=y;a2=1-alpha/A;}
 else if(b.type==='lowshelf'){x=A*((A+1)-(A-1)*c+v);y=2*A*((A-1)-(A+1)*c);z=A*((A+1)-(A-1)*c-v);a0=(A+1)+(A-1)*c+v;a1=-2*((A-1)+(A+1)*c);a2=(A+1)+(A-1)*c-v;}
 else if(b.type==='highshelf'){x=A*((A+1)+(A-1)*c+v);y=-2*A*((A-1)+(A+1)*c);z=A*((A+1)+(A-1)*c-v);a0=(A+1)-(A-1)*c+v;a1=2*((A-1)-(A+1)*c);a2=(A+1)-(A-1)*c-v;}
 else{const high=b.type==='highpass';x=(1+(high?c:-c))/2;y=(high?-1:1)*(1+(high?c:-c));z=x;a0=1+alpha;a1=-2*c;a2=1-alpha;}
 return [x/a0,y/a0,z/a0,a1/a0,a2/a0];
}
export function eqMagnitude(eq,frequency,rate=48000){
 const w=2*Math.PI*frequency/rate,c=Math.cos(w),s=Math.sin(w),c2=Math.cos(2*w),s2=Math.sin(2*w);
 return (eq?.bands??[]).reduce((gain,b)=>{const [b0,b1,b2,a1,a2]=eqCoefficients(b,rate);return gain*Math.hypot(b0+b1*c+b2*c2,-b1*s-b2*s2)/Math.max(1e-15,Math.hypot(1+a1*c+a2*c2,-a1*s-a2*s2));},1);
}
export const validateFilterStages=value=>value===undefined||[1,2,4].includes(value)?[]:['Invalid filter slope.'];
