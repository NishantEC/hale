import { FC, useCallback } from "react"
import { Alarm, Moon, Sun, X } from "phosphor-react-native"
import {
  ScrollView,
  Switch,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native"
import { router } from "expo-router"
import { Text } from "@/components/Text"
import { Toast } from "@/components/reactx/toast"
import { useBle } from "@/context/BleContext"
import { useDashboard } from "@/context/DashboardContext"
import { SleepViewModel } from "@/services/api/noopClient"
import { LOCAL_THEME, themed, type ThemedStyle } from "@/utils/localTheme"

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

export const SleepPlannerScreen: FC = () => {
  const colors = LOCAL_THEME.colors
  const { sleepView, saveSleepPlan } = useDashboard()
  const { connectionState, strapAlarmArmed, armAlarm, disarmAlarm } = useBle()

  const updatePlanner = useCallback(
    async (patch: Partial<SleepViewModel["planner"]>) => {
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

  if (!sleepView) {
    return (
      <ScrollView style={themed($scrollOuter)} contentContainerStyle={themed($container)}>
        <View style={themed($headerRow)}>
          <View style={themed($headerSpacer)} />
          <Text text="Sleep Planner" size="md" weight="semiBold" style={themed($headerTitle)} />
          <TouchableOpacity
            accessibilityLabel="Close sleep planner"
            onPress={() => router.back()}
            style={themed($closeButton)}
          >
            <X size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
        <Text text="No sleep data" size="sm" style={themed($muted)} />
      </ScrollView>
    )
  }

  const isConnected = connectionState === "ready"

  return (
    <ScrollView style={themed($scrollOuter)} contentContainerStyle={themed($container)}>
      {/* Header — matches device settings */}
      <View style={themed($headerRow)}>
        <View style={themed($headerSpacer)} />
        <Text text="Sleep Planner" size="md" weight="semiBold" style={themed($headerTitle)} />
        <TouchableOpacity
          accessibilityLabel="Close sleep planner"
          onPress={() => router.back()}
          style={themed($closeButton)}
        >
          <X size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Summary card — target sleep + wake target */}
      <View style={themed($summaryBlock)}>
        <View style={themed($summaryColumn)}>
          <Text text="TARGET SLEEP" size="xxs" weight="bold" style={themed($eyebrow)} />
          <Text
            text={`${parseFloat((sleepView.planner.targetSleepMinutes / 60).toFixed(1))}h`}
            size="sm"
            weight="bold"
            style={themed($summaryValue)}
          />
        </View>
        <View style={themed($summaryColumnRight)}>
          <Text text="WAKE TARGET" size="xxs" weight="bold" style={themed($summaryLabel)} />
          <Text
            text={formatClockMinutes(sleepView.planner.wakeMinutes)}
            size="xs"
            weight="semiBold"
            style={themed($summaryValueSecondary)}
          />
        </View>
      </View>

      <View style={themed($sectionStack)}>
        {/* Target Sleep stepper card */}
        <View style={themed($settingCard)}>
          <View style={themed($settingCardTop)}>
            <View style={themed($settingIcon)}>
              <Moon size={18} color={colors.iconDefault} />
            </View>
            <View style={themed($settingCopy)}>
              <Text text="Target Sleep" size="xs" weight="semiBold" style={themed($cardLabel)} />
              <Text text="How long you want to sleep each night." size="xxs" style={themed($cardDescription)} />
            </View>
          </View>
          <View style={themed($stepper)}>
            <StepButton
              label="−"
              onPress={() => updatePlanner({ targetSleepMinutes: Math.max(360, sleepView.planner.targetSleepMinutes - 15) })}
            />
            <Text
              text={`${parseFloat((sleepView.planner.targetSleepMinutes / 60).toFixed(1))}h`}
              size="sm"
              weight="bold"
              style={themed($stepValue)}
            />
            <StepButton
              label="+"
              onPress={() => updatePlanner({ targetSleepMinutes: Math.min(600, sleepView.planner.targetSleepMinutes + 15) })}
            />
          </View>
        </View>

        {/* Wake Target stepper card */}
        <View style={themed($settingCard)}>
          <View style={themed($settingCardTop)}>
            <View style={themed($settingIcon)}>
              <Sun size={18} color={colors.iconDefault} />
            </View>
            <View style={themed($settingCopy)}>
              <Text text="Wake Target" size="xs" weight="semiBold" style={themed($cardLabel)} />
              <Text text="When you want to be awake by." size="xxs" style={themed($cardDescription)} />
            </View>
          </View>
          <View style={themed($stepper)}>
            <StepButton
              label="−"
              onPress={() => updatePlanner({ wakeMinutes: wrapMinutes(sleepView.planner.wakeMinutes - 15) })}
            />
            <Text
              text={formatClockMinutes(sleepView.planner.wakeMinutes)}
              size="sm"
              weight="bold"
              style={themed($stepValue)}
            />
            <StepButton
              label="+"
              onPress={() => updatePlanner({ wakeMinutes: wrapMinutes(sleepView.planner.wakeMinutes + 15) })}
            />
          </View>
        </View>

        {/* Alarm toggle card */}
        <View style={themed($toggleCard)}>
          <View style={themed($toggleCopy)}>
            <Text text="Alarm" size="xs" weight="semiBold" style={themed($cardLabel)} />
            <Text text="Wake up with a haptic alarm on your strap." size="xxs" style={themed($cardDescription)} />
          </View>
          <View style={themed($switchWrap)}>
            <Switch
              value={sleepView.planner.alarmEnabled}
              onValueChange={(v) => updatePlanner({ alarmEnabled: v })}
              thumbColor="#F5F5F5"
              trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
            />
          </View>
        </View>

        {/* Alarm Time stepper — only when alarm enabled */}
        {sleepView.planner.alarmEnabled && (
          <View style={themed($settingCard)}>
            <View style={themed($settingCardTop)}>
              <View style={themed($settingIcon)}>
                <Alarm size={18} color={colors.iconDefault} />
              </View>
              <View style={themed($settingCopy)}>
                <Text text="Alarm Time" size="xs" weight="semiBold" style={themed($cardLabel)} />
                <Text text="When the strap alarm will fire." size="xxs" style={themed($cardDescription)} />
              </View>
            </View>
            <View style={themed($stepper)}>
              <StepButton
                label="−"
                onPress={() => updatePlanner({ alarmMinutes: wrapMinutes(sleepView.planner.alarmMinutes - 15) })}
              />
              <Text
                text={formatClockMinutes(sleepView.planner.alarmMinutes)}
                size="sm"
                weight="bold"
                style={themed($stepValue)}
              />
              <StepButton
                label="+"
                onPress={() => updatePlanner({ alarmMinutes: wrapMinutes(sleepView.planner.alarmMinutes + 15) })}
              />
            </View>
          </View>
        )}

        {/* Smart Wake toggle card */}
        <View style={themed($toggleCard)}>
          <View style={themed($toggleCopy)}>
            <Text text="Smart Wake" size="xs" weight="semiBold" style={themed($cardLabel)} />
            <Text text="Wake you during light sleep near your alarm time." size="xxs" style={themed($cardDescription)} />
          </View>
          <View style={themed($switchWrap)}>
            <Switch
              value={sleepView.planner.smartWakeEnabled}
              onValueChange={(v) => updatePlanner({ smartWakeEnabled: v })}
              thumbColor="#F5F5F5"
              trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
            />
          </View>
        </View>

        {/* Arm / Disarm action button */}
        <TouchableOpacity
          style={themed(strapAlarmArmed ? $btnDestructive : $btnPrimary)}
          onPress={() => {
            if (strapAlarmArmed) {
              disarmAlarm()
              Toast.show("Alarm disarmed", { type: "info", position: "top" })
            } else {
              armAlarm()
              Toast.show("Alarm armed", { type: "success", position: "top" })
            }
          }}
        >
          <Text
            text={strapAlarmArmed ? "Disarm Alarm" : "Arm Alarm"}
            size="xs"
            weight="semiBold"
            style={themed(strapAlarmArmed ? $btnDestructiveText : $btnPrimaryText)}
          />
        </TouchableOpacity>
      </View>

      {/* Connection status */}
      <Text
        text={
          isConnected
            ? strapAlarmArmed ? "Strap alarm armed" : "Strap connected"
            : "Strap offline"
        }
        size="xxs"
        style={themed($statusText)}
      />
    </ScrollView>
  )
}

function StepButton({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = LOCAL_THEME.colors
  return (
    <TouchableOpacity style={themed($stepBtn)} onPress={onPress}>
      <Text text={label} size="sm" weight="bold" style={themed($stepBtnText)} />
    </TouchableOpacity>
  )
}

// ═══════════════════════ Styles ═══════════════════════

const $scrollOuter: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.background,
  flex: 1,
})

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingHorizontal: spacing.md,
  paddingTop: 12,
  paddingBottom: spacing.xl,
})

