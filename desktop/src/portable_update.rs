//! Transactional Windows portable updates. Only the signed GitHub portable ZIP
//! enters this path. The helper is a copy of the existing executable, running
//! outside the file it replaces. User profiles and exports are never enumerated.
use std::{fs,io::{Cursor,Read},path::{Path,PathBuf},process::{Command,Stdio},thread,time::{Duration,Instant}};
use sha2::{Digest,Sha256};
use zip::ZipArchive;

const MANAGED: [&str; 5] = ["pre-midi.exe","portable.txt","README.txt","THIRD-PARTY-NOTICES.txt","licenses"];
const MAX_ARCHIVE: usize = 96 * 1024 * 1024;
const MAX_EXTRACTED: u64 = 160 * 1024 * 1024;

fn name_allowed(name:&str, is_dir:bool)->bool {
    if is_dir {return matches!(name,"data/"|"projects/"|"exports/"|"licenses/");}
    if matches!(name,"pre-midi.exe"|"portable.txt"|"README.txt"|"THIRD-PARTY-NOTICES.txt"|"version.txt"){return true;}
    if let Some(file)=name.strip_prefix("licenses/") {
        return file.ends_with(".txt") && file.len() < 90 &&
            file.chars().all(|ch|ch.is_ascii_alphanumeric()||ch=='.'||ch=='-'||ch=='_') &&
            !file.starts_with('.');
    }
    false
}

fn unpack(bytes:&[u8],destination:&Path,version:&str)->Result<(),String> {
    if bytes.is_empty()||bytes.len()>MAX_ARCHIVE{return Err("Portable ZIP size outside limits".into());}
    let mut zip=ZipArchive::new(Cursor::new(bytes)).map_err(|e|e.to_string())?;
    if zip.len()>80{return Err("Portable ZIP has too many entries".into());}
    let mut seen=std::collections::HashSet::new();
    let mut total=0u64;
    let mut entries=Vec::new();
    let mut version_found=false;
    for i in 0..zip.len(){
        let mut entry=zip.by_index(i).map_err(|e|e.to_string())?;
        let name=entry.name().to_string();
        if !name_allowed(&name,entry.is_dir()) || !seen.insert(name.clone()) ||
           entry.unix_mode().is_some_and(|mode| (mode&0o170000)==0o120000) {
            return Err(format!("Unsafe or duplicate portable ZIP entry: {name}"));
        }
        total=total.checked_add(entry.size()).ok_or("Portable ZIP size overflow")?;
        if total>MAX_EXTRACTED{return Err("Portable ZIP expands beyond limits".into());}
        if entry.is_dir(){continue;}
        let mut data=Vec::new();
        entry.read_to_end(&mut data).map_err(|e|e.to_string())?;
        if data.len() as u64!=entry.size(){return Err("Incomplete portable ZIP entry".into());}
        if name=="version.txt" {
            if data!=version.as_bytes(){return Err("ZIP executable version does not match signed release".into());}
            version_found=true;
        } else {entries.push((name,data));}
    }
    if !version_found || !MANAGED[..4].iter().all(|name|seen.contains(*name)) ||
       !seen.iter().any(|name|name.starts_with("licenses/")&&name.ends_with(".txt")) {
        return Err("Portable ZIP is missing required application files or its version".into());
    }
    fs::create_dir(destination).map_err(|e|format!("Staging directory: {e}"))?;
    for (name,bytes) in entries {
        let path=destination.join(&name);
        if let Some(parent)=path.parent(){fs::create_dir_all(parent).map_err(|e|e.to_string())?;}
        fs::write(path,bytes).map_err(|e|e.to_string())?;
    }
    Ok(())
}

