// Native and Web prepare the same normalized transfer table before rendering.
export const DRIVE_SHAPES=Object.freeze(['soft clip','hard clip','wavefold']);
export const driveSettings=patch=>patch.chain?.drive??{};
const inputScale=db=>10**(db/20);
export const driveCompensation=(amount,{inputGain=0}={})=>1/(1+amount*1.1)/Math.sqrt(Math.max(1,inputScale(inputGain)));
export const validDriveSettings=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 Object.keys(value).every(k=>k==='shape'||k==='inputGain')&&
 (value.shape===undefined||DRIVE_SHAPES.includes(value.shape))&&
 (value.inputGain===undefined||(Number.isFinite(value.inputGain)&&value.inputGain>=-24&&value.inputGain<=24));
const curves=new Map();
export function driveCurve(amount,{shape='soft clip',inputGain=0}={}){
 const strength=Math.round(amount*100),key=shape+':'+inputGain+':'+strength;
 if(curves.has(key))return curves.get(key);
 const gain=inputScale(inputGain),k=1+strength*.65,curve=new Float32Array(1024);
 for(let i=0;i<curve.length;i++){
  const x=gain*(2*i/(curve.length-1)-1);
  if(shape==='hard clip')curve[i]=Math.max(-1,Math.min(1,x*(1+strength*.11)));
  else if(shape==='wavefold'){
   const folded=x*(1+strength*.05)+1;
   curve[i]=1-Math.abs(folded-4*Math.floor(folded/4)-2);
  }else curve[i]=Math.tanh(k*x)/Math.tanh(k);
 }
 if(curves.size>=128)curves.delete(curves.keys().next().value);
 curves.set(key,curve);return curve;
}
export function driveTransfer(value,amount,settings){
 if(amount<=0)return value;
 const curve=driveCurve(amount,settings),position=Math.max(0,Math.min(1023,(value+1)*.5*1023));
 const a=Math.floor(position),b=Math.min(1023,a+1);
 return (curve[a]+(curve[b]-curve[a])*(position-a))*driveCompensation(amount,settings);
}
