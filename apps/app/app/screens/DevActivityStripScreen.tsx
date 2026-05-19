import { useMemo, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { SymbolView } from "expo-symbols"

import {
  ACCESSORY_METADATA,
  AccessorySnapshot,
  AccessoryState,
  AccessoryTone,
  DISMISSABLE_STATES,
  copyFor,
} from "@/components/ActivityStrip"
import { LOCAL_THEME } from "@/utils/localTheme"

const TONE_COLOR: Record<AccessoryTone, string> = {
  red:    "#FF453A",
  amber:  "#FF9F0A",
  teal:   "#64D2FF",
  blue:   "#0A84FF",
  green:  "#30D158",
  indigo: "#5E5CE6",
  gray:   "#8E8E93",
}

const ALL_STATES: AccessoryState[] = [
  "idle",
  "alarm_firing",
  "ble_error",
  "sync_error",
  "dead_letters",
  "disconnected_was_worn",
  "stale_sync",
  "app_update",
  "low_power_paused",
  "ble_connecting",
  "ble_syncing",
  "upload_draining",
  "synced_confirm",
  "offline_with_backlog",
  "battery_low",
  "alarm_armed_soon",
]

function mockSnapshot(state: AccessoryState): AccessorySnapshot {
  const now = Date.now()
  const base: AccessorySnapshot = {
    bleError: null,
    syncError: null,
    pipelineState: "idle",
    deadCount: 0,
    connectionState: "disconnected",
    wasWornRecently: false,
    disconnectedAt: null,
    lastSyncAt: null,
    isAppUpdateAvailable: false,
    isLowPowerMode: false,
    isOnline: true,
    pendingCount: 0,
    bleIsSyncing: false,
    syncStage: null,
    syncProgress: null,
    syncIteration: null,
    syncIterationCap: null,
    queueIsSyncing: false,
    syncSummary: null,
    batteryLevel: null,
    isCharging: false,
    strapAlarmArmed: false,
    strapAlarmAt: null,
    now,
  }
  switch (state) {
    case "alarm_firing":
      return { ...base, strapAlarmArmed: true, strapAlarmAt: now - 5_000 }
    case "ble_error":
      return { ...base, bleError: "Lost packets after handshake" }
    case "sync_error":
      return { ...base, syncError: "HTTP 500" }
    case "dead_letters":
      return { ...base, deadCount: 12 }
    case "disconnected_was_worn":
      return {
        ...base,
        connectionState: "disconnected",
        wasWornRecently: true,
        disconnectedAt: now - 120_000,
      }
    case "stale_sync":
      return {
        ...base,
        connectionState: "ready",
        lastSyncAt: now - 2 * 24 * 60 * 60 * 1000,
      }
    case "app_update":
      return { ...base, isAppUpdateAvailable: true }
    case "low_power_paused":
      return { ...base, isLowPowerMode: true, pendingCount: 30 }
    case "ble_connecting":
      return { ...base, connectionState: "connecting" }
    case "ble_syncing":
      return {
        ...base,
        connectionState: "ready",
        bleIsSyncing: true,
        syncIteration: 3,
        syncIterationCap: 5,
      }
    case "upload_draining":
      return { ...base, queueIsSyncing: true, pendingCount: 247 }
    case "synced_confirm":
      return { ...base, syncSummary: { nights: 3, stages: 247, scores: 12 } }
    case "offline_with_backlog":
      return { ...base, isOnline: false, pendingCount: 7 }
    case "battery_low":
      return { ...base, batteryLevel: 17, isCharging: false }
    case "alarm_armed_soon":
      return {
        ...base,
        strapAlarmArmed: true,
        strapAlarmAt: now + 30 * 60 * 1000,
      }
    case "idle":
    default:
      return base
  }
}

export default function DevActivityStripScreen() {
  const [selected, setSelected] = useState<AccessoryState>("ble_syncing")
  const snapshot = useMemo(() => mockSnapshot(selected), [selected])
  const meta = selected === "idle" ? null : ACCESSORY_METADATA[selected]
  const tone: AccessoryTone = meta?.tone ?? "gray"
  const color = TONE_COLOR[tone]
  const copy = copyFor(selected, snapshot)
  const icon = meta?.icon ?? "circle"

  return (
    <SafeAreaView edges={["bottom"]} style={styles.root}>
      <Text style={styles.h1}>Activity Strip — Preview</Text>

      <View style={styles.previewWrap}>
        <Text style={styles.label}>Regular placement</Text>
        <View style={[styles.pill, styles.pillRegular]}>
          {selected !== "idle" ? (
            <>
              <SymbolView name={icon as never} size={18} tintColor={color} resizeMode="scaleAspectFit" />
              <Text numberOfLines={1} style={[styles.pillText, { color }]}>
                {copy}
              </Text>
              {DISMISSABLE_STATES.has(selected) && (
                <SymbolView name="xmark" size={12} tintColor={color} resizeMode="scaleAspectFit" />
              )}
            </>
          ) : (
            <Text style={styles.idleText}>(hidden — accessory collapsed)</Text>
          )}
        </View>

        <Text style={styles.label}>Inline placement</Text>
        <View style={[styles.pill, styles.pillInline]}>
          {selected !== "idle" ? (
            <SymbolView name={icon as never} size={18} tintColor={color} resizeMode="scaleAspectFit" />
          ) : (
            <Text style={styles.idleText}>—</Text>
          )}
        </View>

        {meta && (
          <Text style={styles.meta}>
            priority {meta.priority} · hold {meta.minHoldMs}ms · {meta.persistent ? "persistent" : "transient"}
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {ALL_STATES.map((s) => {
          const m = s === "idle" ? null : ACCESSORY_METADATA[s]
          const c = m ? TONE_COLOR[m.tone] : "#999"
          const i = m?.icon ?? "circle"
          return (
            <Pressable
              key={s}
              onPress={() => setSelected(s)}
              style={[styles.row, selected === s && styles.rowSelected]}
            >
              <SymbolView name={i as never} size={16} tintColor={c} resizeMode="scaleAspectFit" />
              <Text style={styles.rowState}>{s}</Text>
              <Text style={styles.rowMeta}>{m ? `p${m.priority}` : ""}</Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: LOCAL_THEME.colors.background },
  h1: {
    color: LOCAL_THEME.colors.text,
    fontSize: 18,
    fontWeight: "700",
    padding: 16,
  },
  previewWrap: { paddingHorizontal: 16, gap: 8 },
  label: {
    color: LOCAL_THEME.colors.textDim,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: LOCAL_THEME.colors.surfaceSubtle,
  },
  pillRegular: { alignSelf: "stretch", justifyContent: "center" },
  pillInline: { alignSelf: "flex-start", paddingHorizontal: 10 },
  pillText: { fontSize: 14, fontWeight: "600" },
  idleText: { color: LOCAL_THEME.colors.textMuted, fontSize: 13 },
  meta: {
    color: LOCAL_THEME.colors.textDim,
    fontSize: 11,
    marginTop: 6,
    fontVariant: ["tabular-nums"],
  },
  list: { padding: 16, gap: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  rowSelected: { backgroundColor: LOCAL_THEME.colors.surfaceElevated },
  rowState: { color: LOCAL_THEME.colors.text, fontSize: 14, flex: 1 },
  rowMeta: {
    color: LOCAL_THEME.colors.textDim,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
})
