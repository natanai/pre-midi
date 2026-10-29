import {nativeRequest} from './src/hosts/native/session.js';
export function installAudioSettings(list,{element,prompt,menu}){
 const label=element('label','audio '),engine=element('select');engine.id='audio-backend';engine.setAttribute('aria-label','audio engine');
 for(const [value,text]of [['native','native C++'],['web','web audio']]){const option=element('option',text);option.value=value;engine.append(option);}
 engine.value=localStorage.getItem('premidi-audio-backend')||'native';
 engine.title='native playback, live edits, microphone recording and WAV export';label.append(engine);
 const outputLabel=element('label','output '),output=element('select');output.setAttribute('aria-label','audio output');outputLabel.append(output);
 const refresh=element('button','refresh outputs');refresh.type='button';
 const reconnect=element('button','reconnect output');reconnect.type='button';reconnect.hidden=true;
 const advanced=element('details'),summary=element('summary','audio performance');advanced.append(summary);
 const rateLabel=element('label','sample rate '),rate=element('select');rate.setAttribute('aria-label','native sample rate');
 const bufferLabel=element('label','buffer '),buffer=element('select');buffer.setAttribute('aria-label','native buffer size');
 const offsetLabel=element('label','recording offset (ms) '),offset=element('input');offset.type='number';offset.min='0';offset.max='500';offset.step='.1';offset.value=localStorage.getItem('premidi-recording-offset-ms')||'0';offset.setAttribute('aria-label','recording offset in milliseconds');offsetLabel.title='moves microphone audio earlier by your measured round-trip delay';offsetLabel.append(offset);
 offset.onchange=()=>{const value=Number(offset.value);if(!Number.isFinite(value)||value<0||value>500){offset.value=localStorage.getItem('premidi-recording-offset-ms')||'0';return;}localStorage.setItem('premidi-recording-offset-ms',String(value));};
 for(const [value,text]of [[0,'automatic'],[44100,'44.1 khz'],[48000,'48 khz'],[96000,'96 khz']]){const option=element('option',text);option.value=value;rate.append(option);}
 for(const value of [0,128,256,512,1024]){const option=element('option',value?value+' frames':'automatic');option.value=value;buffer.append(option);}
 let saved;try{saved=JSON.parse(localStorage.getItem('premidi-native-output')||'null');}catch{}
 rate.value=String(saved?.rate??0);buffer.value=String(saved?.buffer??0);rateLabel.append(rate);bufferLabel.append(buffer);
 const performance=element('output');performance.id='native-audio-performance';performance.style.whiteSpace='pre-wrap';
 performance.title='render CPU and deadline misses describe our callback; driver underruns and physical output latency require hardware measurement';
 advanced.append(rateLabel,bufferLabel,offsetLabel,performance);list.append(label,outputLabel,refresh,reconnect,advanced);
 const pause=document.getElementById('native-pause');pause.onclick=()=>window.dispatchEvent(new Event('premidi-native-pause'));
 let devices=[],busy=false;
 function visibility(){const native=engine.value==='native';outputLabel.hidden=refresh.hidden=advanced.hidden=pause.hidden=!native;if(!native)reconnect.hidden=true;}
 function showStatus(status){
  reconnect.hidden=!status.deviceLost||engine.value!=='native';
  if(!status.sampleRate){performance.textContent='output opens when you play';return;}
  performance.textContent=`${status.testBackend?'test output · ':''}${status.backend} · ${status.sampleRate} hz\nrender cpu ${status.renderCpuPercent.toFixed(1)}% · max callback ${status.maxCallbackMs.toFixed(2)} ms\nrender deadline misses ${status.deadlineMisses} · clipped samples ${status.clippedSamples}\ndevice underruns and measured latency: pending hardware qualification`;
 }
 async function load(){
  if(busy||engine.value!=='native')return;busy=true;
  try{
   const response=await nativeRequest({action:'devices'});devices=response.devices;output.replaceChildren();
   const system=element('option','system output');system.value='';output.append(system);
   for(const device of devices){const option=element('option',device.name);option.value=String(device.id);output.append(option);}
   if(saved?.name){const matches=devices.filter(device=>device.name===saved.name);
    if(matches.length===1)output.value=String(matches[0].id);
    else{const missing=element('option','saved output unavailable');missing.value='missing';missing.disabled=true;output.append(missing);output.value='missing';}
   }
   showStatus(response.status);
  }catch(error){performance.textContent=String(error);}finally{busy=false;}
 }
 async function configure(){
  if(busy)return;busy=true;
  try{
   if(output.value==='missing')throw Error('Choose an available audio output');
   window.dispatchEvent(new Event('premidi-audio-mode'));
   const device=output.value===''?null:Number(output.value),result=await nativeRequest({action:'configure',device,rate:Number(rate.value),buffer:Number(buffer.value)});
   saved={name:device===null?null:devices.find(item=>item.id===device)?.name,rate:Number(rate.value),buffer:Number(buffer.value)};
   localStorage.setItem('premidi-native-output',JSON.stringify(saved));showStatus(result);
  }catch(error){await prompt('could not open audio output',String(error));}finally{busy=false;}
 }
 engine.onchange=async()=>{
  try{window.dispatchEvent(new Event('premidi-audio-mode'));await nativeRequest({action:'shutdown'});localStorage.setItem('premidi-audio-backend',engine.value);visibility();if(engine.value==='native')await load();}
  catch(error){await prompt('could not change audio',String(error));}
 };
 output.onchange=configure;rate.onchange=configure;buffer.onchange=configure;refresh.onclick=()=>void load();reconnect.onclick=async()=>{await load();await configure();};
 menu.addEventListener('toggle',()=>{if(menu.open)void load();});
 visibility();
 setInterval(async()=>{if(menu.open&&advanced.open&&!busy&&engine.value==='native')try{showStatus(await nativeRequest({action:'status'}));}catch(error){performance.textContent=String(error);}},1000);
}
