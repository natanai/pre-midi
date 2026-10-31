//! Bounded Ogg page reader for Vorbis granule duration. Decoder buffers may
//! expose a padded final page; browsers trim to the final granule position.
pub fn vorbis_frames(bytes:&[u8])->Result<Option<usize>,String>{
 if bytes.len()<27||&bytes[..4]!=b"OggS"{return Ok(None);}
 let mut at=0usize;
 let mut first_serial=None;
 let mut vorbis=false;
 let mut last=None;
 let mut pages=0usize;
 while at<bytes.len(){
  pages+=1;if pages>250_000{return Err("Ogg page limit exceeded".into());}
  if at+27>bytes.len()||&bytes[at..at+4]!=b"OggS"||bytes[at+4]!=0{return Err("Malformed Ogg page".into());}
  let segments=bytes[at+26] as usize;
  let table_end=at.checked_add(27+segments).ok_or("Ogg page overflow")?;
  if table_end>bytes.len(){return Err("Truncated Ogg segment table".into());}
  let body_size=bytes[at+27..table_end].iter().map(|&v|v as usize).sum::<usize>();
  let end=table_end.checked_add(body_size).ok_or("Ogg page overflow")?;
  if end>bytes.len(){return Err("Truncated Ogg page data".into());}
  let serial=u32::from_le_bytes(bytes[at+14..at+18].try_into().unwrap());
  if first_serial.is_none(){
   first_serial=Some(serial);
   vorbis=end>=table_end+7&&bytes[table_end]==1&&&bytes[table_end+1..table_end+7]==b"vorbis";
  }
  if first_serial==Some(serial){
   let granule=u64::from_le_bytes(bytes[at+6..at+14].try_into().unwrap());
   if granule!=u64::MAX{last=Some(granule);}
  }
  at=end;
 }
 if !vorbis{return Ok(None);}
 last.map(|value|usize::try_from(value).map_err(|_|"Ogg granule exceeds addressable frames".into())).transpose()
}
#[cfg(test)]mod tests{
 use super::vorbis_frames;
 #[test]fn original_vorbis_uses_page_granule(){let bytes=include_bytes!("../tests/fixtures/vorbis.ogg");let count=vorbis_frames(bytes).unwrap().unwrap();assert!(count>=4000&&count<=5000);}
 #[test]fn malformed_ogg_rejected(){assert!(vorbis_frames(b"OggSxxxxx").unwrap().is_none());}
}
