use std::{fs, io, path::{Path, PathBuf}, sync::atomic::{AtomicU64, Ordering}};

#[derive(Default)]
pub struct Storage {
    pub portable_root: Option<PathBuf>,
    pub webview: Option<PathBuf>,
    pub projects: Option<PathBuf>,
    pub exports: Option<PathBuf>,
}

impl Storage {
    // Resolve from the executable, never the launcher's working directory.
    // Missing marker means installed mode; an unusable portable folder is an
    // error, never permission to fall back to the installed/user profile.
    pub fn portable(executable: &Path) -> io::Result<Option<Self>> {
        let root = executable.parent().ok_or_else(|| io::Error::other("Missing application folder"))?;
        match fs::metadata(root.join("portable.txt")) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
            Ok(meta) if !meta.is_file() => return Err(io::Error::other("portable.txt must be a file")),
            Ok(_) => {}
        }
        let canonical_root = root.canonicalize()?;
        let data = prepare_directory(root, &canonical_root, "data")?;
        let webview = prepare_directory(&data, &canonical_root, "webview")?;
        let projects = prepare_directory(root, &canonical_root, "projects")?;
        let exports = prepare_directory(root, &canonical_root, "exports")?;
        Ok(Some(Self { portable_root: Some(root.to_path_buf()), webview: Some(webview),
            projects: Some(projects), exports: Some(exports) }))
    }

    pub fn export_directory(&self, name: &str) -> Option<&Path> {
        if name.to_ascii_lowercase().ends_with(".wav") {
            self.exports.as_deref()
        } else {
            self.projects.as_deref()
        }
    }
}

fn prepare_directory(parent: &Path, root: &Path, name: &str) -> io::Result<PathBuf> {
    let path = parent.join(name);
    // Check existing junctions/symlinks before creating anything beneath them.
    if path.exists() && !path.canonicalize()?.starts_with(root) {
        return Err(io::Error::other(format!("{} points outside the portable folder", path.display())));
    }
    fs::create_dir_all(&path)?;
    if !path.canonicalize()?.starts_with(root) {
        return Err(io::Error::other("Portable data must stay inside the application folder"));
    }
    static PROBE: AtomicU64 = AtomicU64::new(0);
    let probe = path.join(format!(".pre-midi-write-test-{}-{}", std::process::id(), PROBE.fetch_add(1, Ordering::Relaxed)));
    let file = fs::OpenOptions::new().write(true).create_new(true).open(&probe)?;
    drop(file);
    fs::remove_file(probe)?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Folder(PathBuf);
    impl Folder {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let path = std::env::temp_dir().join(format!("premidi-storage-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
        fn executable(&self) -> PathBuf { self.0.join("pre-midi.exe") }
        fn mark(&self) { fs::write(self.0.join("portable.txt"), "pre-midi portable edition\n").unwrap(); }
    }
    impl Drop for Folder { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }

    #[test]
    fn installed_mode_does_not_create_portable_folders() {
        let folder = Folder::new();
        assert!(Storage::portable(&folder.executable()).unwrap().is_none());
        assert!(!folder.0.join("data").exists());
    }

    #[test]
    fn portable_data_moves_with_the_executable_and_profiles_stay_separate() {
        let folder = Folder::new(); folder.mark();
        let paths = Storage::portable(&folder.executable()).unwrap().unwrap();
        fs::write(paths.webview.as_ref().unwrap().join("saved-recording.wav"), b"recording").unwrap();
        assert_eq!(paths.export_directory("beat.zip"), Some(folder.0.join("projects").as_path()));
        assert_eq!(paths.export_directory("song.wav"), Some(folder.0.join("exports").as_path()));
        let moved = Folder::new();
        let moved_root = moved.0.join("moved app");
        fs::rename(&folder.0, &moved_root).unwrap();
        let paths = Storage::portable(&moved_root.join("pre-midi.exe")).unwrap().unwrap();
        assert_eq!(fs::read(paths.webview.unwrap().join("saved-recording.wav")).unwrap(), b"recording");
        let other = Folder::new(); other.mark();
        let other_paths = Storage::portable(&other.executable()).unwrap().unwrap();
        assert!(!other_paths.webview.unwrap().join("saved-recording.wav").exists());
    }

    #[test]
    fn broken_portable_folder_is_an_error_without_profile_fallback() {
        let folder = Folder::new(); folder.mark();
        fs::write(folder.0.join("data"), "not a directory").unwrap();
        assert!(Storage::portable(&folder.executable()).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn portable_data_cannot_escape_through_a_symlink() {
        let folder = Folder::new(); folder.mark(); let outside = Folder::new();
        std::os::unix::fs::symlink(&outside.0, folder.0.join("data")).unwrap();
        assert!(Storage::portable(&folder.executable()).is_err());
        assert!(!outside.0.join("webview").exists());
    }
}
