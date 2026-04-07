import { FC, useRef, useEffect, useState, useCallback } from "react"
import { Ionicons } from "@expo/vector-icons"
import {
  LayoutAnimation,
  Modal,
  Pressable,
  RefreshControl,
  Switch,
  TextStyle,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native"
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated"
import { useNavigation, useRoute } from "@react-navigation/native"

import { BarSeriesChart } from "@/components/BarSeriesChart"
import { HypnogramChart } from "@/components/HypnogramChart"
import { InlineLineChart } from "@/components/InlineLineChart"
import { Screen } from "@/components/Screen"
import { SleepHeartRateChart } from "@/components/SleepHeartRateChart"
import { Text } from "@/components/Text"
import { Toast } from "@/components/reactx/toast"
import { useDashboard } from "@/context/DashboardContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const ACCENT = "#BDD7FF"
const SCREEN_BG = "#06070A"
const KEY_METRIC_LABELS = ["Efficiency", "Resting HR", "HRV (RMSSD)", "Interruptions"]

function scoreColor(score: number): string {
  if (score >= 80) return "#57D37C"
  if (score >= 60) return "#FFD666"
  return "#FF7F7F"
}

function scoreQuality(score: number): string {
  if (score >= 80) return "Good"
  if (score >= 60) return "Fair"
  return "Poor"
}

function wrapMinutes(minutes: number) {
  const fullDay = 24 * 60
  return ((minutes % fullDay) + fullDay) % fullDay
}

function formatClockMinutes(minutes: number) {
  const normalized = wrapMinutes(minutes)
  const hours = Math.floor(normalized / 60)
  const mins = normalized % 60
  const suffix = hours >= 12 ? "PM" : "AM"
  const hour12 = hours % 12 || 12
  return `${hour12}:${String(mins).padStart(2, "0")} ${suffix}`
}

export const SleepDetailScreen: FC = () => {
  const { themed } = useAppTheme()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { width } = useWindowDimensions()
  const {
    sleepView, isRefreshing, refreshDashboard, error, clearError, selectedDate,
    liveDeviceState, saveSleepPlan, armAlarm, disarmAlarm,
  } = useDashboard()

  const date: string = (route.params?.date as string) ?? selectedDate
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [sheetVisible, setSheetVisible] = useState(false)
  const sheetTranslateY = useSharedValue(400)
  const backdropOpacity = useSharedValue(0)
  const lastShownError = useRef<string | null>(null)

  const openSheet = useCallback(() => {
    setSheetVisible(true)
    backdropOpacity.value = withTiming(1, { duration: 250 })
    sheetTranslateY.value = withSpring(0, { damping: 28, stiffness: 300 })
  }, [])

  const closeSheet = useCallback(() => {
    backdropOpacity.value = withTiming(0, { duration: 200 })
    sheetTranslateY.value = withSpring(400, { damping: 28, stiffness: 300 }, (finished) => {
      if (finished) runOnJS(setSheetVisible)(false)
    })
  }, [])

  const updatePlanner = useCallback(
    async (patch: Partial<{ targetSleepMinutes: number; wakeMinutes: number; alarmEnabled: boolean; alarmMinutes: number; smartWakeEnabled: boolean }>) => {
      if (!sleepView) return
      await saveSleepPlan({
        targetSleepMinutes: patch.targetSleepMinutes ?? sleepView.planner.targetSleepMinutes,
        wakeMinutes: patch.wakeMinutes ?? sleepView.planner.wakeMinutes,
        alarmEnabled: patch.alarmEnabled ?? sleepView.planner.alarmEnabled,
        alarmMinutes: patch.alarmMinutes ?? sleepView.planner.alarmMinutes,
        smartWakeEnabled: patch.smartWakeEnabled ?? sleepView.planner.smartWakeEnabled,
      })
    },
    [saveSleepPlan, sleepView],
  )

  useEffect(() => {
    if (error && error !== lastShownError.current) {
      lastShownError.current = error
      Toast.show(error, { type: "error", position: "top", duration: 4000 })
      clearError()
    } else if (!error) {
      lastShownError.current = null
    }
  }, [error, clearError])

  const chartWidth = width - 48

  // Resolve sleep score
  const scorePoint =
    sleepView?.sleepScoreTrend?.find((p) => p.timestamp.startsWith(date)) ??
    (sleepView?.sleepScoreTrend?.length
      ? sleepView.sleepScoreTrend[sleepView.sleepScoreTrend.length - 1]
      : null)
  const scoreValue = scorePoint ? Math.round(scorePoint.value) : null

  // Format date for nav bar
  const formattedDate = (() => {
    const [year, month, day] = date.split("-").map(Number)
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(year, month - 1, day, 12))
  })()

  const toggleDetails = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setDetailsExpanded((prev) => !prev)
  }

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }))

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  // --- Nav Bar ---
  const NavBar = (
    <View style={themed($navBar)}>
      <TouchableOpacity style={themed($navSide)} onPress={() => navigation.goBack()}>
        <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.9)" />
      </TouchableOpacity>
      <Text text={formattedDate} size="sm" weight="semiBold" style={themed($navCenter)} />
      <TouchableOpacity style={themed($navSide)} onPress={openSheet}>
        <Ionicons
          name={sleepView?.planner.alarmEnabled ? "alarm" : "alarm-outline"}
          size={22}
          color={sleepView?.planner.alarmEnabled ? ACCENT : "rgba(255,255,255,0.6)"}
        />
      </TouchableOpacity>
    </View>
  )

  // --- Empty State ---
  if (!sleepView || sleepView.emptyState.isEmpty) {
    return (
      <View style={themed($screenWrap)}>
        <Screen
          backgroundColor="transparent"
          preset="scroll"
          safeAreaEdges={["top"]}
          contentContainerStyle={themed($container)}
          ScrollViewProps={{
            refreshControl: (
              <RefreshControl refreshing={isRefreshing} onRefresh={refreshDashboard} tintColor={ACCENT} />
            ),
          }}
        >
          {NavBar}
          <View style={themed($emptyState)}>
            <Text
              text={sleepView?.emptyState.title ?? "No sleep data"}
              size="lg"
              weight="semiBold"
              style={themed($emptyTitle)}
            />
            <Text
              text={sleepView?.emptyState.subtitle ?? "Sync your strap to load the sleep breakdown."}
              size="xs"
              style={themed($mutedCenter)}
            />
          </View>
        </Screen>
      </View>
    )
  }

  // --- Key metrics ---
  const keyMetrics = KEY_METRIC_LABELS.map((label) =>
    sleepView.metrics.find((m) => m.label === label),
  ).filter(Boolean) as Array<{ label: string; value: string; detail: string | null }>

  const halfWidth = (width - 48 - 12) / 2

  return (
    <View style={themed($screenWrap)}>
      <Screen
        backgroundColor="transparent"
        preset="scroll"
        safeAreaEdges={["top"]}
        contentContainerStyle={themed($container)}
        ScrollViewProps={{
          refreshControl: (
            <RefreshControl refreshing={isRefreshing} onRefresh={refreshDashboard} tintColor={ACCENT} />
          ),
        }}
      >
        {/* 1. Nav Bar — [back]  [date centered]  [alarm icon] */}
        {NavBar}

        {/* 2. Hero Score */}
        <View style={themed($heroSection)}>
          {scoreValue !== null ? (
            <>
              <Text
                text={String(scoreValue)}
                style={[themed($heroScore), { color: scoreColor(scoreValue) }]}
              />
              <Text
                text={scoreQuality(scoreValue)}
                size="sm"
                weight="semiBold"
                style={{ color: scoreColor(scoreValue) }}
              />
              <Text text={sleepView.header.duration} size="sm" style={themed($heroDuration)} />
            </>
          ) : (
            <>
              <Text text={sleepView.header.duration} style={themed($heroScore)} />
              <Text text="SLEEP" size="xs" weight="bold" style={themed($heroLabel)} />
            </>
          )}
        </View>

        {/* 3. Hypnogram */}
        {sleepView.epochTimeline.length > 0 && (
          <View style={themed($section)}>
            <HypnogramChart
              epochs={sleepView.epochTimeline}
              width={chartWidth}
              bedtimeLabel={sleepView.header.bedtime}
              wakeTimeLabel={sleepView.header.wakeTime}
            />
          </View>
        )}

        {/* 4. Key Metrics Row */}
        {keyMetrics.length > 0 && (
          <View style={themed($metricsRow)}>
            {keyMetrics.map((metric) => (
              <View key={metric.label} style={themed($metricCell)}>
                <Text text={metric.label} size="xxs" style={themed($metricLabel)} />
                <Text text={metric.value} size="sm" weight="semiBold" style={themed($metricValue)} />
              </View>
            ))}
          </View>
        )}

        {/* 5. Collapsible: HR Chart + Trends + Insights */}
        <TouchableOpacity style={themed($expandRow)} onPress={toggleDetails} activeOpacity={0.7}>
          <Text text="More Details" size="xs" weight="semiBold" style={themed($expandLabel)} />
          <Ionicons
            name={detailsExpanded ? "chevron-up" : "chevron-down"}
            size={18}
            color="rgba(255,255,255,0.5)"
          />
        </TouchableOpacity>

        {detailsExpanded && (
          <View style={themed($collapsedContent)}>
            {/* Heart Rate Chart */}
            {sleepView.hrChart.samples.length > 0 && (
              <View style={themed($section)}>
                <Text text="HEART RATE" size="xxs" weight="bold" style={themed($sectionEyebrow)} />
                <SleepHeartRateChart
                  samples={sleepView.hrChart.samples}
                  epochs={sleepView.epochTimeline}
                  width={chartWidth}
                  height={120}
                />
                <View style={themed($chartAxis)}>
                  <Text text={sleepView.header.bedtime} size="xxs" style={themed($axisText)} />
                  <Text text={sleepView.header.wakeTime} size="xxs" style={themed($axisText)} />
                </View>
              </View>
            )}

            {/* Trends */}
            <View style={themed($trendsRow)}>
              <View style={[themed($trendColumn), { width: halfWidth }]}>
                <Text text="DURATION — 7 NIGHTS" size="xxs" weight="bold" style={themed($sectionEyebrow)} />
                <BarSeriesChart
                  points={sleepView.durationTrend.samples}
                  width={halfWidth}
                  height={80}
                  fill={ACCENT}
                  referenceValue={sleepView.durationTrend.targetHours}
                />
              </View>
              <View style={[themed($trendColumn), { width: halfWidth }]}>
                <Text text="SCORE — 7 NIGHTS" size="xxs" weight="bold" style={themed($sectionEyebrow)} />
                <InlineLineChart
                  points={sleepView.sleepScoreTrend}
                  width={halfWidth}
                  height={80}
                  stroke={ACCENT}
                />
              </View>
            </View>

            {/* Insights */}
            {sleepView.factorInsights.length > 0 && (
              <View style={themed($section)}>
                <Text text="INSIGHTS" size="xxs" weight="bold" style={themed($sectionEyebrow)} />
                <View style={themed($insightList)}>
                  {sleepView.factorInsights.map((insight) => (
                    <View key={insight.factorTag} style={themed($insightRow)}>
                      <Text text={insight.factorTag} size="xs" weight="semiBold" style={themed($insightTag)} />
                      <View style={themed($insightRight)}>
                        {insight.deepDelta ? (
                          <Text text={insight.deepDelta} size="xxs" style={themed($insightPositive)} />
                        ) : null}
                        {insight.remDelta ? (
                          <Text text={insight.remDelta} size="xxs" style={themed($insightNeutral)} />
                        ) : null}
                        <Text text={`(${insight.sampleCount}n)`} size="xxs" style={themed($insightMuted)} />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* 6. Sleep Planner Bottom Sheet */}
        <Modal visible={sheetVisible} transparent animationType="none" statusBarTranslucent onRequestClose={closeSheet}>
          <TouchableWithoutFeedback onPress={closeSheet}>
            <Animated.View style={[themed($sheetBackdrop), backdropStyle]} />
          </TouchableWithoutFeedback>
          <Animated.View style={[themed($sheetContainer), sheetStyle]}>
            {/* Drag handle */}
            <View style={themed($sheetHandle)} />

            <View style={themed($sheetHeader)}>
              <Ionicons name="alarm" size={20} color={ACCENT} />
              <Text text="Sleep Planner" size="md" weight="semiBold" style={themed($sheetTitle)} />
              <TouchableOpacity onPress={closeSheet} hitSlop={12}>
                <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>

            {/* Target Sleep */}
            <View style={themed($sheetRow)}>
              <Text text="Target Sleep" size="xs" style={themed($sheetLabel)} />
              <View style={themed($sheetStepper)}>
                <TouchableOpacity
                  style={themed($stepBtn)}
                  onPress={() => updatePlanner({ targetSleepMinutes: Math.max(360, sleepView.planner.targetSleepMinutes - 15) })}
                >
                  <Text text="−" size="sm" weight="bold" style={themed($stepBtnText)} />
                </TouchableOpacity>
                <Text
                  text={`${parseFloat((sleepView.planner.targetSleepMinutes / 60).toFixed(1))}h`}
                  size="xs"
                  weight="semiBold"
                  style={themed($sheetValue)}
                />
                <TouchableOpacity
                  style={themed($stepBtn)}
                  onPress={() => updatePlanner({ targetSleepMinutes: Math.min(600, sleepView.planner.targetSleepMinutes + 15) })}
                >
                  <Text text="+" size="sm" weight="bold" style={themed($stepBtnText)} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Wake Target */}
            <View style={themed($sheetRow)}>
              <Text text="Wake Target" size="xs" style={themed($sheetLabel)} />
              <View style={themed($sheetStepper)}>
                <TouchableOpacity
                  style={themed($stepBtn)}
                  onPress={() => updatePlanner({ wakeMinutes: wrapMinutes(sleepView.planner.wakeMinutes - 15) })}
                >
                  <Text text="−" size="sm" weight="bold" style={themed($stepBtnText)} />
                </TouchableOpacity>
                <Text
                  text={formatClockMinutes(sleepView.planner.wakeMinutes)}
                  size="xs"
                  weight="semiBold"
                  style={themed($sheetValue)}
                />
                <TouchableOpacity
                  style={themed($stepBtn)}
                  onPress={() => updatePlanner({ wakeMinutes: wrapMinutes(sleepView.planner.wakeMinutes + 15) })}
                >
                  <Text text="+" size="sm" weight="bold" style={themed($stepBtnText)} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Alarm toggle */}
            <View style={themed($sheetRow)}>
              <Text text="Alarm" size="xs" style={themed($sheetLabel)} />
              <Switch
                value={sleepView.planner.alarmEnabled}
                onValueChange={(v) => updatePlanner({ alarmEnabled: v })}
                thumbColor="#F7F7FA"
                trackColor={{ false: "rgba(255,255,255,0.12)", true: ACCENT }}
              />
            </View>

            {/* Alarm Time (only if enabled) */}
            {sleepView.planner.alarmEnabled && (
              <View style={themed($sheetRow)}>
                <Text text="Alarm Time" size="xs" style={themed($sheetLabel)} />
                <View style={themed($sheetStepper)}>
                  <TouchableOpacity
                    style={themed($stepBtn)}
                    onPress={() => updatePlanner({ alarmMinutes: wrapMinutes(sleepView.planner.alarmMinutes - 15) })}
                  >
                    <Text text="−" size="sm" weight="bold" style={themed($stepBtnText)} />
                  </TouchableOpacity>
                  <Text
                    text={formatClockMinutes(sleepView.planner.alarmMinutes)}
                    size="xs"
                    weight="semiBold"
                    style={themed($sheetValue)}
                  />
                  <TouchableOpacity
                    style={themed($stepBtn)}
                    onPress={() => updatePlanner({ alarmMinutes: wrapMinutes(sleepView.planner.alarmMinutes + 15) })}
                  >
                    <Text text="+" size="sm" weight="bold" style={themed($stepBtnText)} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Smart Wake toggle */}
            <View style={themed($sheetRow)}>
              <Text text="Smart Wake" size="xs" style={themed($sheetLabel)} />
              <Switch
                value={sleepView.planner.smartWakeEnabled}
                onValueChange={(v) => updatePlanner({ smartWakeEnabled: v })}
                thumbColor="#F7F7FA"
                trackColor={{ false: "rgba(255,255,255,0.12)", true: ACCENT }}
              />
            </View>

            {/* Arm / Disarm button */}
            <TouchableOpacity
              style={themed(liveDeviceState.strapAlarmArmed ? $sheetButtonDestructive : $sheetButtonPrimary)}
              onPress={() => {
                if (liveDeviceState.strapAlarmArmed) {
                  disarmAlarm()
                  Toast.show("Alarm disarmed", { type: "info", position: "top" })
                } else {
                  armAlarm()
                  Toast.show("Alarm armed", { type: "success", position: "top" })
                }
              }}
            >
              <Text
                text={liveDeviceState.strapAlarmArmed ? "Disarm Alarm" : "Arm Alarm"}
                size="xs"
                weight="semiBold"
                style={themed(liveDeviceState.strapAlarmArmed ? $sheetButtonDestructiveText : $sheetButtonPrimaryText)}
              />
            </TouchableOpacity>

            {/* Status line */}
            <Text
              text={
                liveDeviceState.connectionState === "ready"
                  ? liveDeviceState.strapAlarmArmed ? "Strap alarm armed" : "Strap connected"
                  : "Strap offline"
              }
              size="xxs"
              style={themed($sheetMuted)}
            />
          </Animated.View>
        </Modal>
      </Screen>
    </View>
  )
}

// ═══════════════════════ Styles ═══════════════════════

const $screenWrap: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: SCREEN_BG,
  flex: 1,
})

const $container: ThemedStyle<ViewStyle> = () => ({
  gap: 24,
  paddingBottom: 60,
  paddingHorizontal: 24,
  paddingTop: 12,
})

// Nav Bar — 3-column: [back] [centered date] [alarm]
const $navBar: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
  minHeight: 44,
})

