//! AAC-LC uses the existing Rust decoder where supported. This bounded FDK
//! adapter handles HE-AAC and multichannel streams using the same demuxer.
use std::ptr::NonNull;
use symphonia::core as symphonia_core;
use symphonia::core::{audio::{AsGenericAudioBufferRef,AudioBuffer,AudioMut,AudioSpec,Channels,GenericAudioBufferRef},codecs::{CodecInfo,audio::{AudioCodecParameters,AudioDecoder,AudioDecoderOptions,FinalizeResult,well_known::CODEC_ID_AAC},registry::{RegisterableAudioDecoder,SupportedAudioCodec}},errors::{Error,Result},packet::PacketRef,support_audio_codec};
use fdk_aac_sys as fdk;
pub struct ExtendedAac {params:AudioCodecParameters,decoder:NonNull<fdk::AAC_DECODER_INSTANCE>,buffer:AudioBuffer<i16>,pcm:Vec<i16>,rate:u32,channels:usize}
// Decoder mutation requires &mut self; all exposed PCM is Rust-owned.
unsafe impl Send for ExtendedAac {}
unsafe impl Sync for ExtendedAac {}
impl Drop for ExtendedAac {fn drop(&mut self){unsafe{fdk::aacDecoder_Close(self.decoder.as_ptr())}}}
impl RegisterableAudioDecoder for ExtendedAac {
 fn supported_codecs()->&'static [SupportedAudioCodec]{&[support_audio_codec!(CODEC_ID_AAC,"aac","AAC")]}
 fn try_registry_new(params:&AudioCodecParameters,_:&AudioDecoderOptions)->Result<Box<dyn AudioDecoder>>{
  let config=params.extra_data.as_deref().ok_or(Error::DecodeError("AAC AudioSpecificConfig is missing"))?;
  if config.len()<2||config.len()>4096{return Err(Error::DecodeError("Invalid AAC configuration size"));}
  let decoder=NonNull::new(unsafe{fdk::aacDecoder_Open(fdk::TRANSPORT_TYPE_TT_MP4_RAW,1)}).ok_or(Error::DecodeError("Cannot open AAC decoder"))?;
  let result=Self{params:params.clone(),decoder,buffer:AudioBuffer::new(AudioSpec::new(48000,Channels::Discrete(1)),0),pcm:vec![0;8*2048],rate:0,channels:0};
  let mut data=config.as_ptr() as *mut u8;let size=config.len() as u32;
  if unsafe{fdk::aacDecoder_ConfigRaw(result.decoder.as_ptr(),&mut data,&size)}!=fdk::AAC_DECODER_ERROR_AAC_DEC_OK{return Err(Error::DecodeError("Invalid AAC AudioSpecificConfig"));}
  // Preserve authored dynamics and avoid the decoder's additional limiter delay.
  for (param,value) in [(fdk::AACDEC_PARAM_AAC_PCM_OUTPUT_CHANNEL_MAPPING,1),(fdk::AACDEC_PARAM_AAC_PCM_LIMITER_ENABLE,0)]{
   if unsafe{fdk::aacDecoder_SetParam(result.decoder.as_ptr(),param,value)}!=fdk::AAC_DECODER_ERROR_AAC_DEC_OK{return Err(Error::DecodeError("Cannot configure AAC PCM output"));}
  }
  Ok(Box::new(result))
 }
}
impl AudioDecoder for ExtendedAac {
 fn codec_info(&self)->&CodecInfo{&Self::supported_codecs()[0].info}
 fn codec_params(&self)->&AudioCodecParameters{&self.params}
 fn reset(&mut self){}
 fn decode_ref(&mut self,packet:&PacketRef<'_>)->Result<GenericAudioBufferRef<'_>>{
  let mut data=packet.data.as_ptr() as *mut u8;let size=u32::try_from(packet.data.len()).map_err(|_|Error::DecodeError("AAC packet too large"))?;let mut remaining=size;
  if unsafe{fdk::aacDecoder_Fill(self.decoder.as_ptr(),&mut data,&size,&mut remaining)}!=fdk::AAC_DECODER_ERROR_AAC_DEC_OK||remaining!=0{return Err(Error::DecodeError("Invalid AAC input packet"));}
  if unsafe{fdk::aacDecoder_DecodeFrame(self.decoder.as_ptr(),self.pcm.as_mut_ptr(),self.pcm.len() as i32,0)}!=fdk::AAC_DECODER_ERROR_AAC_DEC_OK{return Err(Error::DecodeError("Cannot decode AAC packet"));}
  let info=unsafe{fdk::aacDecoder_GetStreamInfo(self.decoder.as_ptr()).as_ref()}.ok_or(Error::DecodeError("Missing AAC stream dimensions"))?;
  let rate=info.sampleRate as u32;let channels=info.numChannels as usize;let frames=info.frameSize as usize;
  if !(3000..=768000).contains(&rate)||!(1..=8).contains(&channels)||frames>2048||frames*channels>self.pcm.len(){return Err(Error::DecodeError("AAC output dimensions exceed budget"));}
  if self.rate!=rate||self.channels!=channels{if self.rate!=0{return Err(Error::DecodeError("AAC dimensions changed within asset"));}self.rate=rate;self.channels=channels;self.buffer=AudioBuffer::new(AudioSpec::new(rate,Channels::Discrete(channels as u16)),frames);}
  self.buffer.clear();self.buffer.render_uninit(Some(frames));self.buffer.copy_from_slice_interleaved(&&self.pcm[..frames*channels]);
  self.buffer.trim(packet.trim_start.get() as usize,packet.trim_end.get() as usize);Ok(self.buffer.as_generic_audio_buffer_ref())
 }
 fn last_decoded(&self)->GenericAudioBufferRef<'_>{self.buffer.as_generic_audio_buffer_ref()}
 fn finalize(&mut self)->FinalizeResult{FinalizeResult::default()}
}
