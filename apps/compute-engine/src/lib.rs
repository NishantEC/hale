pub mod calendar;
pub mod derived_metrics;
pub mod ffi;
pub mod full_pipeline;
pub mod math;
pub mod types;

// UniFFI scaffolding for the on-device binding (opt-in via the `uniffi`
// feature). Generates the FFI glue for every #[uniffi::export] item — here,
// the ffi:: entrypoint. Proc-macro mode: no UDL and no build script; the
// bindgen step reads the compiled cdylib to emit Swift/Kotlin.
#[cfg(feature = "uniffi")]
uniffi::setup_scaffolding!();
