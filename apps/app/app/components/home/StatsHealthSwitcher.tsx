import { FC, useRef, useState } from "react"
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native"

import { AppleHealthCard } from "@/components/home/AppleHealthCard"
import { MetricsBar, type MetricCell } from "@/components/home/MetricsBar"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  statsCells: MetricCell[]
}

const TABS = ["Stats", "Apple Health"] as const

export const StatsHealthSwitcher: FC<Props> = ({ statsCells }) => {
  const { colors } = LOCAL_THEME
  const [index, setIndex] = useState(0)
  const [pageWidth, setPageWidth] = useState(0)
  const scrollRef = useRef<ScrollView>(null)

  const handleLayout = (e: LayoutChangeEvent) => {
    setPageWidth(e.nativeEvent.layout.width)
  }

  const goTo = (i: number) => {
    setIndex(i)
    scrollRef.current?.scrollTo({ x: i * pageWidth, animated: true })
  }

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth === 0) return
    const i = Math.round(e.nativeEvent.contentOffset.x / pageWidth)
    if (i !== index) setIndex(i)
  }

  return (
    <View onLayout={handleLayout}>
      <View style={styles.pillRow}>
        {TABS.map((t, i) => {
          const active = i === index
          return (
            <Pressable
              key={t}
              onPress={() => goTo(i)}
              style={[
                styles.pill,
                {
                  backgroundColor: active ? colors.surfaceElevated : "transparent",
                },
              ]}
            >
              <Text
                text={t.toUpperCase()}
                style={{
                  color: active ? colors.text : colors.textDim,
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 1.4,
                }}
              />
            </Pressable>
          )
        })}
      </View>

      {pageWidth > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          decelerationRate="fast"
          onMomentumScrollEnd={onMomentumEnd}
        >
          <View style={{ width: pageWidth, minHeight: 160 }}>
            <MetricsBar cells={statsCells} />
          </View>
          <View style={{ width: pageWidth, minHeight: 160 }}>
            <AppleHealthCard />
          </View>
        </ScrollView>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  } as ViewStyle,
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  } as ViewStyle,
})
