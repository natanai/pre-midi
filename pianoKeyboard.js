// Geometry for a vertical piano keyboard beside the chromatic note grid.
// White key boundaries share edges; black keys sit over them at their
// semitone-row centers. Values are pixel offsets within the roll viewport.
const BLACK_PITCH_CLASSES = new Set([1,3,6,8,10]);
export const PIANO_LOW_PITCH = 36;
export const PIANO_HIGH_PITCH = 83;
export const PIANO_ROW_HEIGHT = 23;

export function pianoKeyGeometry(low=PIANO_LOW_PITCH,high=PIANO_HIGH_PITCH,rowHeight=PIANO_ROW_HEIGHT) {
 if(!Number.isInteger(low)||!Number.isInteger(high)||low<0||high>127||low>high||
    !Number.isFinite(rowHeight)||rowHeight<=0)throw new RangeError("invalid piano keyboard range");
 const center=pitch=>(high-pitch+.5)*rowHeight;
 const whites=[],blacks=[];
 for(let pitch=high;pitch>=low;pitch--) {
  const position=(high-pitch)*rowHeight;
  if(BLACK_PITCH_CLASSES.has(pitch%12)) {
   blacks.push({pitch,top:position+1,height:Math.max(1,rowHeight-2)});
  } else whites.push(pitch);
 }
 const height=(high-low+1)*rowHeight;
 const white=whites.map((pitch,index)=>{
  const top=index===0?0:(center(whites[index-1])+center(pitch))/2;
  const bottom=index===whites.length-1?height:(center(pitch)+center(whites[index+1]))/2;
  return {pitch,top,height:bottom-top};
 });
 return {white,black:blacks,height};
}