const $navSide: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  height: 36,
  justifyContent: "center",
  width: 36,
})

const $navCenter: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.88)",
  textAlign: "center",
})

// Hero
const $heroSection: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  gap: 4,
  paddingVertical: 8,
})

const $heroScore: ThemedStyle<TextStyle> = () => ({
  color: "#fff",
  fontSize: 56,
  fontWeight: "bold",
  lineHeight: 64,
})

const $heroDuration: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.52)",
  marginTop: 2,
})

const $heroLabel: ThemedStyle<TextStyle> = () => ({
  color: ACCENT,
  letterSpacing: 1,
  marginTop: 2,
})

// Sections
const $section: ThemedStyle<ViewStyle> = () => ({
  gap: 8,
})

const $sectionEyebrow: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.46)",
  letterSpacing: 1,
})

// Chart axis
const $chartAxis: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  justifyContent: "space-between",
})

const $axisText: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.38)",
})

// Key Metrics Row
const $metricsRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
})

const $metricCell: ThemedStyle<ViewStyle> = () => ({
  alignItems: "flex-start",
  flex: 1,
  gap: 3,
})

const $metricLabel: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.46)",
  letterSpacing: 0.3,
})

const $metricValue: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.96)",
})

// Expand / Collapse row
const $expandRow: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  borderColor: "rgba(255,255,255,0.06)",
  borderRadius: 12,
  borderWidth: 1,
  flexDirection: "row",
  gap: 6,
  justifyContent: "center",
  paddingVertical: 12,
})

