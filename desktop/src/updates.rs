use std::{sync::Mutex,time::Duration};
use tauri::{Manager,State};
use tauri_plugin_updater::{Update,UpdaterExt};
use serde::{Deserialize,Serialize};
use semver::Version;

const REPO:&str="natanai/pre-midi";
pub const KEY:&str=match option_env!("TAURI_UPDATER_PUBLIC_KEY"){Some(key)=>key,None=>""};
#[derive(Default)]
pub struct Pending(pub Mutex<Option<(Update,Option<Vec<u8>>)>>);
#[derive(Deserialize)]
struct Asset{name:String,browser_download_url:String}
#[derive(Deserialize)]
struct Release{tag_name:String,draft:bool,prerelease:bool,body:Option<String>,assets:Vec<Asset>}
#[derive(Serialize)]
pub struct UpdateInfo{version:String,notes:String,installable:bool,limitation:String}
fn valid_release(release:&Release,channel:&str,current:&Version)->Option<Version>{
 let version=Version::parse(release.tag_name.strip_prefix('v')?).ok()?;
 if release.draft || version<=*current || (channel=="stable" && (release.prerelease || !version.pre.is_empty())) ||
  (!version.pre.is_empty() && !release.prerelease){None}else{Some(version)}
}
#[tauri::command]
pub async fn check_updates(app:tauri::AppHandle,state:State<'_,Pending>,channel:String)->Result<Option<UpdateInfo>,String>{
 if channel!="stable" && channel!="preview"{return Err("Unknown update channel".into());}
 *state.0.lock().map_err(|e|e.to_string())?=None;
 let current=app.package_info().version.clone();
 let client=reqwest::Client::builder().user_agent("pre-midi-desktop").timeout(Duration::from_secs(30)).build().map_err(|e|e.to_string())?;
 let releases:Vec<Release>=client.get(format!("https://api.github.com/repos/{REPO}/releases?per_page=100"))
  .send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?
  .json().await.map_err(|e|e.to_string())?;
 let release=releases.into_iter().filter_map(|r|valid_release(&r,&channel,&current).map(|v|(v,r)))
  .max_by(|a,b|a.0.cmp(&b.0));
 let Some((version,release))=release else{return Ok(None)};
 let manifest=release.assets.iter().find(|a|a.name=="desktop-updates.json");
 let limit=if KEY.is_empty(){"Automatic installation is unavailable: this preview has no trusted update signing key. Install a later preview manually from GitHub Releases."}
  else if manifest.is_none(){"This release has no signed update package for automatic installation."}
  else if cfg!(target_os="linux") && std::env::var_os("APPIMAGE").is_none(){"Use your package manager to install Linux DEB updates. Automatic updates are available in the AppImage edition."}
  else if cfg!(target_os="windows") && std::env::current_exe().ok().is_some_and(|p|p.with_file_name("portable.txt").exists()){
   "Portable edition: install the Windows installer to enable automatic updates, or extract the new ZIP into a separate folder."}
  else {""};
 let result=UpdateInfo{version:version.to_string(),notes:release.body.unwrap_or_default(),installable:limit.is_empty(),limitation:limit.into()};
 if !limit.is_empty(){return Ok(Some(result));}
 let expected=format!("https://github.com/{REPO}/releases/download/{}/desktop-updates.json",release.tag_name);
 if manifest.unwrap().browser_download_url!=expected{return Err("Unexpected update manifest source".into());}
 let updater=app.updater_builder().pubkey(KEY).endpoints(vec![expected.parse().map_err(|_|"Invalid update URL")?]).map_err(|e|e.to_string())?
  .timeout(Duration::from_secs(60)).restart_after_install(false).build().map_err(|e|e.to_string())?;
 let update=updater.check().await.map_err(|e|e.to_string())?.ok_or("The release has no newer compatible update")?;
 if update.version!=version.to_string() || !update.download_url.as_str().starts_with(&format!("https://github.com/{REPO}/releases/download/{}/",release.tag_name)){
  return Err("Update does not match the official release".into());
 }
 *state.0.lock().map_err(|e|e.to_string())?=Some((update,None));
 Ok(Some(result))
}
#[tauri::command]
pub async fn download_update(state:State<'_,Pending>)->Result<(),String>{
 let update=state.0.lock().map_err(|e|e.to_string())?.as_ref().ok_or("Check for updates first")?.0.clone();
 // Tauri verifies the Minisign signature and its signed version before returning.
 let bytes=update.download(|_,_|{},||{}).await.map_err(|e|e.to_string())?;
 let mut pending=state.0.lock().map_err(|e|e.to_string())?;
 let item=pending.as_mut().ok_or("Update selection changed")?;
 if item.0.version!=update.version{return Err("Update selection changed".into());}
 item.1=Some(bytes);Ok(())
}
#[tauri::command]
pub async fn install_update(app:tauri::AppHandle,state:State<'_,Pending>)->Result<(),String>{
 let (update,bytes)=state.0.lock().map_err(|e|e.to_string())?.take().ok_or("No verified update is ready")?;
 let bytes=bytes.ok_or("Download and verify the update first")?;
 update.install(bytes).map_err(|e|e.to_string())?;
 // Windows exits inside Tauri after launching NSIS. macOS/AppImage stage a
 // replacement using the framework's backup/restore flow; never relaunch.
 app.exit(0);Ok(())
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn channels_never_downgrade(){
  let mut r=Release{tag_name:"v0.14.1-preview.2".into(),draft:false,prerelease:true,body:None,assets:vec![]};
  let current=Version::parse("0.14.1-preview.1").unwrap();
  assert!(valid_release(&r,"preview",&current).is_some());assert!(valid_release(&r,"stable",&current).is_none());
  r.tag_name="v0.14.0".into();assert!(valid_release(&r,"preview",&current).is_none());
 }
}
