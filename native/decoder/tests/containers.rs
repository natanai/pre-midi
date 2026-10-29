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
