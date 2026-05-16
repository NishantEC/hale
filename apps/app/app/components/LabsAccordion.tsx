import { useState } from "react"
import { LayoutAnimation, TouchableOpacity, View } from "react-native"
import { CaretDown, CaretUp } from "phosphor-react-native"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useColorMode } from "@/context/ThemeContext"

export type LabRow = {
  label: string
  value: string
}

export type LabsAccordionProps = {
  rows: LabRow[]
  defaultOpen?: boolean
}

export function LabsAccordion({ rows, defaultOpen = false }: LabsAccordionProps) {
  useColorMode()
  const colors = LOCAL_THEME.colors
  const [open, setOpen] = useState(defaultOpen)

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpen((o) => !o)
  }

  return (
    <View style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: colors.surfaceCardBorder }}>
      <TouchableOpacity
        onPress={toggle}
        style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", paddingVertical: 12, gap: 6 }}
      >
        <Text text="Labs" size="xs" style={{ color: colors.textDim, letterSpacing: 0.6 }} />
        {open ? (
          <CaretUp size={14} color={colors.textDim} />
        ) : (
          <CaretDown size={14} color={colors.textDim} />
        )}
      </TouchableOpacity>
      {open ? (
        <View style={{ paddingBottom: 12 }}>
          {rows.map((r) => (
            <View
              key={r.label}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 10,
                borderTopWidth: 1,
                borderTopColor: colors.surfaceCardBorder,
              }}
            >
              <Text text={r.label} size="sm" style={{ color: colors.textDim }} />
              <Text text={r.value} size="sm" style={{ color: colors.text }} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}
