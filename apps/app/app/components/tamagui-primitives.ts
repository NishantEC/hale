// Re-export Tamagui primitives with relaxed TypeScript types.
// Reason: tamagui@2.0.0-rc.41 ships extremely strict prop types that
// reject standard JSX children and common style props under our strict
// + customConditions=["react-native"] tsconfig. The runtime is fine;
// only the .d.ts output confuses tsc. Once Tamagui v2 stabilizes and
// ships type fixes, these wrappers can be removed and consumers can
// import directly from "tamagui".

import {
  YStack as TamaYStack,
  XStack as TamaXStack,
  Paragraph as TamaParagraph,
  H1 as TamaH1,
  H2 as TamaH2,
  H3 as TamaH3,
  Button as TamaButton,
  Card as TamaCard,
  Input as TamaInput,
  Label as TamaLabel,
  Switch as TamaSwitch,
  Separator as TamaSeparator,
  ScrollView as TamaScrollView,
  ListItem as TamaListItem,
} from "tamagui"

type AnyProps = Record<string, any>
type AnyFC = (props: AnyProps) => any

export const YStack = TamaYStack as unknown as AnyFC
export const XStack = TamaXStack as unknown as AnyFC
export const Paragraph = TamaParagraph as unknown as AnyFC
export const H1 = TamaH1 as unknown as AnyFC
export const H2 = TamaH2 as unknown as AnyFC
export const H3 = TamaH3 as unknown as AnyFC
export const Button = TamaButton as unknown as AnyFC
export const Card = TamaCard as unknown as AnyFC
export const Input = TamaInput as unknown as AnyFC
export const Label = TamaLabel as unknown as AnyFC
export const Switch = TamaSwitch as unknown as AnyFC
export const Separator = TamaSeparator as unknown as AnyFC
export const ScrollView = TamaScrollView as unknown as AnyFC
export const ListItem = TamaListItem as unknown as AnyFC
