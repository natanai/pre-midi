// Matroska CodecDelay and per-Block DiscardPadding are container timing, not
// compressed Opus data. Symphonia 0.6.1 currently drops DiscardPadding.
// https://www.matroska.org/technical/notes.html#timestamps
use std::collections::HashMap;
#[derive(Default)]pub struct TrackTiming{pub delay:u64,pub skip:u64,pub padding:Vec<i64>}
#[derive(Default)]pub struct Timing{pub scale:u64,pub tracks:HashMap<u32,TrackTiming>}
fn vint(bytes:&[u8],at:&mut usize,id:bool)->Result<(u64,bool),String>{
 let first=*bytes.get(*at).ok_or("Truncated EBML integer")?;if first==0{return Err("Invalid EBML integer".into());}
 let width=first.leading_zeros() as usize+1;if width>8||*at+width>bytes.len(){return Err("Invalid EBML integer width".into());}
 let mut value=if id{first as u64}else{(first&((1u8<<(8-width))-1)) as u64};
 for b in &bytes[*at+1..*at+width]{value=(value<<8)|*b as u64;}*at+=width;
 Ok((value,!id&&value==(1u64<<(7*width))-1))
}
fn fields(bytes:&[u8])->Result<Vec<(u64,&[u8])>,String>{
 let mut at=0;let mut out=vec![];while at<bytes.len(){
  if out.len()>300_000{return Err("EBML element limit exceeded".into());}
  let(id,_)=vint(bytes,&mut at,true)?;let(size,unknown)=vint(bytes,&mut at,false)?;
  let end=if unknown{bytes.len()}else{at.checked_add(size.try_into().map_err(|_|"EBML size overflow")?).ok_or("EBML size overflow")?};
  if end>bytes.len(){return Err("Truncated EBML element".into());}out.push((id,&bytes[at..end]));at=end;
 }Ok(out)
}
fn unsigned(b:&[u8])->Result<u64,String>{if b.is_empty()||b.len()>8{return Err("Invalid EBML number".into());}Ok(b.iter().fold(0,|a,b|(a<<8)|*b as u64))}
fn signed(b:&[u8])->Result<i64,String>{let v=unsigned(b)?;Ok(if b.len()<8&&b[0]&128!=0{(v|(!0u64<<(b.len()*8))) as i64}else{v as i64})}
fn block(bytes:&[u8],padding:i64,out:&mut Timing)->Result<(),String>{
 let mut at=0;let(track,_)=vint(bytes,&mut at,false)?;if track==0||track>u32::MAX as u64||at+3>bytes.len(){return Err("Invalid WebM block".into());}
 let flags=bytes[at+2];let frames=if flags&6==0{1}else{*bytes.get(at+3).ok_or("Invalid WebM lacing")? as usize+1};
 let t=out.tracks.entry(track as u32).or_default();if t.padding.len()+frames>250_000{return Err("WebM packet limit exceeded".into());}
 for n in 0..frames{t.padding.push(if (padding>=0&&n+1==frames)||(padding<0&&n==0){padding}else{0});}Ok(())
}
fn cluster(data:&[u8],out:&mut Timing)->Result<(),String>{
 let mut pending=vec![data];let mut count=0;
 while let Some(data)=pending.pop(){count+=1;if count>250_000{return Err("WebM cluster limit exceeded".into());}
  for(id,data)in fields(data)?{match id{
   0xa3=>block(data,0,out)?,
   0xa0=>{let mut contents=None;let mut padding=0;for(id,data)in fields(data)?{match id{0xa1=>contents=Some(data),0x75a2=>padding=signed(data)?,_=>{}}}if let Some(contents)=contents{block(contents,padding,out)?;}},
   // MediaRecorder can emit unknown-sized Clusters. The next level-one
   // Cluster ends that scope; process it iteratively without recursive depth.
   0x1f43b675=>pending.push(data),_=>{}
  }}
 }Ok(())
}
pub fn read(bytes:&[u8])->Result<Option<Timing>,String>{
 if !bytes.starts_with(&[0x1a,0x45,0xdf,0xa3]){return Ok(None);}
 let mut out=Timing{scale:1_000_000,..Default::default()};
 for(id,data)in fields(bytes)?{if id!=0x18538067{continue;}for(id,data)in fields(data)?{match id{
  0x1549a966=>for(id,data)in fields(data)?{if id==0x2ad7b1{out.scale=unsigned(data)?;if out.scale==0||out.scale>1_000_000_000{return Err("Invalid WebM timestamp scale".into());}}},
  0x1654ae6b=>for(id,data)in fields(data)?{if id!=0xae{continue;}let mut number=0;let mut delay=0;let mut skip=0;for(id,data)in fields(data)?{match id{0xd7=>number=unsigned(data)?,0x56aa=>delay=unsigned(data)?,0x63a2=>if data.starts_with(b"OpusHead")&&data.len()>=12{skip=u16::from_le_bytes([data[10],data[11]]) as u64;},_=>{}}}if number==0||number>u32::MAX as u64||delay>10_000_000_000{return Err("Invalid WebM track timing".into());}let t=out.tracks.entry(number as u32).or_default();t.delay=delay;t.skip=skip;},
  0x1f43b675=>cluster(data,&mut out)?,
  _=>{}
 }}}
 Ok(Some(out))
}
pub fn front(t:&TrackTiming,scale:u64,rate:u32)->Result<usize,String>{
 // FFmpeg/Chromium present negative WebM packet timestamps in segment ticks.
 // Round CodecDelay to those ticks, then discard only the part not already
 // removed by the OpusHead pre-skip in the decoder. Never apply it twice.
 let ticks=(t.delay+scale/2)/scale;let delay=(ticks as u128*scale as u128*rate as u128+500_000_000)/1_000_000_000;
 let skip=t.skip as u128*rate as u128/48000;usize::try_from(delay.saturating_sub(skip)).map_err(|_|"WebM delay overflow".into())
}
pub fn padding_frames(ns:i64,rate:u32)->Result<usize,String>{
 let frames=(ns.unsigned_abs() as u128*rate as u128+500_000_000)/1_000_000_000;
 usize::try_from(frames).map_err(|_|"WebM padding overflow".into())
}
#[cfg(test)]mod tests{
 use super::*;
 fn element(id:&[u8],data:&[u8])->Vec<u8>{let mut out=id.to_vec();assert!(data.len()<127);out.push(0x80|data.len() as u8);out.extend(data);out}
 #[test]fn malformed_sizes_and_padding_are_bounded(){
  assert!(read(&[0x1a,0x45,0xdf,0xa3,0x88]).is_err());
  assert_eq!(front(&TrackTiming{delay:6_500_000,skip:312,..Default::default()},1_000_000,48000).unwrap(),24);
  assert_eq!(padding_frames(13_500_000,48000).unwrap(),648);
 }
 #[test]fn unknown_cluster_sizes_preserve_following_packet_order(){
  let first=element(&[0xa3],&[0x81,0,0,0,42]);let second=element(&[0xa3],&[0x81,0,20,0,43]);
  let mut clusters=vec![0x1f,0x43,0xb6,0x75,0xff];clusters.extend(first);clusters.extend(element(&[0x1f,0x43,0xb6,0x75],&second));
  let mut file=element(&[0x1a,0x45,0xdf,0xa3],&[]);file.extend(element(&[0x18,0x53,0x80,0x67],&clusters));
  let parsed=read(&file).unwrap().unwrap();assert_eq!(parsed.tracks[&1].padding,[0,0]);
 }
}
