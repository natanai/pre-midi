import test from "node:test";
import assert from "node:assert/strict";
import {makeTransferFile,canShareFile,shareFile} from "../phone/fileDelivery.js";

test("phone exported project, ZIP and WAV files retain bytes, names and supported types",async()=>{
 for(const [name,expectedType] of [
  ["dream.premidi","application/json"],["sounds.zip","application/zip"],["beat.wav","audio/wav"]
 ]){
  const bytes=new Uint8Array([42,11,9]);
  const file=makeTransferFile(new Blob([bytes]),name);
  assert.equal(file.name,name);assert.equal(file.type,expectedType);
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()),bytes);
 }
 assert.throws(()=>makeTransferFile(new Blob(["x"]),"../unsafe.zip"),/Invalid exported file/);
 assert.throws(()=>makeTransferFile(new Blob(["x"]),"archive.exe"),/Unsupported music/);
 assert.throws(()=>makeTransferFile(new Blob([]),"empty.wav"),/Invalid exported file/);
});
test("phone Share sends an existing real File without changing or uploading the project",async()=>{
 const file=makeTransferFile(new Blob(["abc"]),"score.premidi");
 const calls=[],web={canShare:payload=>payload.files?.[0]===file,
  share:payload=>{calls.push(payload);return Promise.resolve();}};
 assert.equal(canShareFile(file,web),true);
 await shareFile(file,web);
 assert.equal(calls.length,1);
 assert.strictEqual(calls[0].files[0],file);
 assert.equal(calls[0].title,"score.premidi");
 assert.equal(canShareFile(file,{share:()=>{},canShare:()=>false}),false);
 assert.equal(canShareFile(file,{}),false);
 assert.throws(()=>shareFile(file,{}),/not available/);
});
