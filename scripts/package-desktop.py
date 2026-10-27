"""Collect a complete architecture-specific release set; never upload build trees."""
import sys,json,hashlib,shutil,zipfile,base64,os
from pathlib import Path
root=Path(__file__).resolve().parent.parent
version=json.loads((root/'package.json').read_text())['version']
target=sys.argv[1]; build=root/'desktop/target'/target/'release'; bundle=build/'bundle'
out=root/'release';out.mkdir(exist_ok=True)
platform='windows' if 'windows' in target else 'darwin' if 'apple' in target else 'linux'
arch='aarch64' if target.startswith('aarch64') else 'x86_64'
artifacts=[]
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
  if ('\tversion:'+version) not in comment:raise RuntimeError('Updater signature does not bind the release version')
  (out/(name+'.sig')).write_text(signature+'\n')
 data=dest.read_bytes()
 if len(data)<1_000_000:raise RuntimeError('Truncated desktop package')
 artifacts.append(dict(name=name,platform=platform,arch=arch,kind=kind,size=len(data),sha256=hashlib.sha256(data).hexdigest(),signature=signature))
if platform=='windows':
 collect('nsis/*.exe','installer','exe')
 name=f'pre-midi-{version}-windows-{arch}-portable.zip'
 with zipfile.ZipFile(out/name,'w',zipfile.ZIP_DEFLATED) as z:
  z.write(build/'pre-midi.exe','pre-midi.exe')
  z.writestr('portable.txt','pre-midi portable edition\n')
  z.writestr('README.txt','Windows 11 x64. Extract the whole ZIP and open pre-midi.exe. WebView2 Runtime is required (normally included in Windows 11). Data stays in your user profile, not this folder. To update, extract a newer ZIP in a separate folder. Automatic installation is available in the installer edition.\n')
 data=(out/name).read_bytes();artifacts.append(dict(name=name,platform=platform,arch=arch,kind='portable',size=len(data),sha256=hashlib.sha256(data).hexdigest(),signature=None))
elif platform=='darwin':
 collect('dmg/*.dmg','installer','dmg')
 if list(bundle.glob('macos/*.app.tar.gz')):collect('macos/*.app.tar.gz','updater','app.tar.gz')
else:
 collect('appimage/*.AppImage','portable','AppImage');collect('deb/*.deb','package','deb')
(out/f'artifacts-{platform}-{arch}.json').write_text(json.dumps(artifacts,indent=2)+'\n')
for item in artifacts:print(item['name'])
