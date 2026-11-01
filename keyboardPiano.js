// A physical-QWERTY performance layer. Bindings and register changes are local
// editor preferences, never part of a Beat, Song, or .premidi document.
export const PIANO_NOTES = [
  ["KeyZ",48],["KeyS",49],["KeyX",50],["KeyD",51],["KeyC",52],
  ["KeyV",53],["KeyG",54],["KeyB",55],["KeyH",56],["KeyN",57],
  ["KeyJ",58],["KeyM",59],["Comma",60],["KeyL",61],["Period",62],
  ["Semicolon",63],["Slash",64]
].map(([code,pitch])=>({code,pitch,right:pitch>=57}));
export const DEFAULT_BINDINGS = PIANO_NOTES.map(note=>note.code);
export const PIANO_LOW=36, PIANO_HIGH=83;
const STORE="premidi-keyboard-piano-v1";
const WHITE=new Set([0,2,4,5,7,9,11]);
const NAME=["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
export const pitchName=pitch=>NAME[pitch%12]+(Math.floor(pitch/12)-1);
export const keyName=code=>{
  const named={Comma:",",Period:".",Slash:"/",Semicolon:";",Quote:"'",BracketLeft:"[",BracketRight:"]",Backslash:"\\",Minus:"-",Equal:"=",Backquote:"`",IntlBackslash:"\\",NumpadDecimal:"Num ."};
  return named[code]||code.replace(/^Key/,"").replace(/^Digit/,"").replace(/^Numpad/,"Num ");
};
export function canBind(code){
  return /^(Key[A-Z]|Digit[0-9]|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal|Backquote|IntlBackslash|Numpad[0-9]|NumpadDecimal)$/.test(code||"");
}
export function validBindings(codes){
  return Array.isArray(codes)&&codes.length===PIANO_NOTES.length&&
    codes.every(canBind)&&new Set(codes).size===codes.length;
}
export function readBindings(storage=globalThis.localStorage){
  try{const saved=JSON.parse(storage.getItem(STORE)||"null");if(validBindings(saved?.codes))return saved.codes.slice();}catch{}
  return DEFAULT_BINDINGS.slice();
}
export function writeBindings(codes,storage=globalThis.localStorage){
  if(!validBindings(codes))throw Error("Invalid piano bindings");
  try{storage.setItem(STORE,JSON.stringify({codes}));}catch{}
}
export function pitchAt(index,whole=0,right=0){
  const note=PIANO_NOTES[index];if(!note)return null;
  return note.pitch+12*(whole+(note.right?right:0));
}
export function canShift(whole,right,delta,rightOnly=false){
  const nextWhole=whole+(rightOnly?0:delta);
  const nextRight=right+(rightOnly?delta:0);
  return PIANO_NOTES.every((note,index)=>{
    const pitch=pitchAt(index,nextWhole,nextRight);
    return pitch>=PIANO_LOW&&pitch<=PIANO_HIGH;
  });
}

const svgNS="http://www.w3.org/2000/svg";
function svgNode(name,attrs={},value=""){
  const node=document.createElementNS(svgNS,name);
  for(const [key,val] of Object.entries(attrs))node.setAttribute(key,String(val));
  if(value)node.textContent=value;
  return node;
}
export function makeKeyboardDiagram(codes){
  const svg=svgNode("svg",{viewBox:"0 0 364 128",role:"img","aria-label":"Piano layout: Z through slash are white keys, the keys above are sharps"});
  let whites=0;const positions=new Map();
  for(let i=0;i<PIANO_NOTES.length;i++){
    const {pitch}=PIANO_NOTES[i];
    if(!WHITE.has(pitch%12))continue;
    const x=9+whites*34;whites++;
    positions.set(i,x);
    svg.append(svgNode("rect",{x,y:23,width:33,height:88,rx:2,fill:"#ced3d5",stroke:"#484c50"}));
    svg.append(svgNode("text",{x:x+16.5,y:76,"text-anchor":"middle",fill:"#151719","font-size":15,"font-weight":600},keyName(codes[i])));
    svg.append(svgNode("text",{x:x+16.5,y:100,"text-anchor":"middle",fill:"#4b5053","font-size":10},pitchName(pitch)));
  }
  for(let i=0;i<PIANO_NOTES.length;i++){
    const {pitch}=PIANO_NOTES[i];
    if(WHITE.has(pitch%12))continue;
    let preceding=i-1;
    while(preceding>=0&&!positions.has(preceding))preceding--;
    const x=(positions.get(preceding)??9)+22;
    svg.append(svgNode("rect",{x,y:7,width:22,height:51,rx:2,fill:"#1b2023",stroke:"#71797c"}));
    svg.append(svgNode("text",{x:x+11,y:35,"text-anchor":"middle",fill:"#f4f5f5","font-size":12,"font-weight":600},keyName(codes[i])));
  }
  svg.append(svgNode("text",{x:89,y:122,"text-anchor":"middle",fill:"currentColor","font-size":10},"left hand"));
  svg.append(svgNode("text",{x:276,y:122,"text-anchor":"middle",fill:"currentColor","font-size":10},"right hand"));
  return svg;
}

// One controller owns input capture, held-note release, feedback, and settings.
// The studio supplies its current instrument and the audio note-on primitive.
export function installKeyboardPiano({toggle,toolbar,scroll,playNote,getInstrument,getBeat}){
  let codes=readBindings(),active=false,whole=0,right=0,leftShift=false;
  const held=new Map(),performancePitch=new Map();
  const status=document.createElement("span");
  status.className="keyboard-piano-status";
  status.setAttribute("aria-live","polite");
  toggle.after(status);
  const guide=document.createElement("div");
  guide.className="keyboard-piano-guide";
  guide.id="keyboard-piano-guide";
  guide.setAttribute("role","group");
  guide.setAttribute("aria-label","Keyboard piano key guide");
  const diagram=document.createElement("div");
  diagram.className="keyboard-piano-diagram";
  const help=document.createElement("p");
  help.textContent="numpad + / −  octave     left shift + numpad  right hand";
  const configure=document.createElement("button");
  configure.type="button";configure.textContent="change keys";configure.className="keyboard-piano-configure";
  guide.append(diagram,help,configure);
  toolbar.append(guide);
  toggle.setAttribute("aria-controls",guide.id);

  const dialog=document.createElement("dialog");
  dialog.className="keyboard-piano-dialog";
  dialog.setAttribute("aria-label","Keyboard piano bindings");
  const title=document.createElement("h2");title.textContent="keyboard piano · keys";
  const hint=document.createElement("p");hint.textContent="select a note, then press a key to bind it";
  const feedback=document.createElement("p");feedback.className="keyboard-piano-feedback";feedback.setAttribute("aria-live","polite");
  const fields=document.createElement("div");fields.className="keyboard-piano-bindings";
  const actions=document.createElement("div");actions.className="keyboard-piano-dialog-actions";
  const reset=document.createElement("button");reset.type="button";reset.textContent="restore defaults";
  const done=document.createElement("button");done.type="button";done.textContent="done";
  actions.append(reset,done);dialog.append(title,hint,feedback,fields,actions);
  document.body.append(dialog);
  let listening=-1;
  const noteButtons=[];
  for(let i=0;i<PIANO_NOTES.length;i++){
    const row=document.createElement("div");row.className="keyboard-piano-binding";
    const name=document.createElement("span");name.textContent=pitchName(PIANO_NOTES[i].pitch);
    const button=document.createElement("button");button.type="button";
    button.addEventListener("click",()=>{listening=i;feedback.textContent="press a key for "+pitchName(PIANO_NOTES[i].pitch);renderBindings();});
    row.append(name,button);fields.append(row);noteButtons.push(button);
  }
  const renderBindings=()=>noteButtons.forEach((button,i)=>{
    button.textContent=listening===i?"press a key…":keyName(codes[i]);
    button.setAttribute("aria-label","Bind "+pitchName(PIANO_NOTES[i].pitch)+": "+button.textContent);
  });
  const renderGuide=()=>{diagram.replaceChildren(makeKeyboardDiagram(codes));renderBindings();};
  renderGuide();
  const updateStatus=()=>{
    status.textContent=active?"L "+pitchName(pitchAt(0,whole,right))+" · R "+pitchName(pitchAt(9,whole,right)):"";
    toggle.setAttribute("aria-pressed",String(active));
    toggle.setAttribute("aria-label",active?"exit keyboard piano mode":"play with QWERTY keyboard");
    toggle.title=active?"exit keyboard piano mode (Esc)":"play with QWERTY keyboard";
    document.body.classList.toggle("keyboard-piano-active",active);
  };
  const refresh=()=>{
    document.querySelectorAll(".keyboard-held").forEach(node=>node.classList.remove("keyboard-held"));
    for(const pitch of performancePitch.values()){
      document.querySelectorAll('#piano [data-pitch="'+pitch+'"]').forEach(node=>node.classList.add("keyboard-held"));
    }
  };
  const release=code=>{
    const item=held.get(code);if(!item)return;
    held.delete(code);performancePitch.delete(code);
    item.released=true;item.stop?.();
    refresh();
  };
  const releaseAll=(clearShift=true)=>{for(const code of [...held.keys()])release(code);if(clearShift)leftShift=false;};
  const setActive=next=>{
    if(next===active)return;
    releaseAll();active=next;
    if(active){
      whole=0;right=0;
      const middle=Math.round((pitchAt(0)+pitchAt(PIANO_NOTES.length-1))/2);
      scroll.scrollTop=Math.max(0,(PIANO_HIGH-middle)*23-scroll.clientHeight/2);
      toggle.focus({preventScroll:true});
    }
    updateStatus();
  };
  const shift=(delta,rightOnly)=>{
    if(!canShift(whole,right,delta,rightOnly)){status.title="piano roll pitch limit reached";return;}
    releaseAll(false);
    if(rightOnly)right+=delta;else whole+=delta;
    updateStatus();
    const center=Math.round((pitchAt(0,whole,right)+pitchAt(PIANO_NOTES.length-1,whole,right))/2);
    scroll.scrollTop=Math.max(0,(PIANO_HIGH-center)*23-scroll.clientHeight/2);
  };
  toggle.addEventListener("click",()=>setActive(!active));
  configure.addEventListener("click",()=>{
    setActive(false);listening=-1;feedback.textContent="";
    renderBindings();dialog.showModal();
  });
  done.addEventListener("click",()=>dialog.close());
  reset.addEventListener("click",()=>{
    codes=DEFAULT_BINDINGS.slice();writeBindings(codes);listening=-1;feedback.textContent="default keys restored";renderGuide();
  });
  dialog.addEventListener("close",()=>{listening=-1;feedback.textContent="";renderBindings();toggle.focus({preventScroll:true});});
  dialog.addEventListener("keydown",event=>{
    if(listening<0)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(event.code==="Escape"){listening=-1;feedback.textContent="binding cancelled";renderBindings();return;}
    if(!canBind(event.code)){feedback.textContent="choose a letter, number, or punctuation key";return;}
    if(codes.some((code,i)=>i!==listening&&code===event.code)){
      feedback.textContent=keyName(event.code)+" is already assigned";return;
    }
    codes[listening]=event.code;writeBindings(codes);
    feedback.textContent=pitchName(PIANO_NOTES[listening].pitch)+" = "+keyName(event.code);
    listening=-1;renderGuide();
  },true);
  document.addEventListener("keydown",event=>{
    if(!active)return;
    if(event.code==="Escape"){
      event.preventDefault();event.stopImmediatePropagation();setActive(false);return;
    }
    if(event.code==="ShiftLeft"){leftShift=true;return;}
    if(event.code==="NumpadAdd"||event.code==="NumpadSubtract"){
      event.preventDefault();event.stopImmediatePropagation();
      if(!event.repeat)shift(event.code==="NumpadAdd"?1:-1,leftShift);
      return;
    }
    if(event.ctrlKey||event.altKey||event.metaKey){event.stopImmediatePropagation();return;}
    const index=codes.indexOf(event.code);
    if(index<0){if(event.code==="Space")event.stopImmediatePropagation();return;}
    event.preventDefault();event.stopImmediatePropagation();
    if(event.repeat||held.has(event.code))return;
    const pitch=pitchAt(index,whole,right);
    const item={released:false,stop:null};
    held.set(event.code,item);performancePitch.set(event.code,pitch);
    refresh();
    Promise.resolve().then(()=>playNote(getInstrument(),pitch,getBeat())).then(stop=>{
      item.stop=typeof stop==="function"?stop:()=>{};
      if(item.released)item.stop();
    }).catch(error=>{
      release(event.code);
      status.title=error?.message||String(error);
      console.warn("Keyboard piano:",error);
    });
  },true);
  document.addEventListener("keyup",event=>{
    if(!active)return;
    if(event.code==="ShiftLeft")leftShift=false;
    if(held.has(event.code)){event.preventDefault();event.stopImmediatePropagation();release(event.code);}
  },true);
  // Do not allow focus/click editing behind a live keyboard performance.
  for(const name of ["pointerdown","click"]){
    document.addEventListener(name,event=>{
      if(!active||event.target.closest?.(".piano-tools"))return;
      event.preventDefault();event.stopImmediatePropagation();
    },true);
  }
  window.addEventListener("blur",releaseAll);
  document.addEventListener("visibilitychange",()=>{if(document.hidden)releaseAll();});
  window.addEventListener("premidi-audio-mode",releaseAll);
  updateStatus();
  return {refresh,stop:()=>setActive(false),get active(){return active;}};
}
