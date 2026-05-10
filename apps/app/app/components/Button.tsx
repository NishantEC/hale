import { ComponentType } from "react"
import {
  Platform,
  Pressable,
  PressableProps,
  PressableStateCallbackType,
  StyleProp,
  TextStyle,
  ViewStyle,
} from "react-native"

import { LOCAL_THEME } from "@/utils/localTheme"
import { Text, TextProps } from "./Text"

type Presets = "default" | "filled" | "reversed"

export interface ButtonAccessoryProps {
  style: StyleProp<any>
  pressableState: PressableStateCallbackType
  disabled?: boolean
}

export interface ButtonProps extends PressableProps {
  tx?: TextProps["tx"]
  text?: TextProps["text"]
  txOptions?: TextProps["txOptions"]
  style?: StyleProp<ViewStyle>
  pressedStyle?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
  pressedTextStyle?: StyleProp<TextStyle>
  disabledTextStyle?: StyleProp<TextStyle>
  preset?: Presets
  RightAccessory?: ComponentType<ButtonAccessoryProps>
  LeftAccessory?: ComponentType<ButtonAccessoryProps>
  children?: React.ReactNode
  disabled?: boolean
  disabledStyle?: StyleProp<ViewStyle>
}

export function Button(props: ButtonProps) {
  const {
    tx,
    text,
    txOptions,
    style: $viewStyleOverride,
    pressedStyle: $pressedViewStyleOverride,
    textStyle: $textStyleOverride,
    pressedTextStyle: $pressedTextStyleOverride,
    disabledTextStyle: $disabledTextStyleOverride,
    children,
    RightAccessory,
    LeftAccessory,
    disabled,
    disabledStyle: $disabledViewStyleOverride,
    ...rest
  } = props

  const preset: Presets = props.preset ?? "default"
  const colors = LOCAL_THEME.colors
  const isDark = LOCAL_THEME.isDark

  const viewPresets: Record<Presets, ViewStyle> = {
    default: {
      ...$baseViewStyle,
      backgroundColor: "transparent",
      borderColor: colors.border,
      borderWidth: 1,
    },
    filled: {
      ...$baseViewStyle,
      backgroundColor: colors.surfaceElevated,
    },
    reversed: {
      ...$baseViewStyle,
      backgroundColor: colors.tint,
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: isDark ? 0.5 : 0.18,
          shadowRadius: 16,
        },
        android: { elevation: 6 },
      }),
    },
  }

  const textPresets: Record<Presets, TextStyle> = {
    default: { ...$baseTextStyle, color: colors.text },
    filled: { ...$baseTextStyle, color: colors.text },
    reversed: { ...$baseTextStyle, color: colors.onPrimary },
  }

  const pressedViewPresets: Record<Presets, ViewStyle> = {
    default: { backgroundColor: colors.surfaceSubtle, opacity: 0.9 },
    filled: { backgroundColor: colors.surfaceSubtle, opacity: 0.9 },
    reversed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  }

  const pressedTextPresets: Record<Presets, TextStyle> = {
    default: { opacity: 0.9 },
    filled: { opacity: 0.9 },
    reversed: { opacity: 0.95 },
  }

  function $viewStyle({ pressed }: PressableStateCallbackType): StyleProp<ViewStyle> {
    return [
      viewPresets[preset],
      $viewStyleOverride,
      !!pressed && [pressedViewPresets[preset], $pressedViewStyleOverride],
      !!disabled && [{ opacity: 0.5 }, $disabledViewStyleOverride],
    ]
  }

  function $textStyle({ pressed }: PressableStateCallbackType): StyleProp<TextStyle> {
    return [
      textPresets[preset],
      $textStyleOverride,
      !!pressed && [pressedTextPresets[preset], $pressedTextStyleOverride],
      !!disabled && $disabledTextStyleOverride,
    ]
  }

  return (
    <Pressable
      style={$viewStyle}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      {...rest}
      disabled={disabled}
    >
      {(state) => (
        <>
          {!!LeftAccessory && (
            <LeftAccessory style={$leftAccessoryStyle} pressableState={state} disabled={disabled} />
          )}

          <Text tx={tx} text={text} txOptions={txOptions} style={$textStyle(state)}>
            {children}
          </Text>

          {!!RightAccessory && (
            <RightAccessory
              style={$rightAccessoryStyle}
              pressableState={state}
              disabled={disabled}
            />
          )}
        </>
      )}
    </Pressable>
  )
}

const $baseViewStyle: ViewStyle = {
  minHeight: 48,
  borderRadius: 9999,
  justifyContent: "center",
  alignItems: "center",
  paddingVertical: 12,
  paddingHorizontal: 24,
  overflow: "hidden",
  flexDirection: "row",
}

const $baseTextStyle: TextStyle = {
  fontSize: 14,
  lineHeight: 16,
  fontWeight: "700",
  letterSpacing: 1.4,
  textAlign: "center",
  textTransform: "uppercase",
  flexShrink: 1,
  flexGrow: 0,
  zIndex: 2,
}

const $rightAccessoryStyle: ViewStyle = { marginStart: 8, zIndex: 1 }
const $leftAccessoryStyle: ViewStyle = { marginEnd: 8, zIndex: 1 }