const $expandLabel: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.5)",
})

const $collapsedContent: ThemedStyle<ViewStyle> = () => ({
  gap: 24,
})

// Trends
const $trendsRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  gap: 12,
})

const $trendColumn: ThemedStyle<ViewStyle> = () => ({
  gap: 8,
})

// Insights
const $insightList: ThemedStyle<ViewStyle> = () => ({
  gap: 12,
})

const $insightRow: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  gap: 12,
  justifyContent: "space-between",
})

const $insightTag: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.92)",
  flex: 1,
})

const $insightRight: ThemedStyle<ViewStyle> = () => ({
  alignItems: "flex-end",
  gap: 2,
})

const $insightPositive: ThemedStyle<TextStyle> = () => ({
  color: "#57D37C",
})

const $insightNeutral: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.84)",
})

const $insightMuted: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.46)",
})

// Bottom Sheet
const $sheetBackdrop: ThemedStyle<ViewStyle> = () => ({
  ...({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as any),
  backgroundColor: "rgba(0,0,0,0.55)",
})

const $sheetContainer: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "#1A1A1E",
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  bottom: 0,
  gap: 16,
  left: 0,
  paddingBottom: 40,
  paddingHorizontal: 24,
  paddingTop: 12,
  position: "absolute",
  right: 0,
})

