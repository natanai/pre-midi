import {processSourceChannels} from './source-kernel.js';
let queue=Promise.resolve();
self.onmessage=({data})=>{queue=queue.then(async()=>{
 try{const channels=await processSourceChannels(data.channels,data.rate,data.recipe);self.postMessage({id:data.id,channels},channels.map(c=>c.buffer));}
 catch(error){self.postMessage({id:data.id,error:String(error.message??error)});}
 });};
