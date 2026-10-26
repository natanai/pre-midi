// A phrase is a placement of a reusable 16-step chunk on the shared Beat
// clock. An optional offset moves the beginning within the assigned bar;
// repeating it every N steps permits real 3-beat/5-beat cycles against 4/4.
// Placements are native music instructions, not a visual or playback-only mode.
export const STEPS_PER_BAR = 16;
export const defaultPlacement = () => ({offset:0,length:STEPS_PER_BAR,every:STEPS_PER_BAR,repeats:1});
export function placementFor(instrument,bar){
 return {...defaultPlacement(),...(instrument.placements?.[bar]||{})};
}
export function* phraseInstances(beat,instrument){
 const limit=beat.bars*STEPS_PER_BAR;
 for(let bar=0;bar<instrument.timeline.length;bar++){
  const chunk=instrument.chunks.find(item=>item.id===instrument.timeline[bar]);
  if(!chunk)continue;
  const {offset,length,every,repeats}=placementFor(instrument,bar);
  for(let index=0;index<repeats;index++){
   const start=bar*STEPS_PER_BAR+offset+every*index;
   if(start>=limit)break;
   yield {chunk,bar,start,index,length};
  }
 }
}
// Every consumer (live transport, WAV rendering, scrubber) resolves events
// through one absolute timeline instead of assuming bar-local chunks.
export function eventsAtStep(beat,absoluteStep){
 const limit=beat.bars*STEPS_PER_BAR;
 if(!Number.isInteger(absoluteStep)||absoluteStep<0)return [];
 const beatStep=absoluteStep%limit;
 const result=[],barIndex=Math.floor(beatStep/STEPS_PER_BAR),step=beatStep%STEPS_PER_BAR;
 for(const instrument of beat.instruments){
  for(const phrase of phraseInstances(beat,instrument)){
   const relative=beatStep-phrase.start;
   if(relative<0||relative>=phrase.length)continue;
   for(const note of phrase.chunk.notes)
    if(note.start===relative)
     result.push({instrument,note,barIndex,step,sourceBar:phrase.bar,chunk:phrase.chunk});
  }
 }
 return result;
}
export function chunkProgress(beat,instrumentId,chunkId,position){
 if(!position||!Number.isInteger(position.bar)||position.bar<0||
    position.bar>=beat.bars||!Number.isFinite(position.step))return null;
 const instrument=beat.instruments.find(item=>item.id===instrumentId);
 if(!instrument)return null;
 const beatStep=position.bar*STEPS_PER_BAR+position.step;
 for(const phrase of phraseInstances(beat,instrument)){
  if(phrase.chunk.id!==chunkId)continue;
  const relative=beatStep-phrase.start;
  if(relative>=0&&relative<phrase.length)return relative;
 }
 return null;
}
