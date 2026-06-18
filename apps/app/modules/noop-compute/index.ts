import { requireNativeModule } from "expo-modules-core";

type NoopComputeNativeModule = {
  /**
   * Run one day's derived-metrics compute on-device using the same Rust core
   * the backend runs (compiled for iOS, bridged via UniFFI). `requestJson` is a
   * serialized ComputeDerivedMetricsDayRequestV1; returns the serialized
   * PersistedDailyMetricV1. Throws on invalid JSON, unsupported schemaVersion,
   * or a compute error.
   */
  computeDerivedMetricsDayJson(requestJson: string): string;
  /**
   * Run the FULL daily pipeline on-device (sleep-detect → activity → sleep
   * stages → wellness/baseline → derived) over a ~60-day raw window.
   * `requestJson` is a serialized FullDayInput { samples, sensorRecords,
   * deviceEvents, referenceDate, timeZone }; returns a serialized FullDayOutput
   * (sleep detections, activity bouts, sleep stages, night features, baseline,
   * daily scores, daily metrics). Throws on invalid JSON or a compute error.
   */
  computeFullDayJson(requestJson: string): string;
};

const NoopCompute = requireNativeModule<NoopComputeNativeModule>("NoopCompute");

export function computeDerivedMetricsDayJson(requestJson: string): string {
  return NoopCompute.computeDerivedMetricsDayJson(requestJson);
}

export function computeFullDayJson(requestJson: string): string {
  return NoopCompute.computeFullDayJson(requestJson);
}

export default NoopCompute;
