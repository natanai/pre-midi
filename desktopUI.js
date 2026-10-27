import {installAudioSettings} from './desktopAudioUI.js';
export function installDesktopUI({flush}) {
 const tauri=window.__TAURI__,invoke=tauri?.core?.invoke;
 if(!invoke)return;
 window.premidiDesktop={
  info:()=>invoke('desktop_info'),
  saveFile:(name,bytes)=>invoke('save_file',{name,bytes:Array.from(new Uint8Array(bytes))}),
  nativeFixture:()=>invoke('native_fixture')
 };
 window.premidiFlush=flush;
 const element=(name,text)=>{const node=document.createElement(name);if(text)node.textContent=text;return node;};
 async function prompt(title,detail,buttons=['ok']){
  const dialog=element('dialog'),heading=element('h2',title),body=element('p',detail),actions=element('div');
  body.style.whiteSpace='pre-wrap';dialog.append(heading,body,actions);document.body.append(dialog);
  return new Promise(resolve=>{
   let settled=false;const finish=value=>{if(settled)return;settled=true;dialog.close();dialog.remove();resolve(value);};
   dialog.addEventListener('cancel',event=>{event.preventDefault();finish(-1);});
   buttons.forEach((text,index)=>{const button=element('button',text);button.type='button';button.onclick=()=>finish(index);actions.append(button);});
   dialog.showModal();actions.lastElementChild?.focus();
  });
 }
 let busy=false;
 async function checkUpdates(channel){
  if(busy)return;busy=true;check.disabled=true;
  try{
   check.textContent='checking…';
   const update=await invoke('check_updates',{channel});
   if(!update){await prompt("You're up to date",'pre-midi '+version.textContent.replace('pre-midi ','')+' · '+channel);return;}
   const detail=update.notes+(update.limitation?'\n\n'+update.limitation:'');
   if(!update.installable){await prompt('pre-midi '+update.version+' is available',detail);return;}
   if(await prompt('pre-midi '+update.version+' is available',detail,['download update','cancel'])!==0)return;
   check.textContent='downloading…';await invoke('download_update');
   if(await prompt('update verified','pre-midi will close to install the update. When installation finishes, open pre-midi again to continue.',['close and install','later'])!==0)return;
   await flush();await invoke('install_update');
  }catch(error){await prompt('could not update pre-midi',String(error)+'\nYour project data has not been removed. You can retry the update.');}
  finally{busy=false;check.disabled=false;check.textContent='check for updates';}
 }
 const menu=element('details');menu.className='desktop-settings entity-actions';
 const toggle=element('summary','settings'),list=element('div');list.className='entity-action-list';
 const version=element('output');version.id='desktop-version';
 const label=element('label','updates '),channel=element('select');channel.setAttribute('aria-label','update channel');
 for(const value of ['stable','preview']){const option=element('option',value);option.value=value;channel.append(option);}
 label.append(channel);
 const check=element('button','check for updates');check.type='button';check.id='check-for-updates';check.onclick=()=>checkUpdates(channel.value);
 list.append(version);installAudioSettings(list,{element,prompt,menu});list.append(label,check);menu.append(toggle,list);document.querySelector('header nav').append(menu);
 window.premidiDesktop.info().then(info=>{version.textContent='pre-midi '+info.version;channel.value=localStorage.getItem('premidi-update-channel')||info.channel;})
  .catch(error=>prompt('could not read desktop version',String(error)));
 channel.onchange=()=>localStorage.setItem('premidi-update-channel',channel.value);
 tauri.event.listen('desktop:close-request',async()=>{
  try{await flush();await invoke('finish_close');}
  catch(error){await prompt('could not save before closing',String(error));}
 });
}
