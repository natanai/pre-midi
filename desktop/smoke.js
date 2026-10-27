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
  const identity=localStorage.getItem('premidi-smoke-storage-identity');
  if(info.smokeFresh){
   assert(!identity&&!localStorage.getItem('premidi-smoke-persistence'),'fresh profile is isolated from other editions');
  }
  if(info.smokeRestore){
   assert(identity===info.smokeStorageToken,`expected profile identity survived reopening (expected ${info.smokeStorageToken}, got ${identity})`);
   const marker=JSON.parse(localStorage.getItem('premidi-smoke-persistence')||'null');
   assert(!!marker,'preset/settings marker survived reopening');
   const prior=JSON.parse(await loadDraft());
   assert(prior.samples.some(a=>a.id==='desktop-storage-wav'),'WAV asset metadata survived reopening');
   const bytes=getAsset('desktop-storage-wav');
   assert(bytes?.length===marker.bytes&&bytes[0]===82&&bytes.at(-1)===marker.lastByte,'external WAV bytes survived reopening');
   assert(localStorage.getItem('premidi-update-channel')==='preview','update channel setting survived reopening');
  }
  if(info.portable){
   const normalized=path=>path.replaceAll('\\','/');
   const root=normalized(info.portableRoot);
   assert(normalized(info.dataPath)===root+'/data/webview','portable WebView profile is inside the executable folder');
   assert(normalized(info.projectsPath)===root+'/projects'&&normalized(info.exportsPath)===root+'/exports','portable save defaults are inside the executable folder');
  }
  const {create,id}=await load('schema.js'),{makePatch}=await load('synth.js');
  const {exportProject,importProject}=await load('packageIO.js');
  const {wav,play}=await load('audio.js');
  const sampler=await load('sampler.js');
  const bundled=await sampler.loadLibrarySample('piano-c3');
  const sampleBytes=getAsset(bundled.id);
  const decoder=new OfflineAudioContext(1,16,44100);
  const decoded=await decoder.decodeAudioData(sampleBytes.buffer.slice(sampleBytes.byteOffset,sampleBytes.byteOffset+sampleBytes.byteLength));
  assert(decoded.length>0&&decoded.numberOfChannels>0,'bundled Ogg recording decodes offline');
  const beat=create();beat.bars=1;const inst=beat.instruments[0];inst.timeline=[inst.chunks[0].id];inst.placements=[null];
  inst.sounds[0].patch=makePatch('touch-keys');inst.chunks[0].notes.push({id:id(),pitch:60,start:0,duration:4,velocity:.8});
  const exported=exportProject(beat),reopened=await importProject(new File([exported.blob],exported.name));
  assert(reopened.instruments[0].chunks[0].notes.length===1,'Beat export and reopen');
  const audio=await wav(beat),data=await audio.arrayBuffer();
  assert(new TextDecoder().decode(new Uint8Array(data,0,4))==='RIFF'&&data.byteLength>44,'WAV export');
  const pcm=new DataView(data);let peak=0;for(let i=44;i<data.byteLength;i+=2)peak=Math.max(peak,Math.abs(pcm.getInt16(i,true)));
  assert(peak>10,'Web Audio rendered nonzero PCM');
  const session=await play(()=>beat,{loop:()=>true});assert(session.backend==='native-cpp','desktop Play uses the native device host');
  const audioRequest=request=>invoke('native_audio',{request});
  let device;
  for(let attempt=0;attempt<100;attempt++){device=await audioRequest({action:'status'});if(device.callbacks>0&&device.peak>0)break;await pause(20);}
  assert(device.callbacks>0&&device.peak>0&&device.fault===0,'C++ synthesis produced nonzero PCM in miniaudio callbacks');
  await session.pause();const paused=await audioRequest({action:'status'});await pause(40);const still=await audioRequest({action:'status'});
  assert(paused.state===2&&still.positionSeconds===paused.positionSeconds,'native pause preserves the audio position');
  await session.resume();await session.seek(2);await pause(30);
  assert((await audioRequest({action:'status'})).state===1,'native resume and seek return to playback');
  const {audition}=await load('audio.js');await audition(inst,64,beat,{duration:.1});
  assert((await audioRequest({action:'status'})).state===1,'Hear sound does not stop native transport');
  await session.stop();assert((await audioRequest({action:'status'})).state===0,'native stop completes');
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
  const writtenToken=info.smokeWriteToken??info.smokeStorageToken;
  localStorage.setItem('premidi-smoke-storage-identity',writtenToken);
  localStorage.setItem('premidi-update-channel','preview');
  localStorage.setItem('premidi-audio-backend','native');
  const native=await invoke('native_fixture');assert(native.length===48000&&native.some(x=>Math.abs(x)>.01)&&native.every(Number.isFinite),'in-process C++ offline fixture');
  assert(!!navigator.mediaDevices?.getUserMedia,'microphone API exposed (hardware capture untested)');
  await invoke('smoke_result',{result:{passed:true,version:info.version,nativeAudio:device,storage:{portable:info.portable,root:info.portableRoot,webview:info.dataPath,identity:writtenToken},checks,limitations:['miniaudio null backend is software qualification, not physical audio hardware','no human listening or physical microphone test','not an installed upgrade test']}});
 }catch(error){await window.__TAURI__.core.invoke('smoke_result',{result:{passed:false,checks,error:String(error)+"\n"+(error.stack||"")}});}
})();