fn existing(path:&Path)->bool {fs::symlink_metadata(path).is_ok()}
fn require_directory_inside(root:&Path,dir:&Path)->Result<(),String>{
    if existing(dir) && fs::symlink_metadata(dir).map_err(|e|e.to_string())?.file_type().is_symlink(){
        return Err("Portable update directory cannot be a junction or symlink".into());
    }
    fs::create_dir_all(dir).map_err(|e|e.to_string())?;
    if !dir.canonicalize().map_err(|e|e.to_string())?
        .starts_with(root.canonicalize().map_err(|e|e.to_string())?) {
        return Err("Portable update directory escapes its folder".into());
    }
    Ok(())
}

pub fn begin(root:&Path,version:&str,verified:&[u8])->Result<(),String>{
    #[cfg(not(target_os="windows"))]
    {let _=(root,version,verified);return Err("Portable update is Windows-only".into());}
    #[cfg(target_os="windows")]
    {
        if !existing(&root.join("portable.txt")) {return Err("Not the portable edition".into());}
        let work=root.join(".premidi-update");
        require_directory_inside(root,&work)?;
        // Never discard a previous backup that might be needed for recovery.
        if existing(&work.join("backup")){return Err("A previous update backup needs attention before another update".into());}
        for name in ["staged","verified.zip","runner.exe","ready","success.txt","failure.txt"]{
            let path=work.join(name);
            if existing(&path) {
                if path.is_dir(){fs::remove_dir_all(path)}else{fs::remove_file(path)}
                    .map_err(|e|format!("Cannot clear old update staging: {e}"))?;
            }
        }
        // Do all archive integrity checks before launching the updater process.
        unpack(verified,&work.join("staged"),version)?;
        fs::write(work.join("verified.zip"),verified).map_err(|e|e.to_string())?;
        fs::copy(root.join("pre-midi.exe"),work.join("runner.exe")).map_err(|e|e.to_string())?;
        let sha=format!("{:x}",Sha256::digest(verified));
        Command::new(work.join("runner.exe"))
            .arg("--apply-portable-update").arg(std::process::id().to_string())
            .arg(sha).arg(version)
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
            .spawn().map_err(|e|format!("Cannot start portable updater: {e}"))?;
        Ok(())
    }
}

fn restore(root:&Path,backup:&Path,installed:&[&str],backed:&[&str])->Result<(),String>{
    let mut errors=Vec::new();
    for name in installed.iter().rev(){
        let path=root.join(name);
        if existing(&path){
            let result=if path.is_dir(){fs::remove_dir_all(path)}else{fs::remove_file(path)};
            if let Err(e)=result {errors.push(format!("remove {name}: {e}"));}
        }
    }
    for name in backed.iter().rev(){
        if let Err(e)=fs::rename(backup.join(name),root.join(name)){errors.push(format!("restore {name}: {e}"));}
    }
    if errors.is_empty(){Ok(())}else{Err(errors.join("; "))}
}

fn swap(root:&Path,staged:&Path,backup:&Path)->Result<(),String>{
    if existing(backup){return Err("Cannot overwrite an existing portable update backup".into());}
    fs::create_dir(backup).map_err(|e|e.to_string())?;
    let mut backed=Vec::new();
    let mut installed=Vec::new();
    let swap_result=(||->Result<(),String>{
        for name in MANAGED {
            let old=root.join(name);
            if existing(&old){
                if fs::symlink_metadata(&old).map_err(|e|e.to_string())?.file_type().is_symlink(){
                    return Err(format!("{name} cannot be a symlink"));
                }
                fs::rename(old,backup.join(name)).map_err(|e|format!("Backing up {name}: {e}"))?;
                backed.push(name);
            }
        }
        for name in MANAGED {
            let new=staged.join(name);
            if !existing(&new){return Err(format!("New portable release is missing {name}"));}
            fs::rename(new,root.join(name)).map_err(|e|format!("Installing {name}: {e}"))?;
            installed.push(name);
        }
        Ok(())
    })();
    if let Err(err)=swap_result {
        if let Err(rollback)=restore(root,backup,&installed,&backed){
            return Err(format!("{err}; rollback incomplete: {rollback}. Restore files manually from .premidi-update/backup"));
        }
        let _=fs::remove_dir_all(backup);
        return Err(format!("{err}; prior version restored"));
    }
    Ok(())
}

