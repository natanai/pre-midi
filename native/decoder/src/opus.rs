//! Multistream Opus adapter. Decoder objects and buffers remain control-side.
use std::ptr::NonNull;
use symphonia::core as symphonia_core;
use symphonia::core::{audio::{AsGenericAudioBufferRef,AudioBuffer,AudioMut,AudioSpec,GenericAudioBufferRef},codecs::{CodecInfo,audio::{AudioCodecParameters,AudioDecoder,AudioDecoderOptions,FinalizeResult,well_known::CODEC_ID_OPUS},registry::{RegisterableAudioDecoder,SupportedAudioCodec}},errors::{Error,Result},packet::PacketRef,support_audio_codec};
use symphonia_adapter_libopus::OpusDecoder;

pub struct Multistream {params:AudioCodecParameters,decoder:NonNull<opusic_sys::OpusMSDecoder>,buffer:AudioBuffer<f32>,pcm:Vec<f32>,channels:usize,skip:usize}
// libopus state is exclusively accessed through &mut self. Read-only methods
// expose immutable Rust-owned buffers; the raw pointer never escapes.
unsafe impl Send for Multistream {}
unsafe impl Sync for Multistream {}
impl Drop for Multistream {fn drop(&mut self){unsafe{opusic_sys::opus_multistream_decoder_destroy(self.decoder.as_ptr())}}}
impl RegisterableAudioDecoder for Multistream {
 fn supported_codecs()->&'static [SupportedAudioCodec]{&[support_audio_codec!(CODEC_ID_OPUS,"opus","Opus")]}
 fn try_registry_new(params:&AudioCodecParameters,options:&AudioDecoderOptions)->Result<Box<dyn AudioDecoder>>{
  let channels=params.channels.as_ref().map(|c|c.count()).unwrap_or(0);
  if (1..=2).contains(&channels){return OpusDecoder::try_registry_new(params,options);}
  let header=params.extra_data.as_deref().ok_or(Error::DecodeError("Missing multistream Opus header"))?;
  if !(3..=8).contains(&channels)||header.len()<21+channels||&header[..8]!=b"OpusHead"||header[8]>15||header[9] as usize!=channels||header[18]!=1{return Err(Error::Unsupported("Invalid multistream Opus channel mapping"));}
  let streams=header[19] as i32;let coupled=header[20] as i32;
  if streams<1||coupled>streams||streams+coupled>255||header[21..21+channels].iter().any(|&x|x!=255&&i32::from(x)>=streams+coupled){return Err(Error::DecodeError("Invalid Opus stream dimensions"));}
  // Family 1 stores Vorbis order; the studio's buffer convention is WAV order.
  let order:&[usize]=match channels{3=>&[0,2,1],4=>&[0,1,2,3],5=>&[0,2,1,3,4],6=>&[0,2,1,5,3,4],7=>&[0,2,1,6,5,3,4],8=>&[0,2,1,7,5,6,3,4],_=>unreachable!()};
  let mapping:Vec<u8>=order.iter().map(|i|header[21+i]).collect();let mut error=0;
  let decoder=NonNull::new(unsafe{opusic_sys::opus_multistream_decoder_create(48000,channels as i32,streams,coupled,mapping.as_ptr(),&mut error)}).ok_or(Error::DecodeError("Cannot create Opus multistream decoder"))?;
  if error!=opusic_sys::OPUS_OK{unsafe{opusic_sys::opus_multistream_decoder_destroy(decoder.as_ptr())};return Err(Error::DecodeError("Cannot initialize Opus multistream decoder"));}
  let mut params=params.clone();params.sample_rate=Some(48000);
  let buffer=AudioBuffer::new(AudioSpec::new(48000,params.channels.clone().unwrap()),5760);
  Ok(Box::new(Self{params,decoder,buffer,pcm:vec![0.;5760*channels],channels,skip:u16::from_le_bytes([header[10],header[11]]) as usize}))
 }
}
impl AudioDecoder for Multistream {
 fn codec_info(&self)->&CodecInfo{&Self::supported_codecs()[0].info}
 fn codec_params(&self)->&AudioCodecParameters{&self.params}
 fn reset(&mut self){unsafe{opusic_sys::opus_multistream_decoder_ctl(self.decoder.as_ptr(),opusic_sys::OPUS_RESET_STATE);}}
 fn decode_ref(&mut self,packet:&PacketRef<'_>)->Result<GenericAudioBufferRef<'_>>{
  let bytes=i32::try_from(packet.data.len()).map_err(|_|Error::DecodeError("Opus packet too large"))?;
  let frames=unsafe{opusic_sys::opus_multistream_decode_float(self.decoder.as_ptr(),packet.data.as_ptr(),bytes,self.pcm.as_mut_ptr(),5760,0)};
  if frames<0{return Err(Error::DecodeError("Invalid multistream Opus packet"));}let frames=frames as usize;
  self.buffer.clear();self.buffer.render_uninit(Some(frames));self.buffer.copy_from_slice_interleaved(&&self.pcm[..frames*self.channels]);
  let skip=self.skip.min(frames);self.skip-=skip;self.buffer.trim(skip+packet.trim_start.get() as usize,packet.trim_end.get() as usize);
  Ok(self.buffer.as_generic_audio_buffer_ref())
 }
 fn last_decoded(&self)->GenericAudioBufferRef<'_>{self.buffer.as_generic_audio_buffer_ref()}
 fn finalize(&mut self)->FinalizeResult{FinalizeResult::default()}
}