const $headerRow: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
  minHeight: 34,
})

const $closeButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.surfaceSubtle,
  borderRadius: 16,
  height: 32,
  justifyContent: "center",
  width: 32,
})

const $headerTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  lineHeight: 34,
})

const $headerSpacer: ThemedStyle<ViewStyle> = () => ({
  width: 32,
})

const $summaryBlock: ThemedStyle<ViewStyle> = ({ spacing, colors }) => ({
  backgroundColor: colors.surfaceCard,
  borderColor: colors.surfaceCardBorder,
  borderRadius: 16,
  borderWidth: 1,
  flexDirection: "row",
  gap: spacing.xs,
  justifyContent: "space-between",
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs - 2,
  minHeight: 74,
})

const $summaryColumn: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  gap: 2,
  justifyContent: "center",
})

const $summaryColumnRight: ThemedStyle<ViewStyle> = () => ({
  alignItems: "flex-end",
  flex: 1,
  gap: 2,
  justifyContent: "center",
})

const $eyebrow: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
  textTransform: "uppercase",
})

const $summaryLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textTransform: "uppercase",
})

const $summaryValue: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  lineHeight: 26,
})

const $summaryValueSecondary: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  lineHeight: 18,
  textAlign: "right",
})

const $sectionStack: ThemedStyle<ViewStyle> = () => ({
  gap: 10,
})

