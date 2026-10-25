// Original pre-midi sampler arrangement of explicitly licensed CC0 recordings.
// The Meta Open Sound project captured these as real strings on real guitars.
// Selecting a nearby recorded pitch minimizes pitch-shifted synthetic artifacts.
// Root, physical string, and velocity layer are first-class sound provenance.
const ROOTS = [[40,"LowE"],[43,"LowE"],[45,"A"],[48,"A"],[50,"D"],[52,"D"],[55,"G"],[57,"G"],[59,"B"],[60,"B"],[62,"B"],[64,"HighE"],[67,"HighE"],[69,"HighE"],[72,"HighE"],[76,"HighE"],[79,"HighE"],[83,"HighE"]];
const LAYERS = [["nf","Nylon","Vel01Finger",0.25],["np2","Nylon","Vel02Pick",0.55],["np3","Nylon","Vel03Pick",0.9],["ss1","Steel","Vel01",0.25],["ss2","Steel","Vel02",0.55],["ss3","Steel","Vel03",0.9]];
const HASHES = {
  "nf": ["2597910937ccbb9c0e04b94bf258069d02190ba4","71adb7f73afcd9a44053b7dd99fde44b2f60f3a3","827accd2919f1fcbf6fc34326e93d7426387298b","5f5697179fbc6fc505182c7cfe5da38a099fcd90","886ecff426a331f2781b535623efb69c2d473d08","89c2ba024677b98d0c474464d23fbae03d7cd1e4","1b51583ef2571199f1a9c9f6656cb26db53f6fc8","036fa2c062c8a7d9b60231e8048700fdb3e24a57","754737d07c5e3f3f43af0a3c9832f01965b71697","c30dd6608bdec5ef9cf45c9ea1f921acaef04998","9bfb67aa2532005237b68ceb25d21f7dbf83e9f1","01603e3280332642701c201ba462b82fdb9f9033","3936885c7f6e4934367b9399ca613b24eaa246f2","421f5525477f48358b6930a730ccb7d3878acdcc","0149fed21a50b9774b911d38b5db72b9dd3dcaad","d1916bac7eb9e402d50821630c351e6eb24e586a","0fb5c4f9f3fe8fbb61eb238e34fd636f5299e5f8","9e2b6d2e6c3a487dea5793117b9b4cffb89ed224"],
  "np2": ["ab3801bc8ec0ca8f7f293843b3817e2e170e0e08","7770aaf4b314303a77099ce0aaf1501afb5ee9b1","0c283e505cc2ba5e5473d4a75123dae45fe04c82","c58b980718bba616b4db65e8f53d30cdafa5279d","1bf619ae09a03269842c9d4a56621291f0bad49d","65f42adadd0cfa7b6b2d90cb0d8a4cb26b65de64","44cc6747f6b3315fa7916990bf2466515bd49432","eab00560cbd3e6a4606b4c6b440833c973db0c30","6c4b546e396d4b2ead968e3dfd7b2cc64af012e9","1048584014afbb1a16eecc22cf51b0b7c9bb9bd1","548e6de17cebf55014b553e3c87087b0c04018ca","137ba90bee0c32385ad7cdec727fa6c6306dc8e8","695881625fa45f1b0f15bb7d5ccc76079ae28924","0eea4ad6261373e37b985537f3d5fde358e9ea48","6b16fc7fc77cc704b4bb4882e3b860dd3e231e62","485291b8ed8aed991d63f6453948ada9a57c22ca","cfbbaf8c3b44b499940480bb910d11366a92ae2d","f333177c81d57150641410425bd6560475a8b155"],
  "np3": ["bad46ada0afb049b3499e5a4c95e814a75135d4c","fe6c78e54736da8dab5ebd9ad1954e7e6f6441a3","ddca71d2090d1e08decbe0b57cabd05e5e035d56","191eceb018fe7debe97e7617a932ab8ad0452299","eff5470a0fdc64c8effcde0dd3919dff916a8096","ac59b2648bf8a55a1536aa05a1b0841a8690acce","a85f70e2598643bc07892f0fcec8101ba6d08631","9e40f5772abd38ce9171e0a8663ab9e360e738ab","872e293877d225993b99d23fef2e3b32787a3dcb","4cccb0d2189c698ef59b6c172a5cbf48980ba36e","65017bd26d010ad7354d0d82744a8a3a2d209d76","d34397dbc5b673e0ad4ae10eebd6a879c7f50424","55c2e12e05b0eb180d9c18ad0f102f083164dda4","de42e9424abdb14ddab9400e11593a0ed0a0ccbb","99539d4c404e6528508690a87ed506798c89d25d","353006652fa1367dfd7a7779b01ddf0123a1b493","b8bdd3afa3801aee41c2e7e75f877567258ba159","24a6e1283df06fb2bb53ae3fe25812995b7a57d9"],
  "ss1": ["d3562ed650d92d6fe48c83cd77fc0ee4d6ad8a06","3e39c4d947e27f9a1f7f17c90bb8f226a58508fb","30794abd3ec7c85c4834df956c9cf710f6b30853","4a5ea03d3414499faf8fa13e8c69dac6743b7239","49ede72e6ec9b63ce0d8712ab1a0d24c63d9b168","0a06ba92ec991ac4523674d35143c0fc64c7d9e8","5130e7a69beaee5f1c22418bcb0c1cf867b9aac1","e59e23d4f85ecc0d0757409fd5ab97c8a4db26de","25ca913209407f86c204410ea2e842b197822927","0c678831225d8e251b1908b24ecb2a242a28929b","d2d1dff4c5d556989aeb79531e25d3cc7982898f","b32ad1c4250277e06d8a6b15ae1b1da55bb0a0fd","3d04ab039b7281f3e5c5791bcedef26084843dd5","ec390ca9661f22757967d923dba4b6ae2344cf9c","3c04678a407f3089755582697dd0a65429a28fe6","e3aa0a68fcca0b92888fb7d006a1e1565b2391a2","1ab9ed2a56d0a5ad53e7f300df6ef14290c7be9c","963b3b56588dc68bb1be7eb8ff641186187de7e1"],
  "ss2": ["017a4a61e9b0cdd29fc7c35493594f09b7b43265","1b91473ed3a7d3e2646216cd5a5faba94331b51f","3d9be7702d3ca8fa719da16dcd4a82880ba0365e","0cc86d5d3f7e10993ef18d8bacdaf4aeda5c81e1","041a7a4c3194f8064d10ee08fe9d9b360f2c8580","65f516fceb85fa53ddf6e17827a8160dfadabcd6","3c1843002051325594d3f3de344df6cb5b7fa89a","a4c24b6c4fe0c52c7df1ac17686bf8503c4d96c5","ff62e2e46d6a78aaee9014f3a8bac02f87c73814","53b9f441b20d2261d285ac7e54bd33dd9ef99068","9d857c5eb705bda1d26b518f4a39b7f0846b995c","c7e6cc936c1187823bec15c02c7b020178edd9c6","c9a17607a6380bb64207d691a01e0efd55de74ed","fcb064c8d4449a84e26844e3e1358b7a13b70e5f","e025ed0e1e19eed224f9ba3820dbc2d84304fe50","0650dbb893d43e7ec9eaddf4a220c187f23c1ec1","8c9057be0aec3306e030d29368fbc600d28950b6","d5df15c22aacdab8175ff52805ab255c5ba76d34"],
  "ss3": ["c8f39ebe7963c6ef5d63e25f11552471cea94cc0","2ca6fafda9ef5df6e684c6b8ef94c738bd7ff6e9","c2e3672d3bb956607921cd1bb8f4cc7ee0a2ea7e","83f6f7bccc965e963d5ba28b89564d3fc0754e7e","4954daa696ec08442a30bf110fa999967e59e222","0a910750661bedd92587382774d8fc7f907757dd","3a29206b554409b96da1b670121702d4f7ccb34e","4c462a42b0961d7eb903cba2704a8fa7c9facaf1","fe142a156da4ccb9799a4771c0a899d095ce8288","8812032978ca5c23726b1c7a2db96b25719b5a8a","8220c981ea827a9c8701bb37254259ae9ebc8baa","96b0b64a6a3d175eebe692236f1cae04c7800d29","f83e05f90d162712f526cf445adeebfbde4d5d06","917ba248f3cd7ee0a54799001e255abcf5b2f6c3","bc633c9e5bc8f7148184991eec2f7e6cf0526292","cdcbcbb6bbac72ed6ec6fead2e57011adc8c634e","be8efa75a3e9b3e5be26c1aea650ca94ca2eafd3","864bbd31f054ffe0d92136ea537a40af44bf1c29"]
};
const PITCH_NAMES = ["C","Cs","D","Ds","E","F","Fs","G","Gs","A","As","B"];
const pitchName = value => PITCH_NAMES[value % 12] + (Math.floor(value / 12) - 1);
export const GUITAR_RECORDINGS = LAYERS.flatMap(([code,type,layer,velocity]) =>
 ROOTS.map(([root,string],index)=>({
  id:"g-"+code+"-"+root,
  path:"systems/instruments/meta-"+type.toLowerCase()+"-guitar/ogg/INSGuitar"+type+
    "_String"+string+"_"+layer+"_"+pitchName(root)+"_01.ogg",
  root,string,velocity,sha:HASHES[code][index]
 }))
);
const guitarIds = layers => GUITAR_RECORDINGS.filter(row =>
 layers.some(code=>row.id.startsWith("g-"+code+"-"))).map(row=>row.id);
