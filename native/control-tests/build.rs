fn main(){
 let mut native=cc::Build::new();native.cpp(true).file("../device-host.cpp").define("NOMINMAX",None).std("c++17").flag_if_supported("-ffp-contract=off").flag_if_supported("/fp:strict").flag_if_supported("/EHsc");
 let target=std::env::var("CARGO_CFG_TARGET_OS").unwrap();
 if target=="windows"{native.static_crt(true);}native.compile("premidi_control_test");
 if target=="windows"{for name in ["ole32","uuid","avrt","winmm"]{println!("cargo:rustc-link-lib={name}");}}
 if target=="linux"{for name in ["dl","pthread","m"]{println!("cargo:rustc-link-lib={name}");}}
 if target=="macos"{for name in ["CoreAudio","AudioToolbox","CoreFoundation"]{println!("cargo:rustc-link-lib=framework={name}");}}
 for name in ["voice.hpp","drive.hpp","delay.hpp","sample.hpp", "capture.hpp","session.hpp","plan-packet.hpp","waves.hpp","filter.hpp","modulation.hpp","device-host.h","vendor/miniaudio/miniaudio.h"]{println!("cargo:rerun-if-changed=../{name}");}
 println!("cargo:rerun-if-changed=../../desktop/src/audio/control.rs");println!("cargo:rerun-if-changed=../device-host.cpp");
}
