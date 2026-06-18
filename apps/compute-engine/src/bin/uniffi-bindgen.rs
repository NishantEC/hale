//! Version-locked UniFFI binding generator. Built only with the `uniffi-cli`
//! feature so the generated Swift/Kotlin always matches the uniffi runtime the
//! cdylib was compiled with — avoiding scaffolding/runtime ABI drift.
//!
//! Usage (library mode):
//!   cargo run --no-default-features --features uniffi-cli --bin uniffi-bindgen \
//!     -- generate --library <path/to/libnoop_compute_engine.dylib> \
//!     --language swift --out-dir <out>
fn main() {
    uniffi::uniffi_bindgen_main()
}
