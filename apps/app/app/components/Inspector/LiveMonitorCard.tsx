import { FC, useMemo } from "react"
import { View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { useBle } from "@/context/BleContext"
import { useOutboundQueueStats } from "@/hooks/useOutboundQueueStats"
import { DebugOverview } from "@/services/api/noopClient"

import { InspectorCard } from "./InspectorCard"
import { StatusPill, StatusTone } from "./StatusPill"

type Props = { overview: DebugOverview | null }

function ageHoursFrom(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, (now - t) / (60 * 60 * 1000))
}

function formatAge(hours: number | null): string {
  if (hours == null) return "—"
  if (hours < 1) return `${Math.round(hours * 60)}m ago`
  if (hours < 24) return `${hours.toFixed(1)}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export const LiveMonitorCard: FC<Props> = ({ overview }) => {
  const ble = useBle()
  const queueStats = useOutboundQueueStats()

  const lastRecordAgeH = ageHoursFrom(overview?.latestRawTimestamp)
  const lastStreamAgeH = ageHoursFrom(overview?.latestSignalSampleAt)
  const lastPipelineAgeH = ageHoursFrom(overview?.latestSyncMetadata?.lastRawRecordAt)

  const { tone, pillText, defaultExpanded } = useMemo(() => {
    const isStaleRecord = lastRecordAgeH != null && lastRecordAgeH > 1
    const isBleDown = ble.connectionState !== "ready"
    const isQueueDead = (queueStats.deadCount ?? 0) > 0
    const isLowBattery = (ble.batteryLevel ?? 100) < 15
    const isStreamDead = lastStreamAgeH != null && lastStreamAgeH > 1

    const issues = [isStaleRecord, isBleDown, isQueueDead, isLowBattery, isStreamDead].filter(Boolean).length

    let nextTone: StatusTone = "ok"
    let nextText = "Healthy"
    if (isBleDown || isStreamDead || isQueueDead) {
      nextTone = "bad"
      nextText = isBleDown ? "BLE down" : isStreamDead ? "Stream dead" : "Queue blocked"
    } else if (isStaleRecord || isLowBattery) {
      nextTone = "warn"
      nextText = isStaleRecord ? `Stale ${formatAge(lastRecordAgeH)}` : "Low battery"
    }
    return { tone: nextTone, pillText: nextText, defaultExpanded: issues > 0 }
  }, [ble.connectionState, ble.batteryLevel, lastRecordAgeH, lastStreamAgeH, queueStats.deadCount])

  return (
    <InspectorCard
      title="Live Monitor"
      pill={<StatusPill tone={tone} text={pillText} />}
      defaultExpanded={defaultExpanded}
    >
      <Row label="BLE" value={`${ble.connectionState} · ${ble.isWorn ? "on wrist" : "off wrist"}`} />
      <Row
        label="Battery"
        value={
          ble.batteryLevel != null
            ? `${ble.batteryLevel.toFixed(0)}% · ${ble.isCharging ? "charging" : "not charging"}`
            : "—"
        }
        tone={(ble.batteryLevel ?? 100) < 15 ? "warn" : undefined}
      />
      <Row
        label="Last record"
        value={formatAge(lastRecordAgeH)}
        tone={
          lastRecordAgeH != null && lastRecordAgeH > 6
            ? "bad"
            : lastRecordAgeH != null && lastRecordAgeH > 1
              ? "warn"
              : undefined
        }
      />
      <Row
        label="Live HR"
        value={
          ble.realtimeHeartRate != null
            ? `${ble.realtimeHeartRate} bpm`
            : lastStreamAgeH != null && lastStreamAgeH > 1
              ? `— (stream dead ${formatAge(lastStreamAgeH)})`
              : "—"
        }
        tone={lastStreamAgeH != null && lastStreamAgeH > 1 ? "bad" : undefined}
      />
      <Row
        label="Queue"
        value={`${queueStats.depth ?? 0} pending · ${queueStats.deadCount ?? 0} dead`}
        tone={(queueStats.deadCount ?? 0) > 0 ? "bad" : undefined}
      />
      <Row label="Pipeline" value={formatAge(lastPipelineAgeH)} />
    </InspectorCard>
  )
}

type RowProps = { label: string; value: string; tone?: "warn" | "bad" }

const TONE_COLOR: Record<NonNullable<RowProps["tone"]>, string> = {
  warn: "#7a5202",
  bad: "#8a1a1a",
}

const Row: FC<RowProps> = ({ label, value, tone }) => (
  <View style={$row}>
    <Text text={label} size="xs" style={{ color: "#564E4A" }} />
    <Text
      text={value}
      size="xs"
      weight="semiBold"
      style={{ color: tone ? TONE_COLOR[tone] : "#191015", fontVariant: ["tabular-nums"] }}
    />
  </View>
)

const $row: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingVertical: 7,
  borderTopWidth: 1,
  borderTopColor: "rgba(0,0,0,0.06)",
}
