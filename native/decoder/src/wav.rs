//! Bounded RIFF PCM/float reader. Some demuxers cap the WAV channel mask at
//! 18 positions; a studio AudioBuffer may instead contain 32 discrete channels.
use crate::DecodedAudio;
fn u16le(b:&[u8])->u16{u16::from_le_bytes(b[..2].try_into().unwrap())}
fn u32le(b:&[u8])->u32{u32::from_le_bytes(b[..4].try_into().unwrap())}
pub fn decode(bytes:&[u8])->Result<Option<DecodedAudio>,String>{
 if bytes.len()<12||&bytes[..4]!=b"RIFF"||&bytes[8..12]!=b"WAVE"{return Ok(None);}
 let end=(u32le(&bytes[4..]) as usize).checked_add(8).ok_or("Invalid WAV length")?;if end>bytes.len()||end<12{return Err("Truncated WAV RIFF data".into());}
 let (mut format,mut data)=(None,None);let mut at=12usize;
 while at+8<=end{
  let size=u32le(&bytes[at+4..]) as usize;let start=at+8;let stop=start.checked_add(size).ok_or("Invalid WAV chunk length")?;
  if stop>end{return Err("Truncated WAV chunk".into());}
  if &bytes[at..at+4]==b"fmt "&&format.is_none(){format=Some(&bytes[start..stop]);}
  if &bytes[at..at+4]==b"data"&&data.is_none(){data=Some(&bytes[start..stop]);}
  at=stop.checked_add(size%2).ok_or("Invalid WAV padding")?;
 }
 let fmt=format.ok_or("WAV format chunk is missing")?;if fmt.len()<16{return Err("Truncated WAV format".into());}
 let mut tag=u16le(fmt);let channels=u16le(&fmt[2..]) as u32;let rate=u32le(&fmt[4..]);let block=u16le(&fmt[12..]) as usize;let bits=u16le(&fmt[14..]) as usize;
 if tag==0xfffe {
  if fmt.len()<40||u16le(&fmt[16..])<22{return Err("Truncated extensible WAV format".into());}
  if fmt[26..40]!=[0,0,0,0,16,0,128,0,0,170,0,56,155,113]{return Ok(None);}
  tag=u16le(&fmt[24..]);
 }
 if tag!=1&&tag!=3{return Ok(None);}
 if !(3000..=768000).contains(&rate)||!(1..=32).contains(&channels)||!(tag==1&&[8,16,24,32].contains(&bits)||tag==3&&[32,64].contains(&bits))||block!=channels as usize*(bits/8){return Err("Invalid WAV PCM dimensions".into());}
 let data=data.ok_or("WAV data chunk is missing")?;let frames=data.len()/block;if frames==0||frames>rate as usize*301||frames*channels as usize>128_000_000{return Err("WAV exceeds decoded duration/memory budget".into());}
 let width=bits/8;let mut result=DecodedAudio{samples:Vec::with_capacity(frames*channels as usize),rate,channels,peak:0.};
 for frame in 0..frames{for channel in 0..channels as usize{
  let p=&data[frame*block+channel*width..];
  let value=match (tag,bits){(1,8)=>(p[0] as f32-128.)/128.,(1,16)=>i16::from_le_bytes(p[..2].try_into().unwrap()) as f32/32768.,(1,24)=>((u32::from_le_bytes([p[0],p[1],p[2],0])<<8) as i32>>8) as f32/8388608.,(1,32)=>i32::from_le_bytes(p[..4].try_into().unwrap()) as f32/2147483648.,(3,32)=>f32::from_le_bytes(p[..4].try_into().unwrap()),(3,64)=>f64::from_le_bytes(p[..8].try_into().unwrap()) as f32,_=>unreachable!()};
  if !value.is_finite()||value.abs()>32.{return Err("Invalid WAV PCM value".into());}if frame%4==0{result.peak=result.peak.max(value.abs());}result.samples.push(value);
 }}
 Ok(Some(result))
}
