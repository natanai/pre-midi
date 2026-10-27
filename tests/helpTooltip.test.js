import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {placeHelp,helpForLabel} from "../dial.js";

const css=readFileSync(new URL("../style.css",import.meta.url),"utf8");
const js=readFileSync(new URL("../dial.js",import.meta.url),"utf8");

test("tooltip can extend beyond the inspector without being clipped",()=>{
 assert.match(css,/\.floating-help\s*\{[^}]*position:fixed/s);
 assert.match(css,/\.floating-help\s*\{[^}]*z-index:2147483647/s);
 assert.match(css,/\.floating-help\[hidden\]/);
 assert.doesNotMatch(css,/\.control-help::after|\.unit-help::after/);
 assert.match(js,/doc\.body\.append\(tooltip\)/);
 assert.match(js,/\.control-help,\.unit-help/);
 assert.equal(helpForLabel("tone wave"),"more waaaah per note");
});

test("tooltips stay inside the viewport at left and right pane boundaries",()=>{
 const screen={left:0,top:0,width:1600,height:900};
 const tooltip={width:215,height:42};
 const left=placeHelp({left:2,right:48,top:410,bottom:430,width:46,height:20},tooltip,screen);
 const right=placeHelp({left:1560,right:1598,top:410,bottom:430,width:38,height:20},tooltip,screen);
 for(const positioned of [left,right]){
  assert.ok(positioned.left>=8);
  assert.ok(positioned.left+tooltip.width<=screen.width-8);
  assert.ok(positioned.top>=8);
  assert.ok(positioned.top+tooltip.height<=screen.height-8);
 }
});

test("tooltips flip under labels near the top and clamp near the bottom",()=>{
 const screen={left:0,top:0,width:390,height:844};
 const bubble={width:245,height:85};
 const top=placeHelp({left:220,right:280,top:3,bottom:23,width:60,height:20},bubble,screen);
 const bottom=placeHelp({left:220,right:280,top:820,bottom:840,width:60,height:20},bubble,screen);
 assert.ok(top.top>=23);
 assert.ok(bottom.top+bubble.height<=screen.height-8);
 assert.ok(top.left>=8&&top.left+bubble.width<=screen.width-8);
});

test("tooltips respect a panned visual viewport",()=>{
 const screen={left:110,top:240,width:310,height:300};
 const bubble={width:210,height:60};
 const positioned=placeHelp({left:390,right:410,top:255,bottom:275,width:20,height:20},bubble,screen);
 assert.ok(positioned.left>=118);
 assert.ok(positioned.left+bubble.width<=412);
 assert.ok(positioned.top>=248);
 assert.ok(positioned.top+bubble.height<=532);
});

test("labels and units, not the knobs, own hover triggers",()=>{
 assert.match(js,/doc\.addEventListener\("pointerover"/);
 assert.match(js,/const target=nodeFor\(event\.target\)/);
 assert.match(js,/doc\.addEventListener\("click"/);
 assert.match(js,/doc\.addEventListener\("keydown"/);
 assert.match(js,/event\.key==="Escape"/);
 assert.match(js,/doc\.addEventListener\("scroll"/);
 assert.equal((js.match(/if\(target&&target===state\.target/g)||[]).length,2,
  "pointer and focus exits must ignore non-help elements");
 assert.doesNotMatch(js,/knob\.addEventListener\("pointerover"/);
});
