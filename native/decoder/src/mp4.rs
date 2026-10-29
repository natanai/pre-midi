// Apply ISO BMFF edit-list timing that the decoder's demuxer does not yet apply.
// Parsing is bounded to container headers; compressed audio is never parsed here.
type Atom<'a>=(&'a [u8],&'a [u8]);
fn atoms(bytes:&[u8])->Result<Vec<Atom<'_>>,String>{
 let mut at=0usize;let mut result=Vec::new();
 while at+8<=bytes.len(){
  if result.len()>100_000{return Err("MP4 atom limit exceeded".into());}
  let n=u32::from_be_bytes(bytes[at..at+4].try_into().unwrap()) as u64;let header=if n==1{16}else{8};
  if at+header>bytes.len(){return Err("Truncated MP4 atom".into());}
  let size=if n==0{(bytes.len()-at) as u64}else if n==1{u64::from_be_bytes(bytes[at+8..at+16].try_into().unwrap())}else{n};
  if size<header as u64||size>(bytes.len()-at) as u64{return Err("Invalid MP4 atom size".into());}
  let end=at+size as usize;result.push((&bytes[at+4..at+8],&bytes[at+header..end]));at=end;
 }
 Ok(result)
}
fn field32(bytes:&[u8],offset:usize)->Result<u32,String>{bytes.get(offset..offset+4).map(|v|u32::from_be_bytes(v.try_into().unwrap())).ok_or("Truncated MP4 timing".into())}
fn timed_field(bytes:&[u8])->Result<u32,String>{field32(bytes,if bytes.first()==Some(&1){20}else{12})}
pub struct Edit {duration:u64,media:i64}
pub struct TrackEdits {pub id:u32,movie_scale:u32,media_scale:u32,edits:Vec<Edit>}
pub fn read(bytes:&[u8])->Result<Vec<TrackEdits>,String>{
 if bytes.len()<12||&bytes[4..8]!=b"ftyp"{return Ok(Vec::new());}
 let mut out=Vec::new();
 for (name,moov) in atoms(bytes)?{if name!=b"moov"{continue;}let children=atoms(moov)?;
  let movie_scale=children.iter().find(|(n,_)|*n==b"mvhd").map(|(_,v)|timed_field(v)).transpose()?.unwrap_or(0);
  for (name,trak) in children{if name!=b"trak"{continue;}
   let mut id=0;let mut media_scale=0;let mut edits=Vec::new();
   for (name,data) in atoms(trak)?{
    if name==b"tkhd"{id=timed_field(data)?;}
    if name==b"mdia"{for (n,v) in atoms(data)?{if n==b"mdhd"{media_scale=timed_field(v)?;}}}
    if name==b"edts"{for (n,v) in atoms(data)?{if n!=b"elst"{continue;}
     let version=*v.first().ok_or("Missing MP4 edit version")?;if version>1{return Err("Invalid MP4 edit version".into());}
     let count=field32(v,4)? as usize;if count>1024{return Err("MP4 edit count exceeds 1024".into());}
     let width=if version==1{20}else{12};if 8+count*width>v.len(){return Err("Truncated MP4 edits".into());}
     for index in 0..count{let at=8+index*width;
      let (duration,media,rate)=if version==1{(u64::from_be_bytes(v[at..at+8].try_into().unwrap()),i64::from_be_bytes(v[at+8..at+16].try_into().unwrap()),at+16)}else{(field32(v,at)? as u64,i32::from_be_bytes(v[at+4..at+8].try_into().unwrap()) as i64,at+8)};
      if field32(v,rate)?!=0x00010000{return Err("MP4 audio edits require unit media rate".into());}edits.push(Edit{duration,media});
     }
    }}
   }
   if !edits.is_empty(){if movie_scale==0||media_scale==0{return Err("Invalid MP4 edit timescale".into());}out.push(TrackEdits{id,movie_scale,media_scale,edits});}
  }
 }
 Ok(out)
}
pub fn apply(samples:&mut Vec<f32>,rate:u32,channels:u32,track:&TrackEdits)->Result<(),String>{
 let mut out=Vec::new();let source_frames=samples.len()/channels as usize;
 for edit in &track.edits{
  let frames=(edit.duration as f64*rate as f64/track.movie_scale as f64).round();
  if frames>rate as f64*301.||out.len() as f64+frames*channels as f64>128_000_000.{return Err("MP4 edited audio exceeds limits".into());}
  let count=frames as usize;let begin=out.len();out.resize(begin+count*channels as usize,0.);
  if edit.media==-1{continue;}if edit.media<0{return Err("Invalid MP4 media time".into());}
  let source=(edit.media as f64*rate as f64/track.media_scale as f64).round() as usize;
  if source<source_frames{let length=count.min(source_frames-source)*channels as usize;out[begin..begin+length].copy_from_slice(&samples[source*channels as usize..source*channels as usize+length]);}
 }
 *samples=out;Ok(())
}
