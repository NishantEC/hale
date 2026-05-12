import type { SleepNight } from "../api"
import { HYPNOGRAM_STAGES, Hypnogram } from "../components/Hypnogram"
import { Num, Row, SectionHead } from "../components/primitives"
import { formatNumber, formatTimestamp } from "../format"

export function SleepTab({
  sleep,
  epochs,
}: {
  sleep: SleepNight | null
  epochs: Array<{ timestamp: string; stage: string }>
}) {
  return (
    <div className="space-y-10">
      <div>
        <div className="grid grid-cols-4 gap-8">
          <Num
            label="Duration"
            value={`${formatNumber(sleep?.selectedDetection?.durationHours, 1)}h`}
            sub="total sleep"
          />
          <Num
            label="RHR"
            value={formatNumber(sleep?.selectedNightFeature?.restingHeartRate)}
            sub="bpm"
          />
          <Num
            label="HRV"
            value={formatNumber(sleep?.selectedNightFeature?.rmssd, 1)}
            sub="RMSSD ms"
          />
          <Num
            label="Resp rate"
            value={formatNumber(
              sleep?.selectedNightFeature?.respiratoryRate,
              1,
            )}
            sub="breaths/min"
          />
        </div>
      </div>

      <div>
        <SectionHead>Hypnogram</SectionHead>
        <div className="mt-4">
          <Hypnogram epochs={epochs} />
        </div>
        <div className="flex gap-8 mt-5">
          {(
            [
              ["Awake", sleep?.stageTotals?.awakeMinutes, HYPNOGRAM_STAGES.awake.color],
              ["REM", sleep?.stageTotals?.remMinutes, HYPNOGRAM_STAGES.rem.color],
              ["Core", sleep?.stageTotals?.lightMinutes, HYPNOGRAM_STAGES.core.color],
              ["Deep", sleep?.stageTotals?.deepMinutes, HYPNOGRAM_STAGES.deep.color],
            ] as const
          ).map(([label, minutes, color]) => (
            <div key={label} className="flex items-center gap-2.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-text-1 text-sm">{label}</span>
              <span className="text-base font-semibold">{minutes ?? 0}m</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-16">
        <div>
          <SectionHead>Detection</SectionHead>
          <div className="mt-4 space-y-0">
            <Row k="Night date" v={sleep?.selectedDetection?.nightDate ?? "—"} />
            <Row k="Bedtime" v={formatTimestamp(sleep?.selectedDetection?.bedtime)} />
            <Row k="Wake" v={formatTimestamp(sleep?.selectedDetection?.wakeTime)} />
            <Row
              k="Interruptions"
              v={String(sleep?.selectedDetection?.interruptionCount ?? "—")}
            />
            <Row
              k="Continuity"
              v={formatNumber(sleep?.selectedDetection?.continuity, 3)}
            />
            <Row
              k="Coverage"
              v={formatNumber(sleep?.selectedDetection?.validCoverage, 3)}
            />
            <Row
              k="Confidence"
              v={formatNumber(sleep?.selectedDetection?.confidence, 3)}
            />
          </div>
        </div>
        <div>
          <SectionHead>Night features</SectionHead>
          <div className="mt-4 space-y-0">
            <Row
              k="SDNN"
              v={formatNumber(sleep?.selectedNightFeature?.sdnn, 1)}
            />
            <Row
              k="Sleep est."
              v={`${formatNumber(sleep?.selectedNightFeature?.sleepEstimateHours, 2)}h`}
            />
            <Row
              k="Regularity"
              v={formatNumber(sleep?.selectedNightFeature?.regularity, 3)}
            />
            <Row k="Source" v={sleep?.selectedNightFeature?.sourceBlend ?? "—"} />
            <Row k="Selection" v={sleep?.selectionReason ?? "—"} />
            <Row k="Epochs" v={String(sleep?.epochTimelineCount ?? 0)} />
          </div>
        </div>
      </div>
    </div>
  )
}
