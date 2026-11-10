// Publish a musical snapshot only after all of its recorded sources are ready.
// An older playable snapshot remains available during slow source preparation.
export function createPreparedDocument(getDocument,prepare,isCurrent=()=>true){
 let document=null,revision=0,generation=0;
 return {
  read:()=>document,get revision(){return revision;},
  async refresh(){
   const token=++generation,current=()=>isCurrent()&&token===generation,snapshot=structuredClone(getDocument());
   await prepare(snapshot,current);if(!current())return false;document=snapshot;revision++;return true;
  }
 };
}
