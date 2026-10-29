mod control;
pub use control::{Audio,Request,RenderRequest,DecodeRequest};
use tauri::{Manager,State};
#[tauri::command]
pub async fn native_audio(app:tauri::AppHandle,request:Request)->Result<serde_json::Value,String>{
 if let Request::Asset{data,..}=&request{if data.len()>48_000_000{return Err("Native audio asset exceeds 48 MB".into());}}
 if let Request::Play{data,..}|Request::Update{data,..}=&request{if data.len()>16*1024*1024{return Err("Native session exceeds 16 MiB".into());}}
 tauri::async_runtime::spawn_blocking(move||app.state::<Audio>().call(request)).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn native_render(app:tauri::AppHandle,request:RenderRequest)->Result<tauri::ipc::Response,String>{
 tauri::async_runtime::spawn_blocking(move||app.state::<Audio>().render(request).map(tauri::ipc::Response::new)).await.map_err(|e|e.to_string())?
}
pub fn shutdown(app:&tauri::AppHandle){let state:State<'_,Audio>=app.state();state.close();}
#[tauri::command]
pub async fn native_capture_finish(app:tauri::AppHandle,owner:u64)->Result<tauri::ipc::Response,String>{tauri::async_runtime::spawn_blocking(move||app.state::<Audio>().finish_capture(owner).map(tauri::ipc::Response::new)).await.map_err(|e|e.to_string())?}
#[tauri::command]
pub async fn native_decode(app:tauri::AppHandle,request:DecodeRequest)->Result<tauri::ipc::Response,String>{tauri::async_runtime::spawn_blocking(move||app.state::<Audio>().decode(request).map(tauri::ipc::Response::new)).await.map_err(|e|e.to_string())?}
pub fn cancel_shutdown(app:&tauri::AppHandle){app.state::<Audio>().reopen();}
