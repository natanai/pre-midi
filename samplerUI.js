// Sampler controls use the same canonical patch mutation route as the synth.
// The instrument owns its notes and sound independently of sample library UI.
export function renderSamplerEditor(root,patch,onChange,metadata,openUpload){
 root.replaceChildren();
 const header=document.createElement("div");header.className="sampler-description";
 header.textContent=(metadata||"Embedded audio")+" · "+patch.zones.length+" sample zone"+(patch.zones.length===1?"":"s");
 root.append(header);
 const fields=document.createElement("div");fields.className="sampler-controls";
 const config=[
  ["gain","Level",0,2,.01,v=>Math.round(v*100)+"%"],
  ["attack","Attack",0,2,.005,v=>Math.round(v*1000)+" ms"],
  ["release","Release",.01,3,.01,v=>Math.round(v*1000)+" ms"],
  ["transpose","Transpose",-24,24,1,v=>(v>0?"+":"")+v+" st"],
  ["pan","Pan",-1,1,.01,v=>v===0?"C":v<0?"L "+Math.round(-v*100):"R "+Math.round(v*100)]
 ];
 for(const [key,title,min,max,step,format] of config){
  const label=document.createElement("label");label.className="synth-field";
  const heading=document.createElement("span");heading.textContent=title;
  const line=document.createElement("div");line.className="synth-range";
  const input=document.createElement("input");
  input.type="range";input.min=min;input.max=max;input.step=step;input.value=patch[key];
  input.setAttribute("aria-label",title+" sample");
  const output=document.createElement("output");output.textContent=format(patch[key]);
  input.addEventListener("input",()=>output.textContent=format(Number(input.value)));
  input.addEventListener("change",()=>onChange([key],Number(input.value)));
  line.append(input,output);label.append(heading,line);fields.append(label);
 }
 const follow=document.createElement("label");follow.className="sample-pitch-setting";
 const box=document.createElement("input");box.type="checkbox";box.checked=patch.followPitch;
 box.addEventListener("change",()=>onChange(["followPitch"],box.checked));
 follow.append(box,document.createTextNode("Follow note pitch"));
 fields.append(follow);
 root.append(fields);
 const action=document.createElement("button");action.type="button";action.className="sample-replace-action";
 action.textContent="Replace with my audio…";action.addEventListener("click",openUpload);
 root.append(action);
}
