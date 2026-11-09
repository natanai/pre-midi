import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
// Exercise the actual github-script policy without contacting GitHub or
// building packages. Script-only package edits must never request a release.
const workflow=readFileSync(new URL('../.github/workflows/desktop-release.yml',import.meta.url),'utf8'),lines=workflow.split('          script: |\n')[1].split('\n'),body=[];
for(const line of lines){if(line.trim()&&!line.startsWith('            '))break;body.push(line.slice(12));}
const evaluate=new (Object.getPrototypeOf(async function(){}).constructor)('require','context','github','core',body.join('\n'));
async function resolve({version='0.14.1-preview.29',previous=version,eventName='push',ref='refs/heads/main',inputs={},tagCommit=null}={}){
 const outputs={},calls={previous:0,tag:0},context={eventName,ref,repo:{owner:'natanai',repo:'pre-midi'},payload:{before:'before',inputs}};
 const require=name=>name==='fs'?{readFileSync:()=>JSON.stringify({version})}:{execFileSync:()=>'current\n'};
 const github={rest:{repos:{getContent:async()=>{calls.previous++;return {data:{content:Buffer.from(JSON.stringify({version:previous})).toString('base64')}};}},git:{getRef:async()=>{calls.tag++;if(tagCommit)return {data:{object:{sha:tagCommit}}};throw Object.assign(Error('missing tag'),{status:404});}}}};
 await evaluate(require,context,github,{setOutput:(key,value)=>outputs[key]=value});return {outputs,calls};
}
test('package-script edits skip Windows build and publication without touching an existing tag',async()=>{
 const {outputs,calls}=await resolve({tagCommit:'old'});assert.equal(outputs.build,'false');assert.equal(outputs.publish,'false');assert.equal(calls.previous,1);assert.equal(calls.tag,0);
});
test('a preview version bump requests a build/publication and refuses tag replacement',async()=>{
 const {outputs}=await resolve({version:'0.14.1-preview.30',previous:'0.14.1-preview.29'});assert.equal(outputs.build,'true');assert.equal(outputs.publish,'true');assert.equal(outputs.qualify,'false');await assert.rejects(resolve({version:'0.14.1-preview.30',previous:'0.14.1-preview.29',tagCommit:'old'}),/already points/);
});
test('explicit manual builds and qualified stable publication retain their existing policy',async()=>{
 const manual=await resolve({eventName:'workflow_dispatch',tagCommit:'old'});assert.equal(manual.outputs.build,'true');assert.equal(manual.outputs.publish,'false');assert.equal(manual.calls.previous,0);
 const stable=await resolve({eventName:'workflow_dispatch',version:'1.0.0',inputs:{publish_stable:'true'}});assert.equal(stable.outputs.publish,'true');assert.equal(stable.outputs.qualify,'true');assert.equal((await resolve({version:'1.0.0',previous:'0.9.0'})).outputs.build,'false');
 await assert.rejects(resolve({ref:'refs/tags/v0.14.1-preview.28'}),/Tag\/package/);
});
