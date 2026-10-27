fn main() {
 println!("cargo:rerun-if-env-changed=TAURI_UPDATER_PUBLIC_KEY");
 println!("cargo:rerun-if-changed=../native/desktop-fixture.cpp");
 for name in ["voice.hpp", "waves.hpp", "filter.hpp", "modulation.hpp", "session.hpp", "plan-packet.hpp", "device-host.cpp", "device-host.h", "vendor/miniaudio/miniaudio.h"] {
  println!("cargo:rerun-if-changed=../native/{name}");
 }
 let target=std::env::var("CARGO_CFG_TARGET_OS").unwrap();
 let mut native=cc::Build::new();
 if target=="windows" {native.static_crt(true);}
 native.cpp(true).file("../native/desktop-fixture.cpp")
  .file("../native/device-host.cpp")
  .define("NOMINMAX",None)
  .std("c++17").flag_if_supported("-ffp-contract=off")
  .flag_if_supported("/fp:strict").flag_if_supported("/EHsc").compile("premidi_fixture");
 if target=="windows" {for name in ["ole32","uuid","avrt","winmm"] {println!("cargo:rustc-link-lib={name}");}}
 if target=="macos" {for name in ["CoreAudio","AudioToolbox","CoreFoundation"] {println!("cargo:rustc-link-lib=framework={name}");}}
 if target=="linux" {println!("cargo:rustc-link-lib=dl");println!("cargo:rustc-link-lib=pthread");println!("cargo:rustc-link-lib=m");}
 tauri_build::build()
}