export const GUITAR_PRESETS = [
 {
  id:"nylon-finger",name:"Nylon Fingerstyle",category:"Guitars",
  description:"Warm finger-plucked acoustic nylon, sampled up the neck.",
  assets:guitarIds(["nf"]),followPitch:true,gain:1.25,release:1.65,strumMs:0,preserveDynamics:true
 },
 {
  id:"nylon-guitar",name:"Nylon Picked",category:"Guitars",
  description:"Light and firm recorded picks, with velocity-sensitive attack.",
  assets:guitarIds(["np2","np3"]),followPitch:true,gain:1.2,release:1.6,strumMs:0,preserveDynamics:true
 },
 {
  id:"steel-guitar",name:"Steel Acoustic",category:"Guitars",
  description:"Expressive steel strings with soft, medium and firm plucks.",
  assets:guitarIds(["ss1","ss2","ss3"]),followPitch:true,gain:1.05,release:1.95,strumMs:0,preserveDynamics:true
 },
 {
  id:"steel-strum",name:"Steel Strum",category:"Guitars",
  description:"Rhythmic steel-string chords, brighter pluck and wider bass-to-treble rake.",
  assets:guitarIds(["ss1","ss2","ss3"]),followPitch:true,gain:1.3,attack:.002,release:1.05,strumMs:24,preserveDynamics:true
 }
];
