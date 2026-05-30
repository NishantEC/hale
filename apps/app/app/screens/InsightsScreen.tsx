import { FC, useMemo } from "react"
import { ScrollView, View, ViewStyle } from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import { ChartBar, Lightning, Sparkle } from "phosphor-react-native"
import { router } from "expo-router"

import { Text } from "@/components/Text"
import { useDashboard } from "@/context/DashboardContext"
import { LOCAL_THEME } from "@/utils/localTheme"

const REQUIRED_NIGHTS = 14

export const InsightsScreen: FC = () => {
  const { colors } = LOCAL_THEME
  const insets = useSafeAreaInsets()
  const { homeView } = useDashboard()

  // Use nightsUsed as a rough "days of data" proxy until the journal
  // correlator backend lands. Once journals + 14 nights are recorded,
  // this screen flips from calibrating → live insights.
  const nightsUsed = useMemo(() => {
    return (homeView as any)?.confidence?.nightsUsed ?? 0
  }, [homeView])
  const remaining = Math.max(0, REQUIRED_NIGHTS - nightsUsed)
  const calibrating = remaining > 0

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: insets.bottom + 32,
          gap: 14,
        }}
      >
        <Text
          text="INSIGHTS"
          style={{
            color: colors.textDim,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 1.4,
            marginBottom: 4,
          }}
        />
        <Text
          text="What's helping and hurting"
          style={{
            color: colors.text,
            fontSize: 22,
            fontWeight: "700",
            letterSpacing: -0.4,
            marginBottom: 14,
          }}
        />

        <View style={[$card, { backgroundColor: colors.surfaceCard }]}>
          <View style={$iconWrap}>
            <Sparkle size={22} color={colors.tint} />
          </View>
          <Text
            text={calibrating ? "Calibrating" : "Ready"}
            style={{
              color: colors.text,
              fontSize: 16,
              fontWeight: "700",
              marginTop: 12,
            }}
          />
          <Text
            text={
              calibrating
                ? `Log entries for ${remaining} more night${
                    remaining === 1 ? "" : "s"
                  } to unlock impact analysis. The journal needs at least ${REQUIRED_NIGHTS} nights of data so we can tell signal from noise.`
                : "Your data is ready for the impact analysis. Tap below to see what helped and what hurt your last 30 days of recovery, HRV, and sleep."
            }
            style={{
              color: colors.textDim,
              fontSize: 13,
              fontWeight: "400",
              lineHeight: 19,
              marginTop: 6,
            }}
          />
        </View>

        <View style={[$card, { backgroundColor: colors.surfaceCard }]}>
          <View style={$iconWrap}>
            <ChartBar size={22} color={colors.ringRecovery} />
          </View>
          <Text
            text="What helped"
            style={{
              color: colors.text,
              fontSize: 14,
              fontWeight: "700",
              marginTop: 10,
            }}
          />
          <Text
            text="Behaviours associated with higher recovery / HRV / sleep score. Each will show as a horizontal bar — magnitude on the right side of 0%."
            style={{
              color: colors.textMuted,
              fontSize: 12,
              fontWeight: "400",
              lineHeight: 17,
              marginTop: 4,
            }}
          />
        </View>

        <View style={[$card, { backgroundColor: colors.surfaceCard }]}>
          <View style={$iconWrap}>
            <Lightning size={22} color={colors.statusRed} />
          </View>
          <Text
            text="What hurt"
            style={{
              color: colors.text,
              fontSize: 14,
              fontWeight: "700",
              marginTop: 10,
            }}
          />
          <Text
            text="Behaviours associated with lower recovery / HRV / sleep score. Bars anchor on the left side of 0%."
            style={{
              color: colors.textMuted,
              fontSize: 12,
              fontWeight: "400",
              lineHeight: 17,
              marginTop: 4,
            }}
          />
        </View>

        {calibrating ? (
          <View
            style={[
              $card,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.tint,
                borderWidth: 1,
              },
            ]}
          >
            <Text
              text="START A JOURNAL ENTRY"
              style={{
                color: colors.tint,
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 1.4,
              }}
              onPress={() => router.push("/journal-entry")}
            />
            <Text
              text="Tap to log how today felt — caffeine, workout, stress, alcohol, sleep prep. Every entry sharpens the correlator."
              style={{
                color: colors.textDim,
                fontSize: 12,
                lineHeight: 17,
                marginTop: 6,
              }}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const $card: ViewStyle = {
  borderRadius: 14,
  padding: 16,
}

const $iconWrap: ViewStyle = {
  alignSelf: "flex-start",
}
