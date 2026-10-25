// A phrase is a placement of a reusable 16-step chunk on the shared song
// clock. An optional offset moves the beginning within the assigned bar;
// repeating it every N steps permits real 3-beat/5-beat cycles against 4/4.
// Placements are native music instructions, not a visual or playback-only mode.
export const STEPS_PER_BAR = 16;
export const defaultPlacement = () => ({offset:0,every:STEPS_PER_BAR,repeats:1});
export function placementFor(instrument,bar){
 return instrument.placements?.[bar] ?? defaultPlacement();
}
export function* phraseInstances(score,instrument){
 const limit=score.bars*STEPS_PER_BAR;
 for(let bar=0;bar<instrument.timeline.length;bar++){
  const chunk=instrument.chunks.find(item=>item.id===instrument.timeline[bar]);
  if(!chunk)continue;
  const {offset,every,repeats}=placementFor(instrument,bar);
  for(let index=0;index<repeats;index++){
   const start=bar*STEPS_PER_BAR+offset+every*index;
   if(start>=limit)break;
   yield {chunk,bar,start,index};
  }
 }
}
// Every consumer (live transport, WAV rendering, scrubber) resolves events
// through one absolute timeline instead of assuming bar-local chunks.
export function eventsAtStep(score,absoluteStep){
 const limit=score.bars*STEPS_PER_BAR;
 if(!Number.isInteger(absoluteStep)||absoluteStep<0)return [];
 const songStep=absoluteStep%limit;
 const result=[],barIndex=Math.floor(songStep/STEPS_PER_BAR),step=songStep%STEPS_PER_BAR;
 for(const instrument of score.instruments){
  for(const phrase of phraseInstances(score,instrument)){
   const relative=songStep-phrase.start;
   if(relative<0||relative>=STEPS_PER_BAR)continue;
   for(const note of phrase.chunk.notes)
    if(note.start===relative)
     result.push({instrument,note,barIndex,step,sourceBar:phrase.bar,chunk:phrase.chunk});
  }
 }
 return result;
}
export function chunkProgress(score,instrumentId,chunkId,position){
 if(!position||!Number.isInteger(position.bar)||position.bar<0||
    position.bar>=score.bars||!Number.isFinite(position.step))return null;
 const instrument=score.instruments.find(item=>item.id===instrumentId);
 if(!instrument)return null;
 const songStep=position.bar*STEPS_PER_BAR+position.step;
 for(const phrase of phraseInstances(score,instrument)){
  if(phrase.chunk.id!==chunkId)continue;
  const relative=songStep-phrase.start;
  if(relative>=0&&relative<STEPS_PER_BAR)return relative;
 }
 return null;
}
