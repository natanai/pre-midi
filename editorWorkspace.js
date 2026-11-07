// One desktop workspace for Beat-local and Song-time editing.
// Hosts supply musical controls and transactions; this module owns the chrome.
const EDITOR_WORKSPACE_CHROME=`
  <aside class="instrument-pane" aria-label="Instruments">
   <div class="heading"><h2>Instruments</h2></div>
   <button id="add-instrument" class="add-instrument-action" type="button">+ Add instrument</button>
   <div id="instrument-list" class="instrument-list" aria-label="Instruments"></div>
  </aside>
  <div class="mainwork">
   <section class="timeline-section" aria-label="Beat timeline">
    <div class="heading"><h2>Timeline</h2><span class="timeline-tick-label">BARS</span></div>
    <div class="scroll"><div id="arrangement"></div></div>
   </section>
   <section class="notes-section" aria-label="Chunk note editor">
    <div class="heading notes-heading">
     <div class="chunk-heading"><h2>notes</h2><button id="note-mode" class="note-mode-toggle" type="button" aria-label="edit note effects" title="edit note effects" aria-pressed="false" aria-controls="note-effects-section">✎</button><span id="editing-identity" class="editing-identity"></span></div>
     <div class="history-actions" role="group" aria-label="edit history and sound">
      <button id="undo" class="history-undo" type="button" aria-label="undo last change" title="undo last change (ctrl+z)">↶</button>
      <button id="redo" class="history-redo" type="button" aria-label="redo last change" title="redo last change (ctrl+shift+z)">↷</button>
      <button id="sound-toggle" class="sound-toggle" type="button" aria-label="show sound editor" title="show sound editor" aria-expanded="false" aria-controls="sound-section">♫</button>
     </div>
    </div>
    <div class="notes-toolbar">
     <div class="chunk-tools">
      <div class="chunk-fields">
       <label class="chunk-name-field">chunk <input id="chunk-name" aria-label="Chunk name" maxlength="60"></label>
       <div class="chunk-switcher">
        <button id="chunk" type="button" aria-label="choose chunk" aria-haspopup="true" aria-controls="chunk-menu" aria-expanded="false" title="choose chunk">▾</button>
        <div id="chunk-menu" class="chunk-menu" role="group" aria-label="chunks" hidden></div>
       </div>
      </div>
      <div class="chunk-actions" aria-label="Chunk actions">
       <button id="delete-chunk" type="button">delete</button>
      </div>
     </div>
     <div class="scale-controls" role="group" aria-label="Beat scale guide">
      <label>key <select id="scale-root" class="scale-root" aria-label="Scale root note"></select></label>
      <label>scale <select id="scale-mode" class="scale-mode" aria-label="Scale type"></select></label>
      <label class="scale-lock-control" title="only add notes from this scale"><input id="scale-lock" type="checkbox">limit notes</label>
     </div>
    </div>
    <div class="piano-tools">
     <button id="piano-keys" class="piano-keys-toggle" type="button" aria-label="show piano keys" aria-pressed="true" title="show note names">▥</button>
     <button id="qwerty-piano" class="piano-keys-toggle qwerty-piano-toggle" type="button" aria-label="play with QWERTY keyboard" aria-pressed="false" title="play with QWERTY keyboard">⌨</button>
    </div>
    <div class="piano-scroll"><div id="piano"></div></div>
   </section>
   <section id="sound-section" class="sound-section" aria-label="Instrument sound">
     <!-- Shared Sound Inspector chrome mounted by studio.js -->
    </section>
   <section id="note-effects-section" class="note-effects-section" aria-labelledby="note-effects-title" aria-hidden="true">
    <div class="heading note-effects-heading"><h2 id="note-effects-title">note effects</h2><button id="note-effects-done" type="button">done</button></div>
    <p id="note-effects-empty" class="note-effects-empty">select a note to edit</p>
    <div id="note-expression" class="note-expression" aria-label="Selected note pitch expression" hidden></div>
   </section>
  </div>
`;
export function mountEditorWorkspace(root,{idPrefix="",songTime=false}={}){
 if(!root)throw Error("Editor workspace requires a mount element.");
 root.classList.add("work");
 root.classList.toggle("song-time-editor",songTime);
 const template=document.createElement("template");
 template.innerHTML=EDITOR_WORKSPACE_CHROME;
 const fragment=template.content.cloneNode(true),nodes=new Map();
 for(const node of fragment.querySelectorAll("[id]")){
  const key=node.id;
  if(nodes.has(key))throw Error("Duplicate editor control: "+key);
  nodes.set(key,node);node.id=idPrefix+key;
 }
 for(const node of fragment.querySelectorAll("[for],[aria-controls],[aria-labelledby],[aria-describedby]")){
  for(const attr of ["for","aria-controls","aria-labelledby","aria-describedby"]){
   const value=node.getAttribute(attr);
   if(value)node.setAttribute(attr,value.split(/\s+/).map(key=>
    nodes.has(key)?idPrefix+key:key).join(" "));
  }
 }
 if(songTime){
  fragment.querySelector(".timeline-section").remove();
  fragment.querySelector(".chunk-tools").remove();
  fragment.querySelector(".notes-section").setAttribute("aria-label","Song-time note editor");
  fragment.querySelector(".scale-controls").setAttribute("aria-label","Song scale guide");
 }
 root.replaceChildren(fragment);
 return {root,get:key=>nodes.get(key)??null};
}

