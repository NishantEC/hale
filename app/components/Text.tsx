import { ReactNode, forwardRef, ForwardedRef } from "react"
// eslint-disable-next-line no-restricted-imports
import { StyleProp, Text as RNText, TextProps as RNTextProps, TextStyle } from "react-native"
import { TOptions } from "i18next"

import { isRTL, TxKeyPath } from "@/i18n"
import { translate } from "@/i18n/translate"

type Sizes = keyof typeof $sizeStyles
type Weights = "light" | "normal" | "medium" | "semiBold" | "bold"
type Presets = "default" | "bold" | "heading" | "subheading" | "formLabel" | "formHelper"

export interface TextProps extends RNTextProps {
  tx?: TxKeyPath
  text?: string
  txOptions?: TOptions
  style?: StyleProp<TextStyle>
  preset?: Presets
  weight?: Weights
  size?: Sizes
  children?: ReactNode
}

/**
 * Typography primitive. Public API preserved from the Ignite original
 * (tx / text / preset / size / weight / style) so every screen keeps
 * working without changes. Internals no longer depend on the theme
 * directory — weights and sizes are expressed as plain RN styles with
 * system font weights.
 */
export const Text = forwardRef(function Text(props: TextProps, ref: ForwardedRef<RNText>) {
  const { weight, size, tx, txOptions, text, children, style: $styleOverride, ...rest } = props

  const i18nText = tx && translate(tx, txOptions)
  const content = i18nText || text || children

  const preset: Presets = props.preset ?? "default"
  const $styles: StyleProp<TextStyle> = [
    $rtlStyle,
    $presets[preset],
    weight && $fontWeightStyles[weight],
    size && $sizeStyles[size],
    $styleOverride,
  ]

  return (
    <RNText {...rest} style={$styles} ref={ref}>
      {content}
    </RNText>
  )
})

const $sizeStyles = {
  xxl: { fontSize: 36, lineHeight: 44 } satisfies TextStyle,
  xl: { fontSize: 24, lineHeight: 34 } satisfies TextStyle,
  lg: { fontSize: 20, lineHeight: 32 } satisfies TextStyle,
  md: { fontSize: 18, lineHeight: 26 } satisfies TextStyle,
  sm: { fontSize: 16, lineHeight: 24 } satisfies TextStyle,
  xs: { fontSize: 14, lineHeight: 21 } satisfies TextStyle,
  xxs: { fontSize: 12, lineHeight: 18 } satisfies TextStyle,
}

const $fontWeightStyles: Record<Weights, TextStyle> = {
  light: { fontWeight: "300" },
  normal: { fontWeight: "400" },
  medium: { fontWeight: "500" },
  semiBold: { fontWeight: "600" },
  bold: { fontWeight: "700" },
}

const $baseStyle: TextStyle = {
  ...$sizeStyles.sm,
  ...$fontWeightStyles.normal,
  color: "#FFFFFF",
}

const $presets: Record<Presets, TextStyle> = {
  default: { ...$baseStyle },
  bold: { ...$baseStyle, ...$fontWeightStyles.bold },
  heading: { ...$baseStyle, ...$sizeStyles.xxl, ...$fontWeightStyles.bold },
  subheading: { ...$baseStyle, ...$sizeStyles.lg, ...$fontWeightStyles.medium },
  formLabel: { ...$baseStyle, ...$fontWeightStyles.medium },
  formHelper: { ...$baseStyle, ...$sizeStyles.sm, ...$fontWeightStyles.normal },
}

const $rtlStyle: TextStyle = isRTL ? { writingDirection: "rtl" } : {}
