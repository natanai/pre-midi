//! Bounded control-thread decoding. No decoder or owned buffer enters a callback.
mod mp4;
mod webm;
use std::io::Cursor;
use symphonia::core::{codecs::{audio::AudioDecoderOptions,registry::CodecRegistry},formats::{FormatOptions,TrackType,probe::Hint},io::MediaSourceStream};
use symphonia_adapter_libopus::OpusDecoder;

pub struct DecodedAudio {pub samples:Vec<f32>,pub rate:u32,pub channels:u32,pub peak:f32}
// Some shipped PCM WAVs have a 20-byte fmt chunk with empty extension words.
// Browsers accept it; canonicalize that container header without changing PCM.
fn normalize_pcm_wav(mut bytes:Vec<u8>)->Result<Vec<u8>,String>{
 if bytes.len()<12||&bytes[..4]!=b"RIFF"||&bytes[8..12]!=b"WAVE"{return Ok(bytes);}
 let mut at=12usize;
 while at+8<=bytes.len(){
  let size=u32::from_le_bytes(bytes[at+4..at+8].try_into().unwrap()) as usize;
  let end=at.checked_add(8).and_then(|x|x.checked_add(size)).ok_or("Invalid WAV chunk size")?;
  if end+size%2>bytes.len(){return Err("Truncated WAV chunk".into());}
  if &bytes[at..at+4]==b"fmt "&&size>=16{
   let tag=u16::from_le_bytes(bytes[at+8..at+10].try_into().unwrap());
   if (tag==1||tag==3)&&size>16{
    let padding=size%2;bytes.drain(at+24..end+padding);bytes[at+4..at+8].copy_from_slice(&16u32.to_le_bytes());let length=(bytes.len()-8) as u32;bytes[4..8].copy_from_slice(&length.to_le_bytes());
   }
   return Ok(bytes);
  }
  at=end+(size%2);
 }
 Ok(bytes)
}
pub fn decode(bytes:Vec<u8>,extension:&str)->Result<DecodedAudio,String>{
 if bytes.len()<16||bytes.len()>48_000_000{return Err("Audio asset must be 16 bytes to 48 MB".into());}
 if !["","wav","mp3","ogg","webm","mp4"].contains(&extension){return Err("Unsupported audio container".into());}
 let bytes=normalize_pcm_wav(bytes)?;let edits=mp4::read(&bytes)?;let webm=webm::read(&bytes)?;
 let mut hint=Hint::new();if !extension.is_empty(){hint.with_extension(extension);}
 let stream=MediaSourceStream::new(Box::new(Cursor::new(bytes)),Default::default());
 let mut format=symphonia::default::get_probe().probe(&hint,stream,FormatOptions::default(),Default::default()).map_err(|e|format!("Invalid audio container: {e}"))?;
 let track=format.default_track(TrackType::Audio).ok_or("Audio asset has no audio track")?;
 let params=track.codec_params.as_ref().and_then(|p|p.audio()).ok_or("Missing audio codec parameters")?;
 let mut registry=CodecRegistry::new();symphonia::default::register_enabled_codecs(&mut registry);registry.register_audio_decoder::<OpusDecoder>();
 let mut decoder=registry.make_audio_decoder(params,&AudioDecoderOptions::default()).map_err(|e|format!("Audio codec: {e}"))?;
 let track_id=track.id;let mut result=DecodedAudio{samples:Vec::new(),rate:0,channels:0,peak:0.};let mut packets=0usize;let mut audio_packets=0usize;
 while let Some(packet)=format.next_packet().map_err(|e|format!("Invalid audio packet: {e}"))?{
  packets+=1;if packets>250_000{return Err("Audio packet limit exceeded".into());}if packet.track_id!=track_id{continue;}
  let buffer=decoder.decode(&packet).map_err(|e|format!("Cannot decode audio packet: {e}"))?;
  let rate=buffer.spec().rate();let channels=buffer.spec().channels().count() as u32;
  if !(8000..=192000).contains(&rate)||!(1..=2).contains(&channels){return Err("Audio must be mono/stereo at 8–192 kHz".into());}
  if result.rate!=0&&(result.rate!=rate||result.channels!=channels){return Err("Audio format changed within the asset".into());}
  result.rate=rate;result.channels=channels;
  let size=buffer.samples_interleaved();let begin=result.samples.len();let end=begin.checked_add(size).ok_or("Decoded audio overflow")?;
  if end>rate as usize*channels as usize*301||end>128_000_000{return Err("Decoded audio exceeds 301 seconds or 512 MB".into());}
  result.samples.resize(end,0.);buffer.copy_to_slice_interleaved(&mut result.samples[begin..]);
  if result.samples[begin..].iter().any(|x|!x.is_finite()||x.abs()>32.){return Err("Invalid decoded audio values".into());}
  if let Some(timing)=webm.as_ref().and_then(|w|w.tracks.get(&track_id)){
   let padding=*timing.padding.get(audio_packets).ok_or("Missing WebM packet timing")?;
   let front=if audio_packets==0{webm::front(timing,webm.as_ref().unwrap().scale,rate)?}else{0}+if padding<0{webm::padding_frames(padding,rate)?}else{0};
   let back=if padding>0{webm::padding_frames(padding,rate)?}else{0};let frames=size/channels as usize;
   if front+back>frames{return Err("WebM padding exceeds decoded packet".into());}
   if front>0{result.samples.copy_within(begin+front*channels as usize..end,begin);}
   result.samples.truncate(end-(front+back)*channels as usize);
  }
  audio_packets+=1;
 }
 if let Some(edit)=edits.iter().find(|e|e.id==track_id){mp4::apply(&mut result.samples,result.rate,result.channels,edit)?;}
 if result.samples.is_empty(){return Err("Decoded audio is empty".into());}
 // Match existing studio normalization: inspect every fourth sample per channel.
 for frame in (0..result.samples.len()/result.channels as usize).step_by(4){for ch in 0..result.channels as usize{result.peak=result.peak.max(result.samples[frame*result.channels as usize+ch].abs());}}
 Ok(result)
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn pcm_fmt_extensions_preserve_every_sample(){
  let source=include_bytes!("../tests/fixtures/tone.wav");let standard=decode(source.to_vec(),"wav").unwrap();
  let mut extended=source.to_vec();let at=extended.windows(4).position(|v|v==b"fmt ").unwrap();let size=u32::from_le_bytes(extended[at+4..at+8].try_into().unwrap()) as usize;
  extended.splice(at+8+size..at+8+size,[0u8;4]);extended[at+4..at+8].copy_from_slice(&((size+4) as u32).to_le_bytes());let length=(extended.len()-8) as u32;extended[4..8].copy_from_slice(&length.to_le_bytes());
  assert_eq!(standard.samples,decode(extended,"").unwrap().samples);
 }
 #[test]fn malformed_inputs_fail(){for extension in ["wav","mp3","ogg","webm","mp4","exe"]{assert!(decode(vec![0;256],extension).is_err());}assert!(decode(vec![0;4],"wav").is_err());}
}