export function syncEditorInspector(editor,{open,noteEffects=false,wide=true}={}){
 const work=editor.root;
 work.classList.toggle("inspector-closed",!open);
 work.classList.toggle("inspector-expanded",!!open);
 work.classList.toggle("editing-note-effects",!!noteEffects);
 work.querySelector(".notes-section").classList.toggle("editing-note-effects",!!noteEffects);
 const sound=editor.get("sound-section"),effects=editor.get("note-effects-section");
 const notes=work.querySelector(".notes-section"),main=work.querySelector(".mainwork");
 if(wide){if(effects.parentElement!==main)main.append(effects);}
 else if(effects.parentElement!==notes)notes.insertBefore(effects,notes.querySelector(".piano-scroll"));
 const opened=!!open&&!noteEffects;
 sound.setAttribute("aria-hidden",String(!opened));
 effects.setAttribute("aria-hidden",String(!noteEffects));
 const toggle=editor.get("sound-toggle");
 toggle.setAttribute("aria-expanded",String(opened));
 toggle.textContent="♫";
 toggle.setAttribute("aria-label",opened?"close sound editor":"open sound editor");
 toggle.title=opened?"close sound editor":"open sound editor";
}

// Native details menus retain keyboard semantics; one positioned popup escapes
// the roll's clipped scroll viewport, including short desktop windows.
let menuDismissalInstalled=false;
export function bindEditorMenu(menu){
 if(!menuDismissalInstalled){
  menuDismissalInstalled=true;
  document.addEventListener("pointerdown",event=>{
   for(const open of document.querySelectorAll(".editor-tool-menu[open]"))
    if(!open.contains(event.target))open.open=false;
  });
  document.addEventListener("keydown",event=>{
   if(event.key!=="Escape")return;
   const open=document.querySelector(".editor-tool-menu[open]");
   if(open){event.preventDefault();open.open=false;open.querySelector("summary").focus();}
  });
 }
 menu.addEventListener("toggle",()=>{
  if(!menu.open||!menu.isConnected)return;
  for(const other of document.querySelectorAll(".editor-tool-menu[open]"))
   if(other!==menu)other.open=false;
  const content=menu.querySelector(":scope>div"),anchor=menu.querySelector("summary").getBoundingClientRect();
  content.style.maxHeight=Math.max(120,window.innerHeight-24)+"px";
  const box=content.getBoundingClientRect();
  content.style.left=Math.max(12,Math.min(anchor.left,window.innerWidth-box.width-12))+"px";
  content.style.top=Math.max(12,Math.min(anchor.bottom+4,window.innerHeight-box.height-12))+"px";
 });
 return menu;
}
