import { FC, useEffect, useState } from "react"
import { View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import {
  getSyncTelemetry,
  subscribeSyncTelemetry,
  type AckResponse,
} from "@/services/sync/syncTelemetry"
import { LOCAL_THEME } from "@/utils/localTheme"

import { InspectorCard } from "./InspectorCard"
import { StatusPill } from "./StatusPill"

function formatIstHms(ms: number): string {
  const ist = new Date(ms + 5.5 * 60 * 60 * 1000)
  return ist.toISOString().slice(11, 19)
}

export const AckResponsesCard: FC = () => {
  const { colors } = LOCAL_THEME
  const [telemetry, setTelemetry] = useState(() => getSyncTelemetry())

  useEffect(() => {
    const unsub = subscribeSyncTelemetry(() => {
      setTelemetry(getSyncTelemetry())
    })
    return unsub
  }, [])

  const counters = telemetry.ackCounters
  const responses: AckResponse[] = telemetry.ackResponses

  // Post c33cc6e4 the strap *not* responding to acks is the steady state —
  // we made ack-response observation fire-and-forget so the persistChain
  // advances on the BLE link-layer ack instead. So "0/N responded" is
  // normal and shouldn't paint the pill red. Only firmware-rejected acks
  // (status != 0 in a real response) are an actual problem.
  const pillTone =
    counters.rejected > 0
      ? "warn"
      : counters.sent > 0
        ? counters.responded > 0
          ? "ok"
          : "dim"
        : "dim"

  const pillText =
    counters.sent === 0
      ? "idle"
      : counters.responded > 0
        ? `${counters.responded}/${counters.sent} resp`
        : `${counters.sent} sent`

  return (
    <InspectorCard
      title="Ack responses"
      pill={<StatusPill tone={pillTone} text={pillText} />}
      defaultExpanded
    >
      <Text
        text="Strap's reply to each HistoricalDataAck. The strap normally doesn't respond — we observe it fire-and-forget so the persist chain advances on the BLE link-layer ack. Timeouts here are expected and harmless."
        size="xxs"
        style={{ color: colors.textDim, paddingBottom: 8 }}
      />

      <View style={$counterRow}>
        <Counter label="sent" value={counters.sent} />
        <Counter label="responded" value={counters.responded} color="#86efac" />
        <Counter label="timed out" value={counters.timedOut} color="#fca5a5" />
        <Counter label="rejected" value={counters.rejected} color="#fcd34d" />
      </View>

      {responses.length === 0 ? (
        <Text
          text="No acks recorded yet — kick off a Sync to populate."
          size="xxs"
          style={{ color: colors.textDim, marginTop: 6 }}
        />
      ) : (
        <View style={{ marginTop: 8 }}>
          <View style={[$headerRow, { borderTopColor: colors.divider }]}>
            <Cell text="time" flex={1.6} dim />
            <Cell text="trim" flex={1.8} dim />
            <Cell text="dur" flex={0.9} dim align="right" />
            <Cell text="resp" flex={2.5} dim align="right" />
          </View>
          {responses.slice(0, 12).map((r) => (
            <View
              key={`${r.at}-${r.trimValue}`}
              style={[$row, { borderTopColor: colors.divider }]}
            >
              <Cell text={formatIstHms(r.at)} flex={1.6} />
              <Cell text={String(r.trimValue)} flex={1.8} />
              <Cell text={`${r.durationMs}ms`} flex={0.9} align="right" />
              <Cell
                text={
                  r.responseHex == null
                    ? "—"
                    : `${r.responseHex.split(" ").slice(0, 2).join(" ")}…`
                }
                flex={2.5}
                align="right"
                color={
                  r.responseHex == null
                    ? "#fca5a5"
                    : r.status != null && r.status !== 0
                      ? "#fcd34d"
                      : "#86efac"
                }
              />
            </View>
          ))}
        </View>
      )}
    </InspectorCard>
  )
}

const Counter: FC<{ label: string; value: number; color?: string }> = ({
  label,
  value,
  color,
}) => {
  const { colors } = LOCAL_THEME
  return (
    <View style={{ flex: 1 }}>
      <Text text={label} size="xxs" style={{ color: colors.textDim }} />
      <Text
        text={String(value)}
        size="sm"
        weight="semiBold"
        style={{ color: color ?? colors.text, fontVariant: ["tabular-nums"] }}
      />
    </View>
  )
}

const Cell: FC<{
  text: string
  flex: number
  align?: "left" | "right"
  dim?: boolean
  color?: string
}> = ({ text, flex, align = "left", dim, color }) => {
  const { colors } = LOCAL_THEME
  return (
    <Text
      text={text}
      size="xxs"
      style={{
        flex,
        textAlign: align,
        color: color ?? (dim ? colors.textDim : colors.text),
        fontVariant: ["tabular-nums"],
      }}
    />
  )
}

const $counterRow: ViewStyle = { flexDirection: "row", gap: 6 }
const $headerRow: ViewStyle = {
  flexDirection: "row",
  paddingVertical: 6,
  borderTopWidth: 1,
}
const $row: ViewStyle = {
  flexDirection: "row",
  paddingVertical: 4,
  borderTopWidth: 1,
}
