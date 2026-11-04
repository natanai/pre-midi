"""Collect a complete architecture-specific release set; never upload build trees."""
import sys,json,hashlib,shutil,zipfile,base64,os,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
version=json.loads((root/'package.json').read_text())['version']
target=sys.argv[1]; build=root/'desktop/target'/target/'release'; bundle=build/'bundle'
portable_only='--windows-portable-only' in sys.argv[2:]
out=root/'release';out.mkdir(exist_ok=True)
platform='windows' if 'windows' in target else 'darwin' if 'apple' in target else 'linux'
arch='aarch64' if target.startswith('aarch64') else 'x86_64'
artifacts=[]
if portable_only and platform!='windows':raise RuntimeError('Portable preview requires a Windows target')
def collect(pattern,kind,extension):
 matches=list(bundle.glob(pattern))
 if len(matches)!=1:raise RuntimeError(f'Expected exactly one {pattern}, got {matches}')
 source=matches[0];name=f'pre-midi-{version}-{platform}-{arch}-{kind}.{extension}'
 dest=out/name;shutil.copyfile(source,dest)
 signature=None
 sig=Path(str(source)+'.sig')
 if sig.exists():
  signature=sig.read_text().strip()
  comment=base64.b64decode(signature).decode()
  if not any(field.splitlines()[0]=='version:'+version for field in comment.split('\t') if field):raise RuntimeError('Updater signature does not bind the release version')
  (out/(name+'.sig')).write_text(signature+'\n')
 data=dest.read_bytes()
 if len(data)<1_000_000:raise RuntimeError('Truncated desktop package')
 artifacts.append(dict(name=name,platform=platform,arch=arch,kind=kind,size=len(data),sha256=hashlib.sha256(data).hexdigest(),signature=signature))
if platform=='windows':
 if not portable_only:collect('nsis/*.exe','installer','exe')
 if (build/'pre-midi.exe').stat().st_size<1_000_000:raise RuntimeError('Missing or truncated portable executable')
 name=f'pre-midi-{version}-windows-{arch}-portable.zip'
 with zipfile.ZipFile(out/name,'w',zipfile.ZIP_DEFLATED) as z:
  z.write(build/'pre-midi.exe','pre-midi.exe')
  z.writestr('version.txt',version)
  z.write(root/'native/THIRD-PARTY-NOTICES.txt','THIRD-PARTY-NOTICES.txt')
  for notice in sorted((root/'native/licenses').glob('*.txt')):z.write(notice,'licenses/'+notice.name)
  z.writestr('portable.txt','pre-midi portable edition\n')
  for folder in ['data/','projects/','exports/']:z.writestr(folder,'')
  z.writestr('README.txt','''pre-midi portable - Windows 11 x64

Extract the whole ZIP into a writable folder and open pre-midi.exe.
Keep portable.txt beside the executable: it selects folder-local storage.

data/webview/  presets, settings, autosaved music, recordings and WebView cache
projects/      default location for project and music ZIP exports
exports/       default location for WAV exports

Close pre-midi before moving, copying or backing up the entire folder. Each
portable folder has its own profile and does not share the installer profile.
Save dialogs start inside this folder; choosing another destination explicitly
can save outside it. A read-only portable folder produces an error, with no
fallback to AppData. WebView2 Runtime is an OS dependency, normally on Windows
11; Windows may maintain its own runtime, temporary files and system records.

Updates: select Settings > updates > preview (or stable) > check for updates.
With a signed build, the portable updater verifies the release, closes pre-midi,
replaces only application files and automatically restores the previous version
if installation or startup fails. KEEP data/, projects/ and exports/.
Unsigned builds use manual ZIP updates and never install automatically.
Manual updates: close pre-midi and back up this folder, then replace only
pre-midi.exe, portable.txt, README.txt, THIRD-PARTY-NOTICES.txt and licenses/.

Migrating from preview.1 or preview.2: close all pre-midi windows first.
Those versions saved data in %LOCALAPPDATA%/app.premidi.studio/webview.
Before first launch, copy that webview folder into this folder's data/.
Do not copy a live WebView profile. The original is left untouched. Alternatively,
export music ZIPs in the old edition and import them here (presets/settings
need the profile copy). A plain .premidi file does not include recorded WAVs.
''')
 signature=None
 if os.environ.get('TAURI_SIGNING_PRIVATE_KEY') and os.environ.get('TAURI_UPDATER_PUBLIC_KEY'):
  subprocess.run(['node','node_modules/@tauri-apps/cli/tauri.js','signer','sign','--app-version',version,str(out/name)],cwd=root,check=True)
  sig=out/(name+'.sig')
  if not sig.exists():raise RuntimeError('Portable update signature missing')
  signature=sig.read_text().strip()
  decoded=base64.b64decode(signature).decode('utf8')
  if 'version:'+version not in decoded:raise RuntimeError('Portable update signature lacks version binding')
 data=(out/name).read_bytes();artifacts.append(dict(name=name,platform=platform,arch=arch,kind='portable',size=len(data),sha256=hashlib.sha256(data).hexdigest(),signature=signature))
elif platform=='darwin':
 collect('dmg/*.dmg','installer','dmg')
 if list(bundle.glob('macos/*.app.tar.gz')):collect('macos/*.app.tar.gz','updater','app.tar.gz')
else:
 collect('appimage/*.AppImage','portable','AppImage');collect('deb/*.deb','package','deb')
(out/f'artifacts-{platform}-{arch}.json').write_text(json.dumps(artifacts,indent=2)+'\n')
for item in artifacts:print(item['name'])
