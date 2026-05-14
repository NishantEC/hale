import { FC, ReactNode, useState } from "react"
import { LayoutAnimation, TouchableOpacity, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME, themed, type ThemedStyle } from "@/utils/localTheme"

type Props = {
  title: string
  pill?: ReactNode
  defaultExpanded?: boolean
  children?: ReactNode
}

export const InspectorCard: FC<Props> = ({ title, pill, defaultExpanded = false, children }) => {
  const { colors } = LOCAL_THEME
  const [expanded, setExpanded] = useState(defaultExpanded)

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setExpanded((v) => !v)
  }

  return (
    <View style={themed($card)}>
      <TouchableOpacity onPress={toggle} activeOpacity={0.7} style={$header}>
        <View style={$headerLeft}>
          <Text text={title} size="sm" weight="semiBold" style={{ color: colors.text }} />
          {pill ? <View style={{ marginLeft: 8 }}>{pill}</View> : null}
        </View>
        <Text text={expanded ? "▾" : "▸"} size="xs" style={{ color: colors.iconDim }} />
      </TouchableOpacity>
      {expanded && children ? <View style={$body}>{children}</View> : null}
    </View>
  )
}

const $card: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.surfaceCard,
  borderWidth: 1,
  borderColor: colors.surfaceCardBorder,
  borderRadius: 14,
  marginBottom: 8,
  overflow: "hidden",
})

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
