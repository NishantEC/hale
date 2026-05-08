import { XStack, Paragraph } from "./tamagui-primitives"

type StatusPillProps = {
  label: string
  tone?: "default" | "success" | "warning"
}

const TONE_COLORS: Record<NonNullable<StatusPillProps["tone"]>, { bg: string; border: string }> = {
  default: { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.08)" },
  success: { bg: "rgba(44,204,113,0.14)", border: "rgba(44,204,113,0.2)" },
  warning: { bg: "rgba(255,170,40,0.14)", border: "rgba(255,170,40,0.2)" },
}

export function StatusPill({ label, tone = "default" }: StatusPillProps) {
  const colors = TONE_COLORS[tone]
  return (
    <XStack
      paddingHorizontal={10}
      paddingVertical={6}
      borderRadius={999}
      borderWidth={1}
      backgroundColor={colors.bg}
      borderColor={colors.border}
      alignSelf="flex-start"
    >
      <Paragraph
        fontSize={11}
        fontWeight="600"
        textTransform="uppercase"
        letterSpacing={0.6}
      >
        {label}
      </Paragraph>
    </XStack>
  )
}
