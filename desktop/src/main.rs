#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod updates;
use tauri::{Emitter,Manager};
use tauri_plugin_dialog::DialogExt;
use std::sync::atomic::{AtomicBool,Ordering};
#[derive(Default)]struct Lifecycle(AtomicBool);
#[tauri::command]
fn desktop_info(app:tauri::AppHandle)->serde_json::Value{
 serde_json::json!({"version":app.package_info().version.to_string(),"channel":if app.package_info().version.pre.is_empty(){"stable"}else{"preview"},
 "updateSigningConfigured":!updates::KEY.is_empty(),"dataPath":app.path().app_data_dir().ok(),"audioBackend":"web-audio","nativeRealtime":false,"smokeRestore":std::env::var_os("PREMIDI_SMOKE_EXPECT_RESTORE").is_some()})
}
#[tauri::command]
async fn save_file(app:tauri::AppHandle,name:String,bytes:Vec<u8>)->Result<bool,String>{
 if bytes.len()>256_000_000 || name.is_empty() || name.len()>240 || name.contains(['/', '\\', '\0', ':']) {return Err("Invalid export".into());}
 let file=app.dialog().file().set_file_name(name).blocking_save_file();
 match file{None=>Ok(false),Some(file)=>{
  let path=file.into_path().map_err(|e|e.to_string())?;
  std::fs::write(path,bytes).map_err(|e|e.to_string())?;Ok(true)
 }}
}
#[tauri::command]
fn finish_close(app:tauri::AppHandle,state:tauri::State<'_,Lifecycle>){state.0.store(true,Ordering::SeqCst);app.exit(0);}
unsafe extern "C"{fn premidi_fixture(output:*mut f32,frames:u32)->i32;}
#[tauri::command]
async fn native_fixture()->Result<Vec<f32>,String>{
 tauri::async_runtime::spawn_blocking(||{
  let mut output=vec![0f32;48000];
  // The C++ boundary accepts exactly this fixed-size fixture, no arbitrary pointers or plans from JS.
  let status=unsafe{premidi_fixture(output.as_mut_ptr(),24000)};
  if status!=0{Err("Native fixture failed".into())}else{Ok(output)}
 }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
fn smoke_result(app:tauri::AppHandle,result:serde_json::Value)->Result<(),String>{
 let output=std::env::var("PREMIDI_SMOKE_OUTPUT").map_err(|_|"Smoke mode is disabled")?;
 std::fs::write(output,serde_json::to_vec_pretty(&result).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
 app.exit(if result["passed"]==true{0}else{1});Ok(())
}
fn main(){
 tauri::Builder::default()
 .manage(Lifecycle::default()).manage(updates::Pending::default())
 .plugin(tauri_plugin_dialog::init())
 .plugin(tauri_plugin_updater::Builder::new().build())
 .setup(|app|{
  let config=app.config().app.windows[0].clone();
  let builder=tauri::WebviewWindowBuilder::from_config(app,&config)?;
  #[cfg(any(windows,target_os="linux"))]
  let builder=builder.data_directory(app.path().app_local_data_dir()?.join("webview"));
  builder.on_navigation(|url|{
   url.scheme()=="tauri" || matches!(url.host_str(),Some("tauri.localhost")|Some("localhost"))
  }).build()?;Ok(())
 })
 .on_window_event(|window,event|{
  if let tauri::WindowEvent::CloseRequested{api,..}=event{
   if !window.state::<Lifecycle>().0.load(Ordering::SeqCst){api.prevent_close();let _=window.emit("desktop:close-request",());}
  }
 })
 .on_page_load(|window,payload|{
  if matches!(payload.event(),tauri::webview::PageLoadEvent::Finished) && std::env::var_os("PREMIDI_SMOKE_OUTPUT").is_some(){
   let _=window.eval(include_str!("../smoke.js"));
  }
 })
 .invoke_handler(tauri::generate_handler![desktop_info,save_file,finish_close,native_fixture,smoke_result,
  updates::check_updates,updates::download_update,updates::install_update])
 .run(tauri::generate_context!()).expect("Could not launch pre-midi");
}