const $sheetHandle: ThemedStyle<ViewStyle> = () => ({
  alignSelf: "center",
  backgroundColor: "rgba(255,255,255,0.2)",
  borderRadius: 3,
  height: 5,
  width: 40,
})

const $sheetHeader: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  gap: 8,
})

const $sheetTitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.92)",
  flex: 1,
})

const $sheetRow: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
})

const $sheetLabel: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.65)",
})

const $sheetValue: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.96)",
  minWidth: 68,
  textAlign: "center",
})

const $sheetStepper: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  gap: 10,
})

const $stepBtn: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  backgroundColor: "rgba(255,255,255,0.08)",
  borderRadius: 999,
  height: 32,
  justifyContent: "center",
  width: 32,
})

const $stepBtnText: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.92)",
})

const $sheetButtonPrimary: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  backgroundColor: ACCENT,
  borderRadius: 14,
  justifyContent: "center",
  marginTop: 4,
  minHeight: 46,
})

const $sheetButtonPrimaryText: ThemedStyle<TextStyle> = () => ({
  color: "#09090B",
})

const $sheetButtonDestructive: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  backgroundColor: "#EF4444",
  borderRadius: 14,
  justifyContent: "center",
  marginTop: 4,
  minHeight: 46,
})

const $sheetButtonDestructiveText: ThemedStyle<TextStyle> = () => ({
  color: "#fff",
})

const $sheetMuted: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.38)",
  textAlign: "center",
})

// Empty State
const $emptyState: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flex: 1,
  gap: 10,
  justifyContent: "center",
  paddingTop: 80,
})

const $emptyTitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.92)",
})

const $mutedCenter: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.52)",
  textAlign: "center",
})
