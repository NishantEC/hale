import { FC, ReactNode } from "react"
import { TouchableOpacity, View, ViewStyle } from "react-native"
import {
  Bug,
  Database,
  Power,
  Wrench,
} from "phosphor-react-native"
import type { Icon as PhosphorIcon } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Handler = () => void | Promise<void>

type Props = {
  onProbeRange: Handler
  onRunPipeline: Handler
  onOpenWebInspector: Handler
  onRewindTs: Handler
  onRewindAck: Handler
  onRewindBare: Handler
  onWhoopsiInit: Handler
  onForceTrimLegacy: Handler
  onForceTrimMaverick: Handler
  onRebootStrap: Handler
  onPowerCycleStrap: Handler
}

export const ExpertActions: FC<Props> = (h) => {
  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      <Group label="Diagnostics" labelColor="#fbbf24">
        <Btn icon={Bug} label="Probe range" onPress={h.onProbeRange} />
        <Btn icon={Database} label="Run pipeline" onPress={h.onRunPipeline} />
        <Btn icon={Bug} label="Web inspector" onPress={h.onOpenWebInspector} />
      </Group>

      <Group label="Firmware probes" labelColor="#fbbf24">
        <Btn icon={Wrench} label="Rewind ts (4B)" onPress={h.onRewindTs} />
        <Btn icon={Wrench} label="Rewind ack (9B)" onPress={h.onRewindAck} />
        <Btn icon={Wrench} label="Rewind bare" onPress={h.onRewindBare} />
        <Btn icon={Wrench} label="WHOOPSI init" onPress={h.onWhoopsiInit} />
      </Group>

      <Group label="Danger" labelColor="#fca5a5">
        <Btn icon={Wrench} label="Force trim legacy" danger onPress={h.onForceTrimLegacy} />
        <Btn icon={Wrench} label="Force trim mvk" danger onPress={h.onForceTrimMaverick} />
        <Btn icon={Power} label="Reboot strap" danger onPress={h.onRebootStrap} />
        <Btn icon={Power} label="Power-cycle" danger onPress={h.onPowerCycleStrap} />
      </Group>
    </View>
  )
}

const Group: FC<{ label: string; labelColor: string; children: ReactNode }> = ({
  label,
  labelColor,
  children,
}) => (
  <View>
    <Text
      text={label}
      size="xxs"
      weight="semiBold"
      style={{
        color: labelColor,
        textTransform: "uppercase",
        letterSpacing: 0.7,
        paddingHorizontal: 6,
        paddingBottom: 4,
      }}
    />
    <View style={$grid}>{children}</View>
  </View>
)

const Btn: FC<{
  icon: PhosphorIcon
  label: string
  danger?: boolean
  onPress: Handler
}> = ({ icon: Icon, label, danger, onPress }) => {
  const { colors } = LOCAL_THEME
  return (
    <TouchableOpacity
      style={[
        $btn,
        danger
          ? { backgroundColor: "#2a1a1a", borderColor: "#3a1a1a", borderWidth: 1 }
          : { backgroundColor: colors.surfaceElevated },
      ]}
      onPress={() => void onPress()}
      activeOpacity={0.7}
    >
      <Icon size={16} color={danger ? "#fca5a5" : colors.text} weight="regular" />
      <Text
        text={label}
        size="xxs"
        style={{
          color: danger ? "#fca5a5" : colors.text,
          textAlign: "center",
        }}
      />
    </TouchableOpacity>
  )
}

const $grid: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 6 }
const $btn: ViewStyle = {
  width: "48.5%",
  borderRadius: 12,
  paddingVertical: 10,
  paddingHorizontal: 4,
  alignItems: "center",
  gap: 4,
}
