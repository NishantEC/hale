import { FC, useEffect, useState } from "react"
import { View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import {
  getSyncTelemetry,
  subscribeSyncTelemetry,
  type AckWrite,
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

  const writes: AckWrite[] = telemetry.ackWrites
  const count = telemetry.ackWriteCount
  const lastWrite = writes[0] ?? null

  // The strap is silent by design for cmd 23 (see commit log on this
  // file). We stopped subscribing for responses 2026-05-23, so all we
  // can report is "how many acks we wrote" and "what trim came out of
  // the last one." Both growing is the success signal.
  const pillTone = count > 0 ? "ok" : "dim"
  const pillText = count === 0 ? "idle" : `${count} written`

  return (
    <InspectorCard
      title="Ack writes"
      pill={<StatusPill tone={pillTone} text={pillText} />}
      defaultExpanded
    >
      <Text
        text="HistoricalDataAck (cmd 23) writes to the strap. The strap processes these silently — it advances its read cursor but never sends a CommandResponse, so we don't subscribe for one anymore (was wasted listener + noisy WARN log). A growing count + advancing trim is what sync working looks like."
        size="xxs"
        style={{ color: colors.textDim, paddingBottom: 8 }}
      />

      {lastWrite ? (
        <View style={$summaryRow}>
          <SummaryItem label="last trim" value={String(lastWrite.trimValue)} />
          <SummaryItem label="last write" value={formatIstHms(lastWrite.at)} />
        </View>
      ) : null}

      {writes.length === 0 ? (
        <Text
          text="No acks recorded yet — kick off a Sync to populate."
          size="xxs"
          style={{ color: colors.textDim, marginTop: 6 }}
        />
      ) : (
        <View style={{ marginTop: 8 }}>
          <View style={[$headerRow, { borderTopColor: colors.divider }]}>
            <Cell text="time" flex={1.6} dim />
            <Cell text="trim" flex={2.2} dim align="right" />
          </View>
          {writes.slice(0, 12).map((r) => (
            <View
              key={`${r.at}-${r.trimValue}`}
              style={[$row, { borderTopColor: colors.divider }]}
            >
              <Cell text={formatIstHms(r.at)} flex={1.6} />
              <Cell text={String(r.trimValue)} flex={2.2} align="right" />
            </View>
          ))}
        </View>
      )}
    </InspectorCard>
  )
}

const SummaryItem: FC<{ label: string; value: string }> = ({ label, value }) => {
  const { colors } = LOCAL_THEME
  return (
    <View style={{ flex: 1 }}>
      <Text text={label} size="xxs" style={{ color: colors.textDim }} />
      <Text
        text={value}
        size="sm"
        weight="semiBold"
        style={{ color: colors.text, fontVariant: ["tabular-nums"] }}
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

const $summaryRow: ViewStyle = { flexDirection: "row", gap: 6 }
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
