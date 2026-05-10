import { View, Text } from "react-native"

export type StagePillsProps = {
  awakeMin: number
  remMin: number
  coreMin: number
  deepMin: number
}

const STAGES = [
  { key: "awake", label: "Awake", color: "#FE8A73" },
  { key: "rem", label: "REM", color: "#3FB1E7" },
  { key: "core", label: "Core", color: "#1B81FE" },
  { key: "deep", label: "Deep", color: "#403EA7" },
] as const

function fmt(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function StagePills({ awakeMin, remMin, coreMin, deepMin }: StagePillsProps) {
  const values: Record<string, number> = { awake: awakeMin, rem: remMin, core: coreMin, deep: deepMin }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
      {STAGES.map((s) => (
        <View
          key={s.key}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: 9,
            paddingVertical: 4,
            borderRadius: 12,
            backgroundColor: `${s.color}26`,
          }}
        >
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: s.color }} />
          <Text style={{ color: s.color, fontSize: 11, fontWeight: "500" }}>
            {s.label} {fmt(values[s.key])}
          </Text>
        </View>
      ))}
    </View>
  )
}
