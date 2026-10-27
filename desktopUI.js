export function installDesktopUI({flush}) {
 const invoke=window.__TAURI__?.core?.invoke;
 if(invoke)window.premidiDesktop={
  info:async()=>({version:await invoke('version'),channel:'preview'}),
  saveFile:(name,bytes)=>invoke('save_file',{name,bytes:Array.from(new Uint8Array(bytes))}),
  checkForUpdates:async()=>alert('signed updates are not configured in this preview'),
  openDataFolder:async()=>alert('Export .premidi to back up your work')
 };
 const host=window.premidiDesktop;
 if(!host)return;
 window.premidiFlush=flush;
 const menu=document.createElement('details');menu.className='desktop-settings entity-actions';
 const toggle=document.createElement('summary');toggle.textContent='settings';
 const list=document.createElement('div');list.className='entity-action-list';
 const version=document.createElement('output');version.id='desktop-version';
 const backend=document.createElement('output');backend.textContent='audio: web audio';
 const label=document.createElement('label');label.textContent='updates ';
 const channel=document.createElement('select');channel.setAttribute('aria-label','update channel');
 for(const value of ['stable','preview']){const option=document.createElement('option');option.value=value;option.textContent=value;channel.append(option);}
 label.append(channel);
 const check=document.createElement('button');check.type='button';check.id='check-for-updates';check.textContent='check for updates';
 check.addEventListener('click',async()=>{
  check.disabled=true;check.textContent='checking…';
  try{await host.checkForUpdates(channel.value);}finally{check.disabled=false;check.textContent='check for updates';}
 });
 list.append(version,backend,label,check);menu.append(toggle,list);document.querySelector('header nav').append(menu);
 host.info().then(info=>{version.textContent='pre-midi '+info.version;channel.value=localStorage.getItem('premidi-update-channel')||info.channel;});
 channel.addEventListener('change',()=>localStorage.setItem('premidi-update-channel',channel.value));
}
