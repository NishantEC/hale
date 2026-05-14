import { TextStyle, TouchableOpacity, View, ViewStyle } from "react-native"
import Animated, { FadeInRight, FadeOutLeft } from "react-native-reanimated"
import { PhosphorIcon } from "@/components/PhosphorIcon"
import { LOCAL_THEME, themed, type ThemedStyle } from "@/utils/localTheme"

export type DateSwitcherProps = {
  title: string
  onPrevious: () => void
  onNext: () => void
}

export function DateSwitcher({ title, onPrevious, onNext }: DateSwitcherProps) {
  const colors = LOCAL_THEME.colors

  return (
    <View style={themed($dateSwitcher)}>
      <TouchableOpacity style={themed($switcherButton)} onPress={onPrevious}>
        <PhosphorIcon name="chevron-back" size={20} color={colors.text} />
      </TouchableOpacity>
      <Animated.Text
        key={title}
        entering={FadeInRight.duration(200)}
        exiting={FadeOutLeft.duration(150)}
        style={themed($switcherTitle)}
      >
        {title}
      </Animated.Text>
      <TouchableOpacity style={themed($switcherButton)} onPress={onNext}>
        <PhosphorIcon name="chevron-forward" size={20} color={colors.text} />
      </TouchableOpacity>
    </View>
  )
}

const $dateSwitcher: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.surfaceSubtle,
  borderColor: colors.surfaceCardBorder,
  borderRadius: 999,
  borderWidth: 1,
  flexDirection: "row",
  paddingHorizontal: 6,
  paddingVertical: 4,
})

const $switcherButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.surfaceCard,
  borderRadius: 999,
  height: 26,
  justifyContent: "center",
  width: 26,
})

const $switcherTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  fontSize: 13,
  lineHeight: 16,
  minWidth: 82,
  paddingHorizontal: 8,
  textAlign: "center",
})
