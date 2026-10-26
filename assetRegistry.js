// Runtime binary asset owner. A score contains ONLY metadata and relative paths;
// the byte payload is carried in the companion ZIP and browser IndexedDB.
export const MAX_ASSET_BYTES=1_000_000;
export const MAX_PACKAGE_BYTES=64_000_000;
// Portable ZIP currently tops out at 64 MB; this is a separate vocal limit.
export const MAX_RECORDING_BYTES=48_000_000;
const binary=new Map();
export function putAsset(id,bytes,{longForm=false}={}){
 if(typeof id!=="string"||!id||!/^[\w-]+$/.test(id))throw Error("Invalid audio asset ID.");
 if(!(bytes instanceof Uint8Array)||bytes.length<16||bytes.length>(longForm?MAX_RECORDING_BYTES:MAX_ASSET_BYTES))
  throw Error(longForm?"Vocal recording exceeds 48 MB.":"Audio sample exceeds 1 MB.");
 // Own our own immutable copy; do not expose mutable bytes.
 binary.set(id,new Uint8Array(bytes));
}
export function getAsset(id){const bytes=binary.get(id);return bytes?new Uint8Array(bytes):null;}
export function requiredAssets(score){
 return [...new Set((score.samples||[]).map(asset=>asset.id))];
}
export function missingAssets(score){return requiredAssets(score).filter(id=>!binary.has(id));}
export function allAssets(){return [...binary].map(([id,bytes])=>[id,new Uint8Array(bytes)]);}
export function clearAssets(){binary.clear();}
