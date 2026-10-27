(async()=>{
 const checks=[],assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 try{
  for(let i=0;i<200&&!window.premidiFlush;i++)await pause(50);
  assert(!!window.premidiFlush,'studio initialized in platform WebView');
  const invoke=window.__TAURI__.core.invoke,info=await invoke('desktop_info');
  for(let i=0;i<100&&!document.getElementById('desktop-version')?.textContent;i++)await pause(50);
  assert(document.getElementById('desktop-version').textContent==='pre-midi '+info.version,'packaged version displayed');
  assert(!window.require&&!window.process,'no Node integration');
  const load=name=>import(new URL('./'+name,location.href).href);
  const {saveDraft,loadDraft}=await load('storage.js');
  const {getAsset}=await load('assetRegistry.js');
  if(info.smokeRestore){
   const marker=JSON.parse(localStorage.getItem('premidi-smoke-persistence')||'null');
   assert(!!marker,'preset/settings marker survived reopening');
   const prior=JSON.parse(await loadDraft());
   assert(prior.samples.some(a=>a.id==='desktop-storage-wav'),'WAV asset metadata survived reopening');
   const bytes=getAsset('desktop-storage-wav');
   assert(bytes?.length===marker.bytes&&bytes[0]===82&&bytes.at(-1)===marker.lastByte,'external WAV bytes survived reopening');
   assert(localStorage.getItem('premidi-update-channel')==='preview','update channel setting survived reopening');
  }
  const {create,id}=await load('schema.js'),{makePatch}=await load('synth.js');
  const {exportProject,importProject}=await load('packageIO.js');
  const {wav,play}=await load('audio.js');
  const beat=create();beat.bars=1;const inst=beat.instruments[0];inst.timeline=[inst.chunks[0].id];inst.placements=[null];
  inst.sounds[0].patch=makePatch('glass-keys');inst.chunks[0].notes.push({id:id(),pitch:60,start:0,duration:4,velocity:.8});
  const exported=exportProject(beat),reopened=await importProject(new File([exported.blob],exported.name));
  assert(reopened.instruments[0].chunks[0].notes.length===1,'Beat export and reopen');
  const audio=await wav(beat),data=await audio.arrayBuffer();
  assert(new TextDecoder().decode(new Uint8Array(data,0,4))==='RIFF'&&data.byteLength>44,'WAV export');
  const pcm=new DataView(data);let peak=0;for(let i=44;i<data.byteLength;i+=2)peak=Math.max(peak,Math.abs(pcm.getInt16(i,true)));
  assert(peak>10,'Web Audio rendered nonzero PCM');
  const session=await play(()=>beat,{loop:()=>false});assert(!!session,'studio playback graph starts');session.stop();
  const {createSong,addBeat}=await load('songModel.js'),{exportSongProject,importSongProject}=await load('songIO.js');
  const song=createSong(beat);const output=exportSongProject(song);const restored=await importSongProject(new File([output.blob],output.name));
  assert(restored.kind==='song','Song export and reopen');
  await saveDraft(beat);
  assert(JSON.parse(await loadDraft()).instruments[0].chunks[0].notes.length===1,'IndexedDB draft transaction');
  localStorage.setItem('premidi-smoke-preset',JSON.stringify(inst.sounds[0].patch));
  assert(JSON.parse(localStorage.getItem('premidi-smoke-preset')).type==='synth','local preset storage');
  const {encodeMonoWav}=await load('recording.js'),{makeSampleAsset}=await load('sampler.js');
  const bytes=encodeMonoWav(new Float32Array(480).fill(.2));
  const asset=makeSampleAsset('desktop-storage-wav','Storage test','audio/wav',bytes,'desktop storage qualification fixture');
  beat.samples.push(asset);await saveDraft(beat);
  localStorage.setItem('premidi-smoke-persistence',JSON.stringify({bytes:bytes.length,lastByte:bytes.at(-1)}));
  localStorage.setItem('premidi-update-channel','preview');
  const native=await invoke('native_fixture');assert(native.length===48000&&native.some(x=>Math.abs(x)>.01)&&native.every(Number.isFinite),'in-process C++ offline fixture');
  assert(!!navigator.mediaDevices?.getUserMedia,'microphone API exposed (hardware capture untested)');
  await invoke('smoke_result',{result:{passed:true,version:info.version,checks,limitations:['no human listening or physical microphone test','not an installed upgrade test']}});
 }catch(error){await window.__TAURI__.core.invoke('smoke_result',{result:{passed:false,checks,error:String(error)+"\n"+(error.stack||"")}});}
})();