#[cfg(target_os="windows")]
fn wait_parent(pid:u32)->Result<(),String>{
    use std::ffi::c_void;
    #[link(name="kernel32")]unsafe extern "system"{
        fn OpenProcess(access:u32,inherit:i32,pid:u32)->*mut c_void;
        fn WaitForSingleObject(handle:*mut c_void,milliseconds:u32)->u32;
        fn CloseHandle(handle:*mut c_void)->i32;
    }
    unsafe {
        let handle=OpenProcess(0x00100000,0,pid);
        if handle.is_null(){
            if std::io::Error::last_os_error().raw_os_error()==Some(87){return Ok(());}
            return Err("Cannot monitor the closing studio process".into());
        }
        let result=WaitForSingleObject(handle,120_000);
        CloseHandle(handle);
        if result==0 {Ok(())}else{Err("Studio did not exit cleanly in time".into())}
    }
}
#[cfg(not(target_os="windows"))]
fn wait_parent(_pid:u32)->Result<(),String>{Err("Windows only".into())}

fn start_and_check(root:&Path,work:&Path,version:&str)->Result<(),String>{
    let ready=work.join("ready");
    let _=fs::remove_file(&ready);
    let mut child=Command::new(root.join("pre-midi.exe"))
        .env("PREMIDI_UPDATE_HEALTH_FILE",&ready)
        .env("PREMIDI_UPDATE_EXPECT_VERSION",version)
        .current_dir(root).spawn().map_err(|e|format!("Updated studio cannot launch: {e}"))?;
    let start=Instant::now();
    while start.elapsed()<Duration::from_secs(75){
        if let Ok(result)=fs::read_to_string(&ready){
            if result==version{return Ok(());}
        }
        if child.try_wait().map_err(|e|e.to_string())?.is_some(){break;}
        thread::sleep(Duration::from_millis(150));
    }
    let _=child.kill();let _=child.wait();
    Err("Updated studio did not confirm readiness; restoring previous version".into())
}

fn perform(root:&Path,pid:u32,hash:&str,version:&str)->Result<(),String>{
    let work=root.join(".premidi-update");
    require_directory_inside(root,&work)?;
    if semver::Version::parse(version).is_err() ||
       hash.len()!=64 || !hash.bytes().all(|b|b.is_ascii_hexdigit()) {
        return Err("Invalid updater arguments".into());
    }
    let bytes=fs::read(work.join("verified.zip")).map_err(|e|e.to_string())?;
    if format!("{:x}",Sha256::digest(&bytes))!=hash {return Err("Staged update checksum mismatch".into());}
    let staged=work.join("staged");
    if existing(&staged){fs::remove_dir_all(&staged).map_err(|e|e.to_string())?;}
    // Re-extract from the exact already signature-verified bytes, not from
    // potentially modified staged files.
    unpack(&bytes,&staged,version)?;
    wait_parent(pid)?;
    let backup=work.join("backup");
    swap(root,&staged,&backup)?;
    if let Err(e)=start_and_check(root,&work,version){
        let backed:Vec<_>=MANAGED.iter().copied().filter(|name|existing(&backup.join(name))).collect();
        let installed:Vec<_>=MANAGED.iter().copied().filter(|name|existing(&root.join(name))).collect();
        if let Err(rollback)=restore(root,&backup,&installed,&backed){
            return Err(format!("{e}; rollback failed: {rollback}. Backup retained"));
        }
        fs::remove_dir_all(&backup).map_err(|e|e.to_string())?;
        let _=fs::write(work.join("failure.txt"),format!("{e}; previous version restored"));
        let _=Command::new(root.join("pre-midi.exe")).current_dir(root).spawn();
        return Err(format!("{e}; previous version restored"));
    }
    fs::remove_dir_all(&backup).map_err(|e|format!("Update succeeded, but could not clear backup: {e}"))?;
    fs::write(work.join("success.txt"),version).map_err(|e|e.to_string())?;
    Ok(())
}

