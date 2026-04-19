import { ComponentType } from "react"
import {
  Pressable,
  PressableProps,
  PressableStateCallbackType,
  StyleProp,
  TextStyle,
  ViewStyle,
} from "react-native"

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

/**
 * Button primitive. Public API preserved from the Ignite original.
 * Internals no longer depend on @/theme — presets are inlined as
 * plain RN styles. Screens that use <Button tx=... /> keep working.
 */
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

  function $viewStyle({ pressed }: PressableStateCallbackType): StyleProp<ViewStyle> {
    return [
      $viewPresets[preset],
      $viewStyleOverride,
      !!pressed && [$pressedViewPresets[preset], $pressedViewStyleOverride],
      !!disabled && $disabledViewStyleOverride,
    ]
  }

  function $textStyle({ pressed }: PressableStateCallbackType): StyleProp<TextStyle> {
    return [
      $textPresets[preset],
      $textStyleOverride,
      !!pressed && [$pressedTextPresets[preset], $pressedTextStyleOverride],
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
  minHeight: 56,
  borderRadius: 4,
  justifyContent: "center",
  alignItems: "center",
  paddingVertical: 12,
  paddingHorizontal: 12,
  overflow: "hidden",
  flexDirection: "row",
}

const $baseTextStyle: TextStyle = {
  fontSize: 16,
  lineHeight: 20,
  fontWeight: "500",
  textAlign: "center",
  flexShrink: 1,
  flexGrow: 0,
  zIndex: 2,
}

const $rightAccessoryStyle: ViewStyle = { marginStart: 8, zIndex: 1 }
const $leftAccessoryStyle: ViewStyle = { marginEnd: 8, zIndex: 1 }

const $viewPresets: Record<Presets, ViewStyle> = {
  default: { ...$baseViewStyle, borderWidth: 1, borderColor: "#B6ACA6", backgroundColor: "#FFFFFF" },
  filled: { ...$baseViewStyle, backgroundColor: "#D7CEC9" },
  reversed: { ...$baseViewStyle, backgroundColor: "#191015" },
}

const $textPresets: Record<Presets, TextStyle> = {
  default: { ...$baseTextStyle },
  filled: { ...$baseTextStyle },
  reversed: { ...$baseTextStyle, color: "#FFFFFF" },
}

const $pressedViewPresets: Record<Presets, ViewStyle> = {
  default: { backgroundColor: "#F4F2F1" },
  filled: { backgroundColor: "#B6ACA6" },
  reversed: { backgroundColor: "#3C3836" },
}

const $pressedTextPresets: Record<Presets, TextStyle> = {
  default: { opacity: 0.9 },
  filled: { opacity: 0.9 },
  reversed: { opacity: 0.9 },
}
