#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri_plugin_dialog::DialogExt;
#[tauri::command]
fn version(app: tauri::AppHandle) -> String { app.package_info().version.to_string() }
#[tauri::command]
async fn save_file(app: tauri::AppHandle, name: String, bytes: Vec<u8>) -> Result<bool,String> {
 if bytes.len()>256_000_000 || name.contains(['/', '\\', '\0']) {return Err("Invalid export".into());}
 let file=app.dialog().file().set_file_name(name).blocking_save_file();
 match file {None=>Ok(false),Some(file)=>{
 let path=file.into_path().map_err(|e|e.to_string())?;
 std::fs::write(path,bytes).map_err(|e|e.to_string())?;Ok(true)
 }}
}
fn main() {
 tauri::Builder::default()
 .plugin(tauri_plugin_dialog::init())
 .plugin(tauri_plugin_updater::Builder::new().build())
 .invoke_handler(tauri::generate_handler![version,save_file])
 .run(tauri::generate_context!()).expect("Could not launch pre-midi");
}