/// Called before the Tauri event loop to let our *old* executable act as
/// the helper while the replacement executable is not running.
pub fn helper_exit_code()->Option<i32>{
    if std::env::args_os().nth(1).as_deref()!=Some(std::ffi::OsStr::new("--apply-portable-update")){return None;}
    let args:Vec<_>=std::env::args().collect();
    let work=std::env::current_exe().ok()?.parent()?.to_path_buf();
    let root=work.parent()?.to_path_buf();
    let result=(||{
        if args.len()!=5 {return Err("Invalid updater argument count".into());}
        let pid=args[2].parse::<u32>().map_err(|e|e.to_string())?;
        perform(&root,pid,&args[3],&args[4])
    })();
    match result {
        Ok(())=>Some(0),
        Err(e)=>{let _=fs::write(work.join("failure.txt"),&e);Some(1)}
    }
}

pub fn acknowledge_ready(app_version:&str)->Result<(),String>{
    let Some(path)=std::env::var_os("PREMIDI_UPDATE_HEALTH_FILE") else {return Ok(());};
    if std::env::var("PREMIDI_UPDATE_EXPECT_VERSION").ok().as_deref()!=Some(app_version){
        return Err("New version differs from expected release".into());
    }
    let path=PathBuf::from(path);
    let expected=std::env::current_exe().map_err(|e|e.to_string())?
        .parent().ok_or("No portable directory")?.join(".premidi-update").join("ready");
    if path!=expected{return Err("Health acknowledgement path is outside updater folder".into());}
    fs::write(path,app_version).map_err(|e|e.to_string())
}

#[cfg(test)]
mod tests {
 use super::*;
 #[test]fn rejects_path_traversal_and_data_override(){
    for name in ["../pre-midi.exe","data/webview/settings","projects/beat","licenses/../evil","/windows/system32","licenses/x.exe","licenses/.hidden.txt"]{
      assert!(!name_allowed(name,false),"{name}");
    }
    for name in ["pre-midi.exe","licenses/example.txt","version.txt"]{assert!(name_allowed(name,false));}
 }
 #[test]fn failed_replacement_restores_all_original_files(){
    let root=std::env::temp_dir().join(format!("premidi-update-transaction-{}",std::process::id()));
    let _=fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("staged/licenses")).unwrap();
    fs::create_dir_all(root.join("data/webview")).unwrap();
    fs::write(root.join("data/webview/recording.wav"),b"user-data").unwrap();
    for name in MANAGED[..4].iter(){fs::write(root.join(name),b"old").unwrap();}
    fs::create_dir(root.join("licenses")).unwrap();
    fs::write(root.join("licenses/old.txt"),b"old").unwrap();
    fs::write(root.join("staged/pre-midi.exe"),b"new").unwrap();
    // Incomplete stage must fail after some files have already moved.
    assert!(swap(&root,&root.join("staged"),&root.join("backup")).is_err());
    for name in MANAGED[..4].iter(){assert_eq!(fs::read(root.join(name)).unwrap(),b"old");}
    assert_eq!(fs::read(root.join("licenses/old.txt")).unwrap(),b"old");
    assert_eq!(fs::read(root.join("data/webview/recording.wav")).unwrap(),b"user-data");
    assert!(!existing(&root.join("backup")));
    let _=fs::remove_dir_all(root);
 }
}

/// Show a failure once in Settings, or prune a previously successful staging
/// directory on a later launch, after the helper is no longer using it.
pub fn take_failure(root:Option<&Path>)->Option<String>{
 let work=root?.join(".premidi-update");
 let failure=work.join("failure.txt");
 if let Ok(detail)=fs::read_to_string(&failure){
    let _=fs::remove_file(&failure);
    return Some(detail);
 }
 if existing(&work.join("success.txt")) && !existing(&work.join("backup")){
    let _=fs::remove_dir_all(&work);
 }
 None
}
