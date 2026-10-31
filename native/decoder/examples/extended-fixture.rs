// Reproducible original HE-AAC sine fixture; no third-party recording.
use fdk_aac::enc::{Encoder,EncoderParams,AudioObjectType,BitRate,ChannelMode,Transport};
fn main(){
 let output=std::env::args().nth(1).expect("output ADTS path");
 let encoder=Encoder::new(EncoderParams{bit_rate:BitRate::Cbr(32000),sample_rate:48000,transport:Transport::Adts,channels:ChannelMode::Stereo,audio_object_type:AudioObjectType::Mpeg4HeAac}).unwrap();
 let source:Vec<i16>=(0..24000).flat_map(|frame|(0..2).map(move|ch|if (2400..19200).contains(&frame){(2600.*(2.*std::f64::consts::PI*(440.+ch as f64*110.)*frame as f64/48000.).sin()).round() as i16}else{0})).collect();
 let mut cursor=0;let mut bytes=Vec::new();let mut packet=[0;65536];
 while cursor<source.len(){let info=encoder.encode(&source[cursor..],&mut packet).unwrap();assert!(info.input_consumed>0||info.output_size>0);cursor+=info.input_consumed;bytes.extend_from_slice(&packet[..info.output_size]);}
 std::fs::write(output,bytes).unwrap();
}