const $settingCard: ThemedStyle<ViewStyle> = ({ spacing, colors }) => ({
  backgroundColor: colors.surfaceSubtle,
  borderColor: colors.surfaceCardBorder,
  borderRadius: 16,
  borderWidth: 1,
  gap: spacing.xs,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
})

const $settingCardTop: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  flexDirection: "row",
  gap: spacing.xs,
})

const $settingIcon: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.surfaceSubtle,
  borderRadius: 16,
  height: 32,
  justifyContent: "center",
  width: 32,
})

const $settingCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  gap: 3,
})

const $cardLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $cardDescription: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  lineHeight: 18,
})

const $stepper: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  gap: 10,
  justifyContent: "center",
})

const $stepBtn: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.surfaceElevated,
  borderRadius: 999,
  height: 36,
  justifyContent: "center",
  width: 36,
})

const $stepBtnText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $stepValue: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  minWidth: 80,
  textAlign: "center",
})

const $toggleCard: ThemedStyle<ViewStyle> = ({ spacing, colors }) => ({
  alignItems: "flex-start",
  backgroundColor: colors.surfaceSubtle,
  borderColor: colors.surfaceCardBorder,
  borderRadius: 16,
  borderWidth: 1,
  flexDirection: "row",
  gap: spacing.xs,
  justifyContent: "space-between",
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs - 1,
})

const $toggleCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  gap: 3,
  paddingTop: 1,
})

const $switchWrap: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "center",
  minHeight: 44,
})

const $btnPrimary: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.tint,
  borderRadius: 14,
  justifyContent: "center",
  marginTop: 4,
  minHeight: 46,
})

const $btnPrimaryText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.onPrimary,
})

const $btnDestructive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.error,
  borderRadius: 14,
  justifyContent: "center",
  marginTop: 4,
  minHeight: 46,
})

const $btnDestructiveText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.onSurface,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  textAlign: "center",
})

const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
})
