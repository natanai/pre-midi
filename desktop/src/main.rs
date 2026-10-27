#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod updates;
mod storage;
mod audio;
use tauri::{Emitter,Manager};
use tauri_plugin_dialog::DialogExt;
use std::sync::atomic::{AtomicBool,AtomicI32,Ordering};
#[derive(Default)]struct Lifecycle(AtomicBool,AtomicI32);
#[tauri::command]
fn desktop_info(app:tauri::AppHandle,storage:tauri::State<'_,storage::Storage>)->serde_json::Value{
 serde_json::json!({"version":app.package_info().version.to_string(),"channel":if app.package_info().version.pre.is_empty(){"stable"}else{"preview"},
 "updateSigningConfigured":!updates::KEY.is_empty(),"dataPath":storage.webview,"portable":storage.portable_root.is_some(),"portableRoot":storage.portable_root,
 "projectsPath":storage.projects,"exportsPath":storage.exports,"audioBackend":"native-cpp","nativeRealtime":true,
 "smokeRestore":std::env::var_os("PREMIDI_SMOKE_EXPECT_RESTORE").is_some(),"smokeFresh":std::env::var_os("PREMIDI_SMOKE_EXPECT_FRESH").is_some(),
 "smokeStorageToken":std::env::var("PREMIDI_SMOKE_STORAGE_TOKEN").unwrap_or_default(),
 "smokeWriteToken":std::env::var("PREMIDI_SMOKE_WRITE_TOKEN").ok()})
}
#[tauri::command]
async fn save_file(app:tauri::AppHandle,name:String,bytes:Vec<u8>)->Result<bool,String>{
 if bytes.len()>256_000_000 || name.is_empty() || name.len()>240 || name.contains(['/', '\\', '\0', ':']) {return Err("Invalid export".into());}
 let storage=app.state::<storage::Storage>();
 let mut dialog=app.dialog().file().set_file_name(&name);
 if let Some(directory)=storage.export_directory(&name){dialog=dialog.set_directory(directory);}
 let file=dialog.blocking_save_file();
 match file{None=>Ok(false),Some(file)=>{
  let path=file.into_path().map_err(|e|e.to_string())?;
  std::fs::write(path,bytes).map_err(|e|e.to_string())?;Ok(true)
 }}
}
#[tauri::command]
fn finish_close(app:tauri::AppHandle)->Result<(),String>{close_app(&app,0)}
fn close_app(app:&tauri::AppHandle,code:i32)->Result<(),String>{
 audio::shutdown(app);
 let lifecycle=app.state::<Lifecycle>();
 lifecycle.1.store(code,Ordering::SeqCst);
 lifecycle.0.store(true,Ordering::SeqCst);
 let windows=app.webview_windows();
 if windows.is_empty(){app.exit(code);}
 // Closing the controllers lets WebView2 flush and release its profile.
 // Requesting process exit while a WebView is still open can lose final writes.
 for window in windows.into_values(){window.close().map_err(|e|e.to_string())?;}
 Ok(())
}
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
 if result["passed"]!=true{audio::shutdown(&app);app.exit(1);return Ok(());}
 close_app(&app,0)
}
fn main(){
 tauri::Builder::default()
 .manage(Lifecycle::default()).manage(updates::Pending::default())
 .manage(audio::Audio::default())
 .plugin(tauri_plugin_dialog::init())
 .plugin(tauri_plugin_updater::Builder::new().build())
 .setup(|app|{
  let mut storage=storage::Storage::default();
  if cfg!(target_os="windows"){
   match storage::Storage::portable(&std::env::current_exe()?){
    Ok(Some(portable))=>storage=portable,
    Ok(None)=>{},
    Err(error)=>{
     let message=format!("pre-midi needs a writable portable folder. Move the entire extracted folder to a location you can write to and open pre-midi.exe again.\n\n{error}");
     if let Ok(output)=std::env::var("PREMIDI_SMOKE_OUTPUT"){
      let _=std::fs::write(output,serde_json::json!({"passed":false,"error":message}).to_string());
      return Err(error.into());
     }
     // setup runs on the main thread: keep the event loop available for the
     // native dialog instead of deadlocking it with a blocking_show call.
     let handle=app.handle().clone();
     app.dialog().message(message).title("pre-midi").kind(tauri_plugin_dialog::MessageDialogKind::Error).show(move |_|handle.exit(1));
     return Ok(());
    }
   }
  }
  #[cfg(any(windows,target_os="linux"))]
  if storage.webview.is_none(){storage.webview=Some(app.path().app_local_data_dir()?.join("webview"));}
  app.manage(storage);
  let config=app.config().app.windows[0].clone();
  let builder=tauri::WebviewWindowBuilder::from_config(app,&config)?;
  #[cfg(any(windows,target_os="linux"))]
  let builder=builder.data_directory(app.state::<storage::Storage>().webview.clone().expect("WebView storage configured"));
  builder.on_navigation(|url|{
   url.scheme()=="tauri" || matches!(url.host_str(),Some("tauri.localhost")|Some("localhost"))
  }).build()?;Ok(())
 })
 .on_window_event(|window,event|{
  if let tauri::WindowEvent::CloseRequested{api,..}=event{
   if !window.state::<Lifecycle>().0.load(Ordering::SeqCst){api.prevent_close();let _=window.emit("desktop:close-request",());}
  }
  if matches!(event,tauri::WindowEvent::Destroyed) && window.state::<Lifecycle>().0.load(Ordering::SeqCst)
   && window.app_handle().webview_windows().len()<=1{
   window.app_handle().exit(window.state::<Lifecycle>().1.load(Ordering::SeqCst));
  }
 })
 .on_page_load(|window,payload|{
  if matches!(payload.event(),tauri::webview::PageLoadEvent::Finished) && std::env::var_os("PREMIDI_SMOKE_OUTPUT").is_some(){
   let _=window.eval(include_str!("../smoke.js"));
  }
 })
 .invoke_handler(tauri::generate_handler![desktop_info,save_file,finish_close,native_fixture,smoke_result,
  audio::native_audio,updates::check_updates,updates::download_update,updates::install_update])
 .run(tauri::generate_context!()).expect("Could not launch pre-midi");
}
