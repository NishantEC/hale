import { FC, useState } from "react"
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  UIManager,
  View,
  ViewStyle,
} from "react-native"
import { CaretRight } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

import type { VitalRow } from "./CollapsibleVitalsCard"

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

type Props = {
  score: string
  scoreSubscript?: string
  verdict: string
  body: string
  tint: string
  rows: VitalRow[]
  defaultExpanded?: boolean
}

export const HealthMonitorCard: FC<Props> = ({
  score,
  scoreSubscript,
  verdict,
  body,
  tint,
  rows,
  defaultExpanded = false,
}) => {
  const { colors } = LOCAL_THEME
  const [expanded, setExpanded] = useState(defaultExpanded)

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setExpanded((v) => !v)
  }

  return (
    <View style={[$card, { backgroundColor: colors.surfaceCard }]}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={`Health Monitor, ${expanded ? "tap to collapse" : "tap to expand"}`}
        style={$hero}
      >
        <View style={$heroHead}>
          <Text
            text="HEALTH MONITOR"
            style={{
              color: colors.textDim,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 1.4,
              flex: 1,
            }}
          />
          <View style={expanded ? $caretOpen : null}>
            <CaretRight size={14} color={colors.textMuted} />
          </View>
        </View>
        <View style={$scoreRow}>
          <Text
            text={score}
            style={{
              color: tint,
              fontSize: 56,
              fontWeight: "200",
              letterSpacing: -2,
              lineHeight: 60,
              fontVariant: ["tabular-nums"],
            }}
          />
          {scoreSubscript ? (
            <Text
              text={scoreSubscript}
              style={{
                color: tint,
                fontSize: 16,
                fontWeight: "500",
                opacity: 0.7,
                marginLeft: 4,
                marginBottom: 14,
                fontVariant: ["tabular-nums"],
              }}
            />
          ) : null}
        </View>
        <Text
          text={verdict}
          style={{
            color: colors.text,
            fontSize: 16,
            fontWeight: "700",
            marginTop: 4,
          }}
        />
        <Text
          text={body}
          style={{
            color: colors.textDim,
            fontSize: 13,
            fontWeight: "400",
            lineHeight: 18,
            marginTop: 6,
          }}
        />
        {!expanded && rows.length > 0 ? (
          <View style={$statusStrip}>
            {rows.map((r) => (
              <View
                key={`dot-${r.key}`}
                style={[
                  $statusDot,
                  { backgroundColor: statusColor(r, colors) },
                ]}
              />
            ))}
          </View>
        ) : null}
      </Pressable>

      {expanded ? (
        <View style={[$divider, { backgroundColor: colors.surfaceElevated }]} />
      ) : null}

      {expanded ? (
        <View style={$vitalsBody}>
          <View style={[$colHead, { borderBottomColor: colors.surfaceElevated }]}>
            <View style={{ width: 18 }} />
            <Text
              text="VITAL"
              style={{
                color: colors.textMuted,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 1.2,
                flex: 1,
              }}
            />
            <Text
              text="TODAY"
              style={{
                color: colors.textMuted,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 1.2,
                width: 56,
                textAlign: "right",
              }}
            />
            <Text
              text="RANGE"
              style={{
                color: colors.textMuted,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 1.2,
                width: 80,
                textAlign: "right",
              }}
            />
            <Text
              text="vs 7d"
              style={{
                color: colors.textMuted,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 1.2,
                width: 48,
                textAlign: "right",
              }}
            />
          </View>
          {rows.map((row, i) => (
            <VitalRowView
              key={row.key}
              row={row}
              isLast={i === rows.length - 1}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

const VitalRowView: FC<{ row: VitalRow; isLast: boolean }> = ({ row, isLast }) => {
  const { colors } = LOCAL_THEME
  const deltaColor =
    row.deltaDirection === "up"
      ? colors.statusGreen
      : row.deltaDirection === "down"
        ? colors.statusRed
        : colors.textMuted

  const fillStartPct = row.fillStart != null ? clampPct(row.fillStart) : 0.2
  const fillWidthPct =
    row.fillEnd != null && row.fillStart != null
      ? clampPct(row.fillEnd - row.fillStart)
      : 0.6
  const markFraction = row.rangeFraction != null ? clampPct(row.rangeFraction) : null

  const content = (
    <View
      style={[
        $row,
        isLast
          ? null
          : {
              borderBottomColor: colors.surfaceElevated,
              borderBottomWidth: StyleSheet.hairlineWidth,
            },
      ]}
    >
      <View style={[$rowDot, { backgroundColor: statusColor(row, colors) }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          text={row.name}
          style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}
        />
        {row.unit ? (
          <Text
            text={row.unit}
            style={{ color: colors.textMuted, fontSize: 11 }}
          />
        ) : null}
      </View>
      <Text
        text={row.value}
        style={{
          color: colors.text,
          fontSize: 18,
          fontWeight: "800",
          letterSpacing: -0.2,
          width: 56,
          textAlign: "right",
          fontVariant: ["tabular-nums"],
        }}
      />
      <View style={$rangeBox}>
        <View style={[$rangeTrack, { backgroundColor: colors.surfaceElevated }]}>
          <View
            style={[
              $rangeFill,
              {
                backgroundColor: statusColor(row, colors),
                left: `${fillStartPct * 100}%`,
                width: `${fillWidthPct * 100}%`,
              },
            ]}
          />
          {markFraction != null ? (
            <View
              style={[
                $rangeMark,
                { backgroundColor: colors.text, left: `${markFraction * 100}%` },
              ]}
            />
          ) : null}
        </View>
        {row.rangeLabel ? (
          <Text
            text={row.rangeLabel}
            style={{ color: colors.textMuted, fontSize: 10, fontVariant: ["tabular-nums"] }}
          />
        ) : null}
      </View>
      <View style={{ width: 48, alignItems: "flex-end" }}>
        {row.deltaText ? (
          <Text
            text={row.deltaText}
            style={{
              color: deltaColor,
              fontSize: 11,
              fontWeight: "600",
              fontVariant: ["tabular-nums"],
            }}
          />
        ) : null}
      </View>
    </View>
  )
  if (!row.onPress) return content
  return (
    <Pressable onPress={row.onPress} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
      {content}
    </Pressable>
  )
}

function statusColor(
  row: { status: VitalRow["status"] },
  colors: typeof LOCAL_THEME.colors,
): string {
  if (row.status === "ok") return colors.statusGreen
  if (row.status === "warn") return colors.statusAmber
  if (row.status === "alert") return colors.statusRed
  return colors.textMuted
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

const $card: ViewStyle = {
  borderRadius: 18,
  overflow: "hidden",
}

const $hero: ViewStyle = {
  paddingHorizontal: 20,
  paddingTop: 18,
  paddingBottom: 18,
}

const $heroHead: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
}

const $scoreRow: ViewStyle = {
  flexDirection: "row",
  alignItems: "flex-end",
  marginTop: 8,
}

const $statusStrip: ViewStyle = {
  flexDirection: "row",
  gap: 6,
  marginTop: 14,
}

const $statusDot: ViewStyle = {
  width: 7,
  height: 7,
  borderRadius: 4,
}

const $caretOpen: ViewStyle = {
  transform: [{ rotate: "90deg" }],
}

const $divider: ViewStyle = {
  height: StyleSheet.hairlineWidth,
}

const $vitalsBody: ViewStyle = {
  paddingHorizontal: 16,
  paddingBottom: 14,
}

const $colHead: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
  paddingTop: 14,
  paddingBottom: 8,
  borderBottomWidth: StyleSheet.hairlineWidth,
}

const $row: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
  paddingVertical: 12,
}

const $rowDot: ViewStyle = {
  width: 8,
  height: 8,
  borderRadius: 4,
  marginLeft: 4,
  marginRight: 4,
}

const $rangeBox: ViewStyle = {
  width: 80,
  alignItems: "flex-end",
  gap: 3,
}

const $rangeTrack: ViewStyle = {
  position: "relative",
  width: 70,
  height: 5,
  borderRadius: 3,
}

const $rangeFill: ViewStyle = {
  position: "absolute",
  top: 0,
  bottom: 0,
  borderRadius: 3,
}

const $rangeMark: ViewStyle = {
  position: "absolute",
  top: -3,
  bottom: -3,
  width: 2,
  borderRadius: 1,
}
