import ExpoModulesCore

// Expo module that exposes the on-device derived-metrics compute to JS.
// The actual work is the UniFFI-generated `computeDerivedMetricsDayJson`
// (free function from noop_compute_engine.swift), which calls into the Rust
// core compiled for iOS — the same code the backend runs, so output matches
// the server for identical input.
public class NoopComputeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NoopCompute")

    // Synchronous: the compute is sub-second and callers may want it inline.
    // UniFFI maps the Rust `Result<String, ComputeFfiError>` to a Swift throw,
    // which Expo surfaces to JS as a thrown error.
    Function("computeDerivedMetricsDayJson") { (requestJson: String) throws -> String in
      try computeDerivedMetricsDayJson(requestJson: requestJson)
    }

    // Full daily pipeline (sleep-detect → activity → stages → wellness →
    // derived) over a ~60-day raw window. Returns the complete derived bundle
    // for the reference day as JSON.
    Function("computeFullDayJson") { (requestJson: String) throws -> String in
      try computeFullDayJson(requestJson: requestJson)
    }
  }
}
