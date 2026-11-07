// Shared monochrome control icons. Contexts provide actions, never alternate glyphs.
const paths={
 undo:['M9 5 4 10l5 5','M4 10h9a6 6 0 0 1 0 12'],
 redo:['m15 5 5 5-5 5','M20 10h-9a6 6 0 0 0 0 12'],
 sound:['M9 18V5l11-2v13','M9 5l11-2','M9 16a3 3 0 1 0 0 .1','M20 14a3 3 0 1 0 0 .1'],
 trim:['M8 3v18','m4 7 4-4 4 4','M13 12h7'],
 onset:['M5 4v16','M9 12h11','m13 8-4 4 4 4','M18 8v8','M21 10v4'],
 restore:['m7 3-4 4 4 4','M3 7h10a7 7 0 1 1-6 11'],
 duplicate:['M8 8h12v12H8z','M16 8V4H4v12h4'],
 toBeat:['M3 4h7v6H3z','M3 14h7v6H3z','M14 4h7v6h-7z','M13 17h8','m18 14 3 3-3 3'],
 back:['M20 12H4','m10 6-6 6 6 6'],
 record:['M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z','M5 10v2a7 7 0 0 0 14 0v-2','M12 19v3','M8 22h8'],
 zoom:['M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z','m15 15 6 6']
};
export function createUIIcon(name,size=18){
 if(!paths[name])throw Error('Unknown UI icon '+name);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 for(const [key,value] of Object.entries({viewBox:'0 0 24 24',width:size,height:size,fill:'none',stroke:'currentColor','stroke-width':1.7,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,String(value));
 for(const d of paths[name]){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}
 return svg;
}
export function setIconButton(button,name,label,size=18){
 button.replaceChildren(createUIIcon(name,size));button.title=label;
 button.setAttribute('aria-label',label);return button;
}
