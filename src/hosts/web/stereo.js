// Imaging precedes pan. Mono sources retain mono routing and cannot gain a
// phantom side channel merely because width is edited.
export function connectStereoImage(context,signal,patch,owner,channels=1){
 const width=patch.stereoWidth??1,balance=patch.msBalance??0;if(width===1&&balance===0)return signal;
 const add=node=>{owner.nodes.push(node);return node;},mid=balance>0?1-balance:1,side=width*(balance<0?1+balance:1);
 if(channels===1){const gain=add(context.createGain());gain.gain.value=mid;signal.connect(gain);return gain;}
 const stereo=add(context.createGain());stereo.channelCount=2;stereo.channelCountMode='explicit';stereo.channelInterpretation='speakers';signal.connect(stereo);
 const split=add(context.createChannelSplitter(2)),merge=add(context.createChannelMerger(2));stereo.connect(split);
 for(const [input,output,gainValue]of [[0,0,(mid+side)/2],[1,0,(mid-side)/2],[0,1,(mid-side)/2],[1,1,(mid+side)/2]]){const gain=add(context.createGain());gain.gain.value=gainValue;split.connect(gain,input);gain.connect(merge,0,output);}return merge;
}
export function createStereoDelay(context,effects,destination){
 const nodes=[],add=n=>{nodes.push(n);return n;},send=add(context.createGain()),delay=add(context.createDelay(2)),feedback=add(context.createGain()),wet=add(context.createGain());
 send.gain.value=effects.delayMix*.55;delay.delayTime.value=effects.delayTime;feedback.gain.value=effects.delayFeedback;wet.gain.value=.8;
 if(effects.delayPingPong){
  const split=add(context.createChannelSplitter(2)),sum=add(context.createGain()),merge=add(context.createChannelMerger(2));send.channelCount=2;send.channelCountMode='explicit';send.connect(split);split.connect(sum,0);split.connect(sum,1);sum.gain.value=Math.SQRT1_2;sum.connect(merge,0,0);merge.connect(delay);
 }else send.connect(delay);
 let returns=delay;
 if((effects.delayTone??20000)<20000){const alpha=1-Math.exp(-2*Math.PI*effects.delayTone/context.sampleRate),tone=add(context.createIIRFilter([alpha],[1,-(1-alpha)]));delay.connect(tone);returns=tone;}
 returns.connect(feedback);
 if(effects.delayPingPong){const split=add(context.createChannelSplitter(2)),swap=add(context.createChannelMerger(2));feedback.connect(split);split.connect(swap,0,1);split.connect(swap,1,0);swap.connect(delay);}else feedback.connect(delay);
 delay.connect(wet);wet.connect(destination);return {input:send,wet,nodes};
}
