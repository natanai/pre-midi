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
  // Check graph geometry in the actual packaged WebView. DOM emulators
  // cannot catch SVG percentage-transform offsets or real control hit areas.
  const {renderStereoImage}=await load('stereoProcessingUI.js');
  const graphHost=document.createElement('div');graphHost.style.cssText='position:fixed;left:0;top:0;width:320px;z-index:99999';
  document.body.append(graphHost);
  try{
   let graphEdit;
   const graph=renderStereoImage({type:'sample',stereoWidth:1,msBalance:0},
    (paths,values)=>{graphEdit={paths,values};},()=>{},'portable-geometry');
   graphHost.append(graph);graph.querySelector('details').open=true;
   const handle=graph.querySelector('.visual-graph-point'),svg=graph.querySelector('svg');
   assert(handle.tagName==='BUTTON'&&handle.getAttribute('aria-label')==='stereo image two-axis control',
    'shared graphs expose a native accessible control outside the SVG');
   for(const width of [320,640]){
    graphHost.style.width=width+'px';
    const bounds=graph.querySelector('.visual-panel-area').getBoundingClientRect(),hit=handle.getBoundingClientRect();
    assert(bounds.width>0&&bounds.height>0&&hit.width>=28&&hit.height>=28&&
     Math.abs(hit.left+hit.width/2-bounds.left-bounds.width/2)<1.1&&
     Math.abs(hit.top+hit.height/2-bounds.top-bounds.height/2)<1.1,
     'shared graph handle matches its reference coordinates at '+width+' px');
    assert(Math.abs(svg.getBoundingClientRect().width-bounds.width)<1.1,
     'shared graph reference fills its control viewport at '+width+' px');
   }
   handle.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
   assert(graphEdit?.paths[0].join('.')==='stereoWidth'&&Math.abs(graphEdit.values[0]-1.01)<1e-9,
    'shared graph keyboard edits use the canonical parameter change');
  }finally{graphHost.remove();}
  const {create,id,upgradeBeatFeatures}=await load('schema.js'),{makePatch}=await load('synth.js');
  const {exportProject,importProject}=await load('packageIO.js');
  const {wav,play}=await load('audio.js');
  const sampler=await load('sampler.js');
  const bundled=await sampler.loadLibrarySample('piano-c3');
  const sampleBytes=getAsset(bundled.id);
  const decoder=new OfflineAudioContext(1,16,44100);
  const decoded=await decoder.decodeAudioData(sampleBytes.buffer.slice(sampleBytes.byteOffset,sampleBytes.byteOffset+sampleBytes.byteLength));
  assert(decoded.length>0&&decoded.numberOfChannels>0,'bundled Ogg recording decodes offline');
  localStorage.setItem('premidi-audio-backend','native');
  const WebOfflineAudioContext=window.OfflineAudioContext;
  window.OfflineAudioContext=class{constructor(){throw Error('Native operation attempted Web Audio rendering');}};
  const WebMediaRecorder=window.MediaRecorder,webGetUserMedia=navigator.mediaDevices.getUserMedia,webMediaPlay=HTMLMediaElement.prototype.play;
  window.MediaRecorder=class{constructor(){throw Error('Native operation attempted browser recording');}};
  navigator.mediaDevices.getUserMedia=()=>{throw Error('Native operation attempted browser microphone capture');};
  HTMLMediaElement.prototype.play=()=>{throw Error('Native operation attempted HTML media playback');};
  const beat=create();beat.bars=1;const inst=beat.instruments[0];inst.timeline=[inst.chunks[0].id];inst.placements=[null];
  inst.sounds[0].patch=makePatch('touch-keys');inst.chunks[0].notes.push({id:id(),pitch:60,start:0,duration:4,velocity:.8});
  upgradeBeatFeatures(beat);
  const exported=exportProject(beat),reopened=await importProject(new File([exported.blob],exported.name));
  assert(reopened.instruments[0].chunks[0].notes.length===1,'Beat export and reopen');
  const audio=await wav(beat),data=await audio.arrayBuffer();
  assert(new TextDecoder().decode(new Uint8Array(data,0,4))==='RIFF'&&data.byteLength>44,'WAV export');
  const pcm=new DataView(data);let peak=0;for(let i=44;i<data.byteLength;i+=2)peak=Math.max(peak,Math.abs(pcm.getInt16(i,true)));
  assert(peak>10,'native C++ WAV export rendered nonzero PCM without Web Audio');
  const session=await play(()=>beat,{loop:()=>true});assert(session.backend==='native-cpp','desktop Play uses the native device host');
  const audioRequest=request=>invoke('native_audio',{request});
  let device;
  for(let attempt=0;attempt<100;attempt++){device=await audioRequest({action:'status'});if(device.callbacks>0&&device.peak>0)break;await pause(20);}
  assert(device.callbacks>0&&device.peak>0&&device.fault===0,'C++ synthesis produced nonzero PCM in miniaudio callbacks');
  await session.pause();let paused;
  // Pause acknowledges intent without waiting behind control work. Observe
  // its callback fade before measuring the held clock, with a finite deadline.
  for(let attempt=0;attempt<100;attempt++){paused=await audioRequest({action:'status'});if(paused.state===2)break;await pause(10);}
  await pause(40);const still=await audioRequest({action:'status'});
  assert(paused.state===2&&still.positionSeconds===paused.positionSeconds,'native pause preserves the audio position');
  inst.sounds[0].patch=makePatch('sine-keys');await session.refresh();
  assert((await audioRequest({action:'status'})).state===2,'native paused edit retains the transport state');
  await session.resume();await session.seek(2);await pause(30);
  assert((await audioRequest({action:'status'})).state===1,'native resume and seek return to playback');
  beat.bpm=180;await session.refresh();
  assert((await audioRequest({action:'status'})).state===1,'live native tempo and patch edits preserve playback');
  const {audition}=await load('audio.js');await audition(inst,64,beat,{duration:.1});
  assert((await audioRequest({action:'status'})).state===1,'Hear sound does not stop native transport');
  await session.stop();assert((await audioRequest({action:'status'})).state===0,'native stop completes');
  const {prepareSongTake}=await load('songRecorder.js'),take=await prepareSongTake();
  const recordedSession=await play(()=>beat,{recording:take.captureOwner,countIn:1,onStart:metadata=>take.begin(metadata)});
  for(let i=0;i<300;i++){if((await audioRequest({action:'status'})).capture.phase===3)break;await pause(20);}
  const recorded=await take.finish();await recordedSession.stop();
  assert(recorded.mime==='audio/wav'&&recorded.bytes.length>44,'native microphone writes lossless WAV without MediaRecorder');
  const sourceAsset=await audioRequest({action:'asset',data:Array.from(recorded.bytes),rate:44100}),sourceDuration=Math.min(.2,sourceAsset.frames/sourceAsset.rate);
  const processedAsset=await audioRequest({action:'source',asset:sourceAsset.id,params:{start:0,duration:sourceDuration,time:1.5,semitones:7,formant:-2,preserve:1,reverse:1}});
  assert(processedAsset.id!==sourceAsset.id&&processedAsset.frames===Math.round(Math.round(sourceDuration*44100)*1.5),'native source pitch/time/formants/reverse prepare owned PCM without Web Audio');

  // Real WebView + native acceptance for the shared sampler source editor.
  // Browser rendering/capture remain disabled throughout this block.
  const {encodePcmWav}=await load('recording.js');
  const loopPcm=Float32Array.from({length:4410},(_,i)=>.2*Math.sin(2*Math.PI*233*i/44100));
  const loopAsset=sampler.makeSampleAsset('portable-loop','loop fixture','audio/wav',encodePcmWav([loopPcm]),'portable acceptance');
  const loopBeat=create(),loopInst=loopBeat.instruments[0];loopBeat.bars=1;loopBeat.samples=[loopAsset];loopInst.timeline=[loopInst.chunks[0].id];loopInst.placements=[null];
  loopInst.chunks[0].notes=[{id:id(),pitch:60,start:0,duration:16,velocity:.8}];
  loopInst.sounds[0].patch={type:'sample',presetId:'custom',zones:[{assetId:loopAsset.id,root:60,keyLow:48,keyHigh:72,velocityLow:.1,velocityHigh:1,loop:{start:.02,end:.08,crossfade:.01}}],followPitch:false,oneShot:false,transpose:0,gain:.8,attack:0,release:.1,pan:0};
  upgradeBeatFeatures(loopBeat);
  const {renderSampleSource}=await load('sampleSourceUI.js'),{assignSoundEdit}=await load('soundEditPath.js');
  const sourceRoot=document.createElement('section');sourceRoot.id='portable-source-editor';document.body.append(sourceRoot);
  try{
   const source=renderSampleSource(loopInst.sounds[0].patch,loopBeat,(path,value)=>assignSoundEdit(loopInst.sounds[0].patch,path,value),'portable-loop-sound');sourceRoot.append(source);source.open=true;
   const mode=source.querySelector('[aria-label="sample region editing"]');mode.value='loop';mode.dispatchEvent(new Event('change'));
   for(let i=0;i<100&&!source.querySelector('[aria-label="loop crossfade"]');i++)await pause(10);
   const fade=source.querySelector('[aria-label="loop crossfade"]');assert(!!fade,'portable shared sampler waveform decodes with the native host');
   fade.focus();fade.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
   assert(Math.abs(loopInst.sounds[0].patch.zones[0].loop.crossfade-.011)<1e-9,'portable waveform crossfade keyboard edit retains source-relative loop data');
  }finally{sourceRoot.remove();}
  const loopExport=exportProject(loopBeat),loopReopen=await importProject(new File([loopExport.blob],loopExport.name));
  assert(loopReopen.instruments[0].sounds[0].patch.zones[0].loop.crossfade===.011,'portable project round trip retains sampler loops and key/velocity ranges');
  const loopWav=new DataView(await (await wav(loopReopen)).arrayBuffer());let heldPeak=0;
  for(let i=44+Math.floor(.8*44100)*4;i<Math.min(loopWav.byteLength,44+Math.floor(1.2*44100)*4);i+=2)heldPeak=Math.max(heldPeak,Math.abs(loopWav.getInt16(i,true)));
  assert(heldPeak>10,'native WAV sustain loop remains audible beyond the original recording');
  const loopSession=await play(()=>loopReopen,{loop:()=>true});await loopSession.pause();
  for(let i=0;i<100&&(await audioRequest({action:'status'})).state!==2;i++)await pause(10);
  assert((await audioRequest({action:'status'})).state===2,'native sampler sustain loop acknowledges pause');
  await loopSession.resume();await loopSession.stop();assert((await audioRequest({action:'status'})).state===0,'native sampler sustain loop resumes and stops through the owned transport');
  loopReopen.instruments[0].sounds[0].patch.zones[0].keyLow=61;
  const unmapped=new DataView(await (await wav(loopReopen)).arrayBuffer());let silent=true;for(let i=44;i<unmapped.byteLength;i+=2)if(unmapped.getInt16(i,true)!==0){silent=false;break;}
  assert(silent,'unmapped key/velocity regions render silence without Web Audio fallback');

  assert(Math.abs(recorded.durationSeconds-60/beat.bpm*4)<1/44100,'native take starts exactly after count-in and retains the arrangement duration');
  const {makeRecordingAsset}=await load('recordingAssets.js'),{addVocalTake,validateSong}=await load('songModel.js');
  const recordedSong=(await load('songModel.js')).createSong(beat);
  const vocalAsset=makeRecordingAsset('native-smoke-vocal','native take',recorded.mime,recorded.bytes,recorded);addVocalTake(recordedSong,vocalAsset);
  assert(recordedSong.version===14&&!validateSong(recordedSong).length,'lossless vocal take uses explicit Song v14');
  const songFiles=await load('songIO.js'),recordedExport=songFiles.exportSongProject(recordedSong);
  const reopenedTake=await songFiles.importSongProject(new File([recordedExport.blob],recordedExport.name));
  const vocalSession=await play(()=>reopenedTake);await vocalSession.seek(2);await vocalSession.stop();
  const vocalWav=await wav(reopenedTake);assert(vocalWav.size>44,'native vocal survives portable ZIP, seek and native WAV export');
  // A short native WAV vocal can be a Beat sound without another audio asset:
  // check the physical native playback/export path, plus reopen with one file.
  const {linkedVocalSample}=await load('vocalBeatReuse.js');
  const entry=reopenedTake.tracks.find(track=>track.kind==='vocal').clips[0];
  entry.trimStartSeconds=.04;
  const shared=linkedVocalSample(reopenedTake.recordings[0],entry,getAsset(vocalAsset.id));
  assert(shared?.asset.id===vocalAsset.id&&shared.zone.startSeconds===.04&&shared.zone.durationSeconds>0,
   'native WAV vocal reuses a trimmed source-time region without new bytes');
  const linkedBeat=reopenedTake.beats[0];
  linkedBeat.samples.push(shared.asset);
  linkedBeat.instruments[0].sounds[0].patch={
   type:'sample',presetId:'custom',zones:[shared.zone],followPitch:false,oneShot:true,
   transpose:0,gain:.9,attack:.005,release:.17,pan:0
  };
  upgradeBeatFeatures(linkedBeat);
  (await load('songModel.js')).upgradeSongFeatures(reopenedTake);
  assert(linkedBeat.version===23&&reopenedTake.version===24&&!validateSong(reopenedTake).length,
   'source excerpt requires explicit Beat v23 and Song v24');
  const linkedExport=songFiles.exportSongProject(reopenedTake);
  const linkedReopen=await songFiles.importSongProject(new File([linkedExport.blob],linkedExport.name));
  assert(linkedReopen.recordings.length===1&&linkedReopen.beats[0].samples.length===1&&
   linkedReopen.beats[0].samples[0].id===linkedReopen.recordings[0].id,
   'portable Song restores one canonical vocal/sample WAV reference');
  assert((await wav(linkedReopen)).size>44,
   'native C++ WAV export renders the linked vocal sample alongside the vocal Clip');
  document.getElementById('record-sound').click();document.getElementById('mic-length').value='0.75';document.getElementById('mic-capture').click();
  for(let i=0;i<250&&document.getElementById('mic-use').hidden;i++)await pause(40);
  assert(!document.getElementById('mic-use').hidden,'native short microphone recorder completes');
  assert(!document.getElementById('mic-playback').src,'native short recording avoids HTML media playback');
  const rawPlayer=document.querySelector('#mic-preview .native-audio-player button'),oldPreview=(await audioRequest({action:'status'})).previewOwner;rawPlayer.click();
  for(let i=0;i<100;i++){const status=await audioRequest({action:'status'});if(status.previewOwner>oldPreview&&status.previewState===1)break;await pause(20);}
  assert((await audioRequest({action:'status'})).previewOwner>oldPreview,'raw recording preview uses the native preview lane');
  rawPlayer.click();await pause(30);assert((await audioRequest({action:'status'})).previewState===2,'raw native preview pauses');
  document.getElementById('mic-close').click();
  window.OfflineAudioContext=WebOfflineAudioContext;window.MediaRecorder=WebMediaRecorder;navigator.mediaDevices.getUserMedia=webGetUserMedia;HTMLMediaElement.prototype.play=webMediaPlay;
  const {createSong,addBeat}=await load('songModel.js'),{exportSongProject,importSongProject}=await load('songIO.js');
  const song=createSong(beat);const output=exportSongProject(song);const restored=await importSongProject(new File([output.blob],output.name));
  assert(restored.kind==='song','Song export and reopen');
  // Native portable acceptance for reusable multi-bar notes, captured cutoff
  // movement and a Beat-owned freeform lane, without any Web Audio fallback.
  const schema=await load('schema.js'),songs=await load('songModel.js');
  const freeforms=await load('freeformModel.js');
  const audioHost=await load('src/hosts/native/session.js');
  const {renderEvents}=await load('audio.js');
  const advanced=schema.create(),advancedInst=advanced.instruments[0];
  advanced.bars=2;advancedInst.timeline=[advancedInst.chunks[0].id,null];
  advancedInst.placements=[null,null];
  advancedInst.chunks[0].notes=[{id:id(),pitch:63,start:14,duration:24,velocity:.82,
   automation:{version:1,step:14,limitStep:32,
    block:[{id:'cutoff',version:1,target:'filter.cutoff',unit:'hz',interpolation:'exponential',
     points:[{id:id(),step:0,value:430},{id:id(),step:32,value:4300}]}]}}];
  schema.upgradeBeatFeatures(advanced);
  assert(advanced.version===27&&!schema.validate(advanced).length,
   'portable Beat v27 retains a continuous multi-bar note and captured cutoff curve');
  const advancedSong=songs.createSong(advanced),advancedTrack=advancedSong.tracks[0];
  const freeform=freeforms.ensureFreeform(advancedTrack);
  const freeInst=freeforms.addFreeformInstrument(freeform);
  freeforms.addFreeformNote(freeInst,{pitch:68,start:5,duration:22,velocity:.74});
  songs.upgradeSongFeatures(advancedSong);
  assert(advancedSong.version===28&&!songs.validateSong(advancedSong).length,
   'portable Song v28 owns independent freeform and reusable v27 Beats');
  // Unpacking must assign fresh note IDs and passage ownership. Those fields
  // are not audible; retain every actual voice, envelope, patch and automation
  // field so this remains a strict native audio-plan equivalence test.
  const audiblePlan=plan=>{
   const value=structuredClone(plan);
   if(value.expression)for(const key of ['id','passageId','strumGroup','strumKey'])
    delete value.expression[key];
   return value;
  };
  const signature=doc=>JSON.stringify(audioHost.nativePlans(renderEvents(doc)).map(audiblePlan));
  const originalPlans=signature(advancedSong);
  const reusable=freeforms.createBeatFromFreeformSelection(advancedSong,advancedTrack.id,0,32);
  assert(reusable.version===25&&!schema.validate(reusable).length,
   'freeform multi-bar passage becomes a standalone v25 Beat without retriggers');
  songs.addBeat(advancedSong,reusable);
  assert(signature(advancedSong)===originalPlans,
   'creating a reusable Beat never doubles Song playback');
  const advancedExport=songFiles.exportSongProject(advancedSong);
  const advancedReopen=await songFiles.importSongProject(new File([advancedExport.blob],advancedExport.name));
  assert(!songs.validateSong(advancedReopen).length&&signature(advancedReopen)===originalPlans,
   'portable Song ZIP retains v27 automation and freeform onset instructions exactly');
  const browserOffline=window.OfflineAudioContext;
  window.OfflineAudioContext=class{constructor(){throw Error('Song native render attempted Web Audio');}};
  try{
   const renderedSong=await wav(advancedReopen);
   assert(renderedSong.size>44,'native C++ WAV renders freeform, v27 automation and long-note tails');
  }finally{window.OfflineAudioContext=browserOffline;}
  const advancedSession=await play(()=>advancedReopen,{loop:()=>false});
  assert(advancedSession.backend==='native-cpp','portable Song performs native freeform playback');
  await advancedSession.seek(10);
  assert((await audioRequest({action:'status'})).fault===0,
   'native Song seek through freeform and sustained Beat does not exhaust callback capacity');
  await advancedSession.stop();
  const priorUnpack=signature(advancedReopen);
  freeforms.unpackBeatClip(advancedReopen,advancedReopen.tracks.find(track=>track.kind==='beat').clips[0].id);
  assert(!songs.validateSong(advancedReopen).length&&signature(advancedReopen)===priorUnpack,
   'portable v27 Beat unpacks without changing native note and cutoff plans');
  // Qualify complete freeform Instrument editing against packaged Windows
  // native synthesis, not only browser DOM and source-level unit tests.
  const owningTrack=advancedReopen.tracks.find(track=>track.kind==='beat'&&track.freeform);
  const editableLayer=owningTrack.freeform;
  const editableSource=editableLayer.instruments.find(item=>
   item.notes.some(note=>note.automation));
  assert(!!editableSource,'unpacked automated Beat becomes an editable freeform Instrument');
  const sourceBefore=JSON.stringify(editableSource),beforeLifecyclePlans=signature(advancedReopen);
  const originalCount=renderEvents(advancedReopen).filter(event=>event.kind==='note').length;
  const cloneInstrument=freeforms.duplicateFreeformInstrument(editableLayer,editableSource.id);
  assert(cloneInstrument.id!==editableSource.id&&
   cloneInstrument.sounds[0].id!==editableSource.sounds[0].id&&
   cloneInstrument.notes.every((note,index)=>note.id!==editableSource.notes[index].id)&&
   cloneInstrument.notes.some(note=>note.automation),
   'portable Instrument clone keeps automation with independent note and Sound identities');
  assert(renderEvents(advancedReopen).filter(event=>event.kind==='note').length>originalCount&&
   !songs.validateSong(advancedReopen).length,
   'cloned freeform Instrument adds an independent playable native voice');
  const clonedPackage=songFiles.exportSongProject(advancedReopen);
  const clonedRoundtrip=await songFiles.importSongProject(new File([clonedPackage.blob],clonedPackage.name));
  assert(signature(clonedRoundtrip)===signature(advancedReopen),
   'cloned Instrument and captured automation survive portable .premidi project recovery');
  const clonedAudio=await wav(clonedRoundtrip);
  assert(clonedAudio.size>44,
   'native C++ WAV renders the duplicated freeform Instrument without Web Audio');
  const moved=freeforms.moveFreeformInstrument(editableLayer,cloneInstrument.id,-1);
  assert(moved&&editableLayer.instruments.indexOf(cloneInstrument)<
   editableLayer.instruments.indexOf(editableSource),
   'portable Instrument reorder retains independent Sound identities');
  freeforms.removeFreeformInstrument(editableLayer,cloneInstrument.id);
  assert(signature(advancedReopen)===beforeLifecyclePlans&&
   JSON.stringify(editableSource)===sourceBefore&&
   !songs.validateSong(advancedReopen).length,
   'removing a duplicate restores exact native audio plans and original Instrument state');
  // Reusing a Chunk must remain source-linked across irregular, overlapping
  // repetitions in the real portable WebView/C++ audio host. No Web Audio fallback.
  const originalPlacementPlans=signature(advancedReopen);
  const chunkSource=editableSource.chunks[0];
  assert(chunkSource?.notes?.length>0,'Unpacked automated Beat retains a reusable source Chunk');
  const originalChunkSource=JSON.stringify(chunkSource);
  const placedChunk=freeforms.addFreeformChunkPlacement(editableSource,chunkSource.id,64,{
   length:16,every:12,repeats:2
  });
  const firstPlacementPlans=signature(advancedReopen);
  assert(firstPlacementPlans!==originalPlacementPlans&&
   !songs.validateSong(advancedReopen).length,
   'native portable Song schedules newly placed reusable Chunk notes');
  freeforms.editFreeformChunkPlacement(editableSource,placedChunk.id,{
   startStep:65,every:7,repeats:3,length:16
  });
  assert(placedChunk.startStep===65&&placedChunk.repeats===3&&
   placedChunk.every===7&&
   JSON.stringify(chunkSource)===originalChunkSource,
   'edited offsets, repetition and polymeter retain the original reusable Chunk');
  const editedPlacementPlans=signature(advancedReopen);
  assert(editedPlacementPlans!==firstPlacementPlans&&
   !songs.validateSong(advancedReopen).length,
   'native voices update from the exact edited Song-time placement');
  const placementPackage=songFiles.exportSongProject(advancedReopen);
  const placementRoundtrip=await songFiles.importSongProject(
   new File([placementPackage.blob],placementPackage.name));
  assert(!songs.validateSong(placementRoundtrip).length&&
   signature(placementRoundtrip)===editedPlacementPlans,
   'portable ZIP round trip retains placed Chunk timing, repeated tails and original source phase');
  const placementAudio=await wav(placementRoundtrip);
  assert(placementAudio.size>44,
   'native C++ WAV renders repeated freeform Chunk instances after project recovery');
  freeforms.removeFreeformChunkPlacement(editableSource,placedChunk.id);
  assert(signature(advancedReopen)===originalPlacementPlans&&
   JSON.stringify(chunkSource)===originalChunkSource&&
   !songs.validateSong(advancedReopen).length,
   'removing one placed Chunk restores the source native audio plan and all reusable notes');
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
