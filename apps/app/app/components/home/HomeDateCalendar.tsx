import { FC, useMemo } from "react"
import { TouchableOpacity, View, ViewStyle } from "react-native"
import { Calendar, DateData } from "react-native-calendars"
import { X } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import type { CoverageKind } from "@/services/api/viewModels"

type Props = {
  selectedDate: string
  monthCursor: string
  coverageByDate: Record<string, CoverageKind>
  onSelectDate: (date: string) => void
  onMonthCursorChange: (month: string) => void
  onClose: () => void
}

export const HomeDateCalendar: FC<Props> = ({
  selectedDate,
  monthCursor,
  coverageByDate,
  onSelectDate,
  onMonthCursorChange,
  onClose,
}) => {
  const { colors } = LOCAL_THEME

  const todayKey = new Date().toISOString().slice(0, 10)
  const monthInitial = `${monthCursor}-15`

  const minDate = useMemo(() => {
    const now = new Date()
    const min = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1))
    return min.toISOString().slice(0, 10)
  }, [])

  return (
    <View style={$wrap(colors)}>
      <TouchableOpacity
        onPress={onClose}
        accessibilityLabel="Close calendar"
        hitSlop={10}
        style={$closeButton(colors)}
      >
        <X size={16} weight="bold" color={colors.text} />
      </TouchableOpacity>
      <Calendar
        // react-native-calendars treats `current` as initial-only — changes
        // after mount don't navigate the grid. Forcing a remount via key on
        // every monthCursor change makes external arrow taps actually flip
        // the displayed month.
        key={monthCursor}
        current={monthInitial}
        minDate={minDate}
        renderHeader={() => null}
        hideArrows
        enableSwipeMonths
        onDayPress={(day: DateData) => onSelectDate(day.dateString)}
        onMonthChange={(d: DateData) => {
          onMonthCursorChange(`${d.year}-${String(d.month).padStart(2, "0")}`)
        }}
        theme={{
          backgroundColor: colors.surfaceSubtle,
          calendarBackground: colors.surfaceSubtle,
          dayTextColor: colors.text,
          textDisabledColor: colors.textDim,
          monthTextColor: colors.text,
          arrowColor: colors.text,
          todayTextColor: colors.text,
          textMonthFontWeight: "700",
          textDayFontWeight: "600",
        }}
        dayComponent={({ date, state }: { date?: DateData; state?: string }) => {
          if (!date) return <View />
          const key = date.dateString
          const coverage = coverageByDate[key]
          const isSelected = key === selectedDate
          const isToday = key === todayKey
          const isMuted = state === "disabled"

          const bg = isSelected
            ? colors.tint
            : isToday
              ? colors.surfaceCard
              : "transparent"
          const fg = isSelected
            ? colors.background
            : isMuted
              ? colors.textDim
              : colors.text

          return (
            <TouchableOpacity
              onPress={() => onSelectDate(key)}
              disabled={isMuted}
              style={$day(bg)}
            >
              <Text
                text={String(date.day)}
                style={{ color: fg, fontSize: 14, fontWeight: "600" }}
              />
              {coverage && coverage !== "none" ? (
                <View
                  testID={`day-marker-${key}`}
                  accessibilityLabel={`${coverage} coverage`}
                  style={[
                    $bar,
                    {
                      backgroundColor: isSelected
                        ? colors.background
                        : coverage === "full"
                          ? colors.statusGreen
                          : colors.statusAmber,
                    },
                  ]}
                />
              ) : null}
            </TouchableOpacity>
          )
        }}
      />
    </View>
  )
}

const $wrap = (colors: typeof LOCAL_THEME.colors): ViewStyle => ({
  backgroundColor: colors.surfaceSubtle,
  paddingHorizontal: 0,
  paddingTop: 0,
  paddingBottom: 4,
  position: "relative",
})

const $closeButton = (colors: typeof LOCAL_THEME.colors): ViewStyle => ({
  position: "absolute",
  top: 6,
  right: 12,
  zIndex: 5,
  width: 28,
  height: 28,
  borderRadius: 14,
  backgroundColor: colors.surfaceCard,
  alignItems: "center",
  justifyContent: "center",
})

const $day = (bg: string): ViewStyle => ({
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  borderRadius: 12,
  backgroundColor: bg,
  position: "relative",
})

const $bar: ViewStyle = {
  position: "absolute",
  bottom: 3,
  width: 14,
  height: 2,
  borderRadius: 1.5,
}
