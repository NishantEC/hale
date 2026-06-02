import { TouchableOpacity, View } from "react-native"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useColorMode } from "@/context/ThemeContext"
import { humanizeFactorTag } from "@/utils/factorLabels"

export type FactorRow = {
  factorTag: string
  deepMin: number
  remMin: number
  awakeMin: number
  effectSize: number
}

export type WhyPanelProps = {
  factors: FactorRow[]
  hasJournal: boolean
  fallbackInsight?: string | null
  onPressLogJournal: () => void
  onPressFactor: (tag: string) => void
}

function pickHeadlineImpact(f: FactorRow): { label: string; value: number; tone: "good" | "bad" } {
  const candidates: Array<{ label: string; value: number; tone: "good" | "bad" }> = [
    { label: "deep", value: f.deepMin, tone: f.deepMin >= 0 ? "good" : "bad" },
    { label: "REM", value: f.remMin, tone: f.remMin >= 0 ? "good" : "bad" },
    { label: "awake", value: f.awakeMin, tone: f.awakeMin <= 0 ? "good" : "bad" },
  ]
  candidates.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  return candidates[0]
}

export function WhyPanel({ factors, hasJournal, fallbackInsight, onPressLogJournal, onPressFactor }: WhyPanelProps) {
  useColorMode()
  const colors = LOCAL_THEME.colors

  const containerStyle = {
    marginTop: 22,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.surfaceCardBorder,
  } as const

  const titleStyle = {
    color: colors.textDim,
    letterSpacing: 1.2,
    fontSize: 11,
    fontWeight: "600",
  } as const

  if (!hasJournal) {
    return (
      <TouchableOpacity onPress={onPressLogJournal} style={containerStyle}>
        <Text text="WHY THIS SCORE" style={titleStyle} />
        <Text
          text="Log how you slept (caffeine, workouts, stress) to unlock factor insights."
          size="xs"
          style={{ color: colors.text, marginTop: 8, lineHeight: 18 }}
        />
        <Text text="Open journal →" size="xxs" style={{ color: "#a78bfa", marginTop: 8 }} />
      </TouchableOpacity>
    )
  }

  if (factors.length === 0 && fallbackInsight) {
    return (
      <View style={containerStyle}>
        <Text text="WHY THIS SCORE" style={titleStyle} />
        <Text text={fallbackInsight} size="xs" style={{ color: colors.text, marginTop: 8, lineHeight: 18 }} />
      </View>
    )
  }

  const top = factors.slice(0, 3)
  return (
    <View style={containerStyle}>
      <Text text="WHY THIS SCORE · FROM YOUR JOURNAL" style={titleStyle} />
      {top.map((f, idx) => {
        const headline = pickHeadlineImpact(f)
        const sign = headline.value > 0 ? "+" : ""
        const color = headline.tone === "good" ? "#4ade80" : "#f87171"
        return (
          <TouchableOpacity
            key={f.factorTag}
            onPress={() => onPressFactor(f.factorTag)}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: idx === 0 ? 4 : 0,
              paddingVertical: 8,
              borderTopWidth: idx === 0 ? 0 : 1,
              borderTopColor: colors.surfaceCardBorder,
            }}
          >
            <Text text={humanizeFactorTag(f.factorTag)} size="sm" style={{ color: colors.text }} />
            <Text
              text={`${sign}${headline.value}m ${headline.label}`}
              size="sm"
              style={{ color, fontWeight: "600" }}
            />
          </TouchableOpacity>
        )
      })}
    </View>
  )
}
