// One iOS Files/Share delivery path for Beat, Song, ZIP and rendered WAV.
// A second real button press is required after asynchronous WAV rendering:
// iOS Web Share requires a fresh user gesture, not a stale async callback.
const extensions=new Map([
 [".premidi","application/json"],
 [".zip","application/zip"],
 [".wav","audio/wav"]
]);
export function makeTransferFile(blob,name,FileType=globalThis.File){
 if(!(blob instanceof Blob)||!blob.size||typeof name!=="string"||
  name.length>180||!name.trim()||/[\\/\x00-\x1f]/.test(name))throw Error("Invalid exported file.");
 const ext=[...extensions.keys()].find(key=>name.toLowerCase().endsWith(key));
 if(!ext)throw Error("Unsupported music file extension.");
 if(typeof FileType!=="function")throw Error("File handling unavailable.");
 return new FileType([blob],name,{type:extensions.get(ext)});
}
export function canShareFile(file,webNavigator=globalThis.navigator){
 if(typeof webNavigator?.share!=="function")return false;
 try{return typeof webNavigator.canShare!=="function"||
  !!webNavigator.canShare({files:[file]});}catch{return false;}
}
export function shareFile(file,webNavigator=globalThis.navigator){
 if(!canShareFile(file,webNavigator))throw Error("File sharing is not available here; use Download instead.");
 return webNavigator.share({files:[file],title:file.name});
}
