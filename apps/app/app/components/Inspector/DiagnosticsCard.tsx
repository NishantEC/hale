import { FC, useMemo } from "react"
import { View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { DebugOverview } from "@/services/api/noopClient"
import { LOCAL_THEME } from "@/utils/localTheme"

import { CoverageBar } from "./CoverageBar"
import { InspectorCard } from "./InspectorCard"
import { StatusPill, StatusTone } from "./StatusPill"

type Props = {
  overview: DebugOverview | null
  lastPipelineRun?: {
    startedAt: string
    durationMs: number
    detections: number
    sleepStages: number
    computeMs: number | null
    skipped: boolean
  } | null
}

function formatNightDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" })
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(0)}s`
}

export const DiagnosticsCard: FC<Props> = ({ overview, lastPipelineRun }) => {
  const { colors } = LOCAL_THEME
  const recentNights = overview?.recentNights ?? []
  const coverageMin = overview?.todayCoverageMinutes ?? 0

  const { tone, pillText, defaultExpanded } = useMemo(() => {
    const missed = recentNights.filter((n) => !n.hasDetection).length
    const coveragePct = coverageMin / 1440
    const issues = missed + (coveragePct < 0.8 ? 1 : 0)
    let nextTone: StatusTone = "ok"
    let nextText = "OK"
    if (missed > 0) {
      nextTone = missed >= 2 ? "bad" : "warn"
      nextText = `${missed} night${missed === 1 ? "" : "s"} missed`
    } else if (coveragePct < 0.3) {
      nextTone = "bad"
      nextText = "Low coverage"
    } else if (coveragePct < 0.8) {
      nextTone = "warn"
      nextText = "Coverage gap"
    }
    return { tone: nextTone, pillText: nextText, defaultExpanded: issues > 0 }
  }, [recentNights, coverageMin])

  return (
    <InspectorCard
      title="Diagnostics"
      pill={<StatusPill tone={tone} text={pillText} />}
      defaultExpanded={defaultExpanded}
    >
      <SectionLabel text="Last 3 nights" />
      {recentNights.length === 0 ? (
        <Text text="No data" size="xs" style={{ color: colors.textDim }} />
      ) : (
        recentNights.map((n) => <NightRow key={n.nightDate} night={n} />)
      )}

      <SectionLabel text="Today's coverage" />
      <CoverageBar coveredMinutes={coverageMin} />
      <View style={[$row, { borderTopWidth: 0, paddingTop: 4 }]}>
        <Text
          text={`${coverageMin} min of 1440`}
          size="xs"
          style={{ color: colors.textDim, fontVariant: ["tabular-nums"] }}
        />
        <Text
          text={`${((coverageMin / 1440) * 100).toFixed(0)}%`}
          size="xs"
          weight="semiBold"
          style={{ color: colors.text, fontVariant: ["tabular-nums"] }}
        />
      </View>

      <SectionLabel text="Last pipeline run" />
      {lastPipelineRun ? (
        <>
          <Row
            label={new Date(lastPipelineRun.startedAt).toLocaleTimeString()}
            value={`${lastPipelineRun.detections} det · ${lastPipelineRun.sleepStages} stages`}
          />
          {lastPipelineRun.computeMs != null ? (
            <Row
              label="compute"
              value={`${formatDuration(lastPipelineRun.computeMs)} of ${formatDuration(lastPipelineRun.durationMs)}`}
              tone={lastPipelineRun.computeMs > 60_000 ? "warn" : undefined}
            />
          ) : null}
        </>
      ) : (
        <Text text="No runs yet" size="xs" style={{ color: colors.textDim }} />
      )}
    </InspectorCard>
  )
}

const SectionLabel: FC<{ text: string }> = ({ text }) => {
  const { colors } = LOCAL_THEME
  return (
    <Text
      text={text}
      size="xxs"
      weight="bold"
      style={{
        color: colors.textDim,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginTop: 8,
        marginBottom: 4,
      }}
    />
  )
}

const NightRow: FC<{
  night: { nightDate: string; hasDetection: boolean; rawRecordCount: number }
}> = ({ night }) => {
  const { colors } = LOCAL_THEME
  return (
    <View style={[$row, { borderTopColor: colors.divider }]}>
      <Text text={formatNightDate(night.nightDate)} size="xs" style={{ color: colors.textDim }} />
      <Text
        text={night.hasDetection ? "classified" : `no detection · ${night.rawRecordCount} rec`}
        size="xs"
        weight="semiBold"
        style={{
          color: night.hasDetection ? colors.text : colors.statusRed,
          fontVariant: ["tabular-nums"],
        }}
      />
    </View>
  )
}

type RowProps = { label: string; value: string; tone?: "warn" | "bad" }
const Row: FC<RowProps> = ({ label, value, tone }) => {
  const { colors } = LOCAL_THEME
  const valueColor = tone === "warn" ? colors.statusAmber : tone === "bad" ? colors.statusRed : colors.text
  return (
    <View style={[$row, { borderTopColor: colors.divider }]}>
      <Text text={label} size="xs" style={{ color: colors.textDim }} />
      <Text
        text={value}
        size="xs"
        weight="semiBold"
        style={{ color: valueColor, fontVariant: ["tabular-nums"] }}
      />
    </View>
  )
}

const $row: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingVertical: 5,
  borderTopWidth: 1,
}
