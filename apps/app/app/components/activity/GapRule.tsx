import { FC } from "react"
import { StyleSheet, View } from "react-native"
import { SymbolView } from "expo-symbols"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { visualForType } from "./bout-icons"

type Props = {
  kind: "Off-Wrist" | "No Data"
  startTime: Date
  endTime: Date
  source?: string | null
}

function fmt(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`
}

export const GapRule: FC<Props> = ({ kind, startTime, endTime, source }) => {
  const colors = LOCAL_THEME.colors
  const v = visualForType(kind)
  const reason = source === "ChargingOn"
    ? "charging"
    : source === "WristOff"
    ? "strap off"
    : kind === "No Data"
    ? "no data"
    : "off-wrist"
  return (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: v.backgroundHex }]}>
        <SymbolView name={v.sfSymbol as never} size={11} tintColor={v.tintHex} resizeMode="scaleAspectFit" />
      </View>
      <Text
        text={`${fmt(startTime)} – ${fmt(endTime)} · ${reason}`}
        style={{ color: colors.textDim, fontSize: 11, fontWeight: "600" }}
        numberOfLines={1}
      />
      <View style={[styles.dashLine, { borderColor: colors.divider }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 18,
  },
  iconWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  dashLine: {
    flex: 1,
    height: 1,
    borderTopWidth: 1,
    borderStyle: "dashed",
  },
})
