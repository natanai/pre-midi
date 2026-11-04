import test from "node:test";
import assert from "node:assert/strict";
import {
 WAVEFORM_ZOOMS,maxTrimSeconds,normalizeTrimSeconds,waveformWindow,
 waveformXAtTime,waveformTimeAtX,waveformPeaksFromBuffer,waveformPeaksFromOverview
} from "../audioWaveform.js";
test("source-time trim has a millisecond resolution and never removes the last ten milliseconds",()=>{
 assert.equal(maxTrimSeconds(2),1.99);
 assert.equal(normalizeTrimSeconds(-.1,2),0);
 assert.equal(normalizeTrimSeconds(.18449,2),.184);
 assert.equal(normalizeTrimSeconds(.18451,2),.185);
 assert.equal(normalizeTrimSeconds(20,2),1.99);
 assert.throws(()=>normalizeTrimSeconds(NaN,2),/finite/);
 assert.throws(()=>maxTrimSeconds(.005),/10 ms/);
});
test("zoom and normalized pointer mapping preserve source-time positions without Song BPM",()=>{
 assert.deepEqual(WAVEFORM_ZOOMS,[1,2,4,8,16,32,64]);
 const w=waveformWindow(4,1,4);
 assert.equal(w.start,.75);assert.equal(w.end,1.75);
 assert.equal(waveformXAtTime(1,w),120);
 assert.equal(waveformTimeAtX(120,w),1);
 assert.equal(waveformTimeAtX(-30,w),.75);
 assert.equal(waveformTimeAtX(500,w),1.75);
 assert.deepEqual(waveformWindow(4,0,8),{start:0,end:.5,duration:.5});
 assert.deepEqual(waveformWindow(4,4,8),{start:3.5,end:4,duration:.5});
 assert.throws(()=>waveformWindow(4,0,3),/zoom/);
});
test("zoomed waveform uses actual decoded PCM, retaining a quiet onset and channel information",()=>{
 const rate=32000,frames=rate,voice=new Float32Array(frames),other=new Float32Array(frames);
 voice[Math.floor(.122*rate)]=.125;other[Math.floor(.53*rate)]=.9;
 const audio={sampleRate:rate,numberOfChannels:2,length:frames,
  getChannelData:ch=>ch===0?voice:other};
 const peaks=waveformPeaksFromBuffer(audio,.1,.2,100);
 assert.equal(peaks.length,100);
 assert.ok(peaks.some(p=>Math.abs(p-.125)<.001),"Quiet source transient is retained");
 assert.ok(peaks.every(p=>p<=.125),"The later loud event must be outside the zoomed window");
 const loud=waveformPeaksFromBuffer(audio,.5,.6,100);
 assert.ok(loud.some(p=>Math.abs(p-.9)<.001),"Second audio channel is audible in the waveform");
 const empty=waveformPeaksFromOverview([.1,.8,.1,.2],1,0,.25,8);
 assert.ok(empty.every(v=>v===.1),"Overview peaks are time-mapped to the recording source");
});
