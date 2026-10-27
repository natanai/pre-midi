fn main() {
 println!("cargo:rerun-if-env-changed=TAURI_UPDATER_PUBLIC_KEY");
 println!("cargo:rerun-if-changed=../native/desktop-fixture.cpp");
 for name in ["voice.hpp", "waves.hpp", "filter.hpp", "modulation.hpp"] {
  println!("cargo:rerun-if-changed=../native/{name}");
 }
 cc::Build::new().cpp(true).file("../native/desktop-fixture.cpp")
  .std("c++17").flag_if_supported("-ffp-contract=off")
  .flag_if_supported("/fp:strict").compile("premidi_fixture");
 tauri_build::build()
}
