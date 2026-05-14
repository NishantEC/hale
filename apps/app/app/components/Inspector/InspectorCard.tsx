import { FC, ReactNode, useState } from "react"
import { LayoutAnimation, TouchableOpacity, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"

const COLORS = {
  cardBg: "rgba(0,0,0,0.035)",
  cardBorder: "rgba(0,0,0,0.06)",
  text: "#191015",
  textDim: "#564E4A",
  chevron: "#71717a",
}

type Props = {
  title: string
  pill?: ReactNode
  defaultExpanded?: boolean
  children?: ReactNode
}

export const InspectorCard: FC<Props> = ({ title, pill, defaultExpanded = false, children }) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setExpanded((v) => !v)
  }

  return (
    <View style={$card}>
      <TouchableOpacity onPress={toggle} activeOpacity={0.7} style={$header}>
        <View style={$headerLeft}>
          <Text text={title} size="sm" weight="semiBold" style={{ color: COLORS.text }} />
          {pill ? <View style={{ marginLeft: 8 }}>{pill}</View> : null}
        </View>
        <Text text={expanded ? "▾" : "▸"} size="xs" style={{ color: COLORS.chevron }} />
      </TouchableOpacity>
      {expanded && children ? <View style={$body}>{children}</View> : null}
    </View>
  )
}

const $card: ViewStyle = {
  backgroundColor: COLORS.cardBg,
  borderWidth: 1,
  borderColor: COLORS.cardBorder,
  borderRadius: 14,
  marginBottom: 8,
  overflow: "hidden",
}

const $header: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: 12,
  paddingHorizontal: 14,
}

const $headerLeft: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
}

const $body: ViewStyle = {
  paddingHorizontal: 14,
  paddingBottom: 12,
}
