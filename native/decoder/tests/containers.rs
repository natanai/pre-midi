use premidi_decoder::decode;
#[test]
fn all_studio_containers_decode_finite_audible_pcm(){
 let fixtures:&[(&str,&[u8])]=&[("wav",include_bytes!("fixtures/tone.wav")),("mp3",include_bytes!("fixtures/tone.mp3")),("ogg",include_bytes!("fixtures/vorbis.ogg")),("ogg",include_bytes!("fixtures/opus.ogg")),("webm",include_bytes!("fixtures/tone.webm")),("mp4",include_bytes!("fixtures/tone.mp4"))];
 for (extension,bytes) in fixtures {
  let audio=decode(bytes.to_vec(),extension).unwrap_or_else(|e|panic!("{extension}: {e}"));
  assert_eq!(audio.rate,48000);assert_eq!(audio.channels,2);assert!(audio.samples.len()>=9000&&audio.samples.len()<14000,"{extension}: {} samples",audio.samples.len());assert!(audio.peak>0.03&&audio.peak<0.3);
  let rms=(audio.samples.iter().map(|x|(*x as f64).powi(2)).sum::<f64>()/audio.samples.len() as f64).sqrt();assert!(rms>0.05&&rms<0.12,"{extension}: {rms}");
 }
}
#[test]
fn webm_container_delay_and_end_padding_match_chromium_156(){
 let webm=decode(include_bytes!("fixtures/tone.webm").to_vec(),"webm").unwrap();
 let ogg=decode(include_bytes!("fixtures/opus.ogg").to_vec(),"ogg").unwrap();
 // Same original Opus packets: 6.5 ms CodecDelay rounded to a 1 ms WebM
 // timestamp tick leaves an additional 24-frame front trim; 648 final padding
 // frames are never part of the audible asset.
 assert_eq!(webm.samples.len()/2,4776);assert_eq!(ogg.samples.len()/2,4800);
 assert_eq!(webm.samples,ogg.samples[48..]);
}
#[test]
fn multichannel_containers_keep_channel_order_and_length(){
 for (bytes,extension) in [(include_bytes!("fixtures/channels-6.wav").as_slice(),"wav"),(include_bytes!("fixtures/channels-6-opus.ogg").as_slice(),"ogg"),(include_bytes!("fixtures/channels-6-vorbis.ogg").as_slice(),"ogg")]{
  let audio=decode(bytes.to_vec(),extension).unwrap_or_else(|e|panic!("{extension}: {e}"));assert_eq!(audio.channels,6);assert_eq!(audio.rate,48000);assert!(audio.samples.len()/6>=9500&&audio.samples.len()/6<=10000);
  // Each original channel carries a different sine. Correlation checks the
  // mapping after independent container/codec decoding, including center/LFE.
  let frames=audio.samples.len()/6;
  for channel in 0..6 {let frequency=if channel==3{70.}else{220.+73.*channel as f64};let (mut real,mut imag)=(0.,0.);for frame in 1024..frames {let angle=2.*std::f64::consts::PI*frequency*frame as f64/48000.;let value=audio.samples[6*frame+channel] as f64;real+=value*angle.cos();imag+=value*angle.sin();}let level=2.*real.hypot(imag)/(frames-1024) as f64;assert!(level>0.05&&level<0.11,"{extension}/{channel}: {level}");}
 }
}
