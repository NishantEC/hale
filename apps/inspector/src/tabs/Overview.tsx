import type { HomeView, Overview, SleepView } from "../api"
import { Num, Row, SectionHead } from "../components/primitives"
import { formatTimestamp } from "../format"

export function OverviewTab({
  overview,
  homeView,
  sleepView,
}: {
  overview: Overview | null
  homeView: HomeView | null
  sleepView: SleepView | null
}) {
  return (
    <div className="space-y-10">
      <div>
        <SectionHead>Counts</SectionHead>
        <div className="grid grid-cols-4 gap-8 mt-4">
          <Num
            label="Raw rows"
            value={overview?.counts.rawRecordCount ?? 0}
            sub={`Day: ${overview?.counts.selectedDayRawRecordCount ?? 0}`}
          />
          <Num
            label="Detections"
            value={overview?.counts.sleepDetectionCount ?? 0}
            sub={overview?.selectionMode ?? "—"}
          />
          <Num
            label="Stages"
            value={overview?.counts.sleepStageCount ?? 0}
            sub={`Epochs: ${overview?.selectedEntities.epochTimelineCount ?? 0}`}
          />
          <Num
            label="Scores"
            value={overview?.counts.dailyScoreCount ?? 0}
            sub={overview?.lastPipelineRunStatus ?? "—"}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-16">
        <div>
          <SectionHead>Sync state</SectionHead>
          <div className="mt-4 space-y-0">
            <Row k="Selection" v={overview?.selectionMode ?? "—"} />
            <Row k="Selected night" v={overview?.selectedNightDate ?? "—"} />
            <Row k="Earliest raw" v={formatTimestamp(overview?.earliestRawTimestamp)} />
            <Row k="Latest raw" v={formatTimestamp(overview?.latestRawTimestamp)} />
            <Row
              k="Plan updated"
              v={formatTimestamp(
                overview?.latestSyncMetadata.lastSleepPlanUpdateAt,
              )}
            />
            <Row k="Reason" v={overview?.selectionReason ?? "—"} />
          </div>
        </div>
        <div>
          <SectionHead>App views</SectionHead>
          <div className="mt-4 space-y-0">
            <Row k="Headline" v={homeView?.todayOverview.headline ?? "—"} />
            <Row
              k="Recommendation"
              v={homeView?.cards.recommendation.title ?? "—"}
            />
            <Row
              k="Sleep empty"
              v={sleepView?.emptyState.isEmpty ? "Yes" : "No"}
            />
            <Row
              k="Bed → Wake"
              v={
                sleepView
                  ? `${sleepView.header.bedtime} → ${sleepView.header.wakeTime}`
                  : "—"
              }
            />
            <Row k="Duration" v={sleepView?.header.duration ?? "—"} />
            <Row k="Insight" v={sleepView?.sleepInsight ?? "—"} />
          </div>
        </div>
      </div>
    </div>
  )
}
