import { FC, ReactNode } from "react"
import { TouchableOpacity, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

import { InspectorCard } from "./InspectorCard"

type ActionHandler = () => void | Promise<void>

type Props = {
  onSync: ActionHandler
  onForceUpload: ActionHandler
  onRunPipeline: ActionHandler
  onRefreshView: ActionHandler
  onRebootStrap: ActionHandler
  onPowerCycleStrap: ActionHandler
  onClearQueue: ActionHandler
  onOpenWebInspector: ActionHandler
  onProbeDataRange: ActionHandler
  onRewindTs: ActionHandler
  onRewindAck: ActionHandler
  onRewindBare: ActionHandler
}

export const ActionsCard: FC<Props> = (handlers) => (
  <InspectorCard title="Actions" defaultExpanded={false}>
    <SectionLabel text="Data" />
    <Grid>
      <Btn label="Sync from Strap" onPress={handlers.onSync} />
      <Btn label="Force Upload" onPress={handlers.onForceUpload} />
      <Btn label="Run Pipeline" onPress={handlers.onRunPipeline} />
      <Btn label="Refresh View" onPress={handlers.onRefreshView} />
    </Grid>
    <SectionLabel text="Strap RE Probes" />
    <Grid>
      <Btn label="Probe Data Range" onPress={handlers.onProbeDataRange} />
    </Grid>
    <SectionLabel text="Rewind (try in order)" />
    <Grid>
      <Btn label="Rewind ts (4B)" onPress={handlers.onRewindTs} />
      <Btn label="Rewind ack (9B)" onPress={handlers.onRewindAck} />
      <Btn label="Rewind bare (1B)" onPress={handlers.onRewindBare} />
    </Grid>
    <SectionLabel text="Recovery" />
    <Grid>
      <Btn label="Reboot Strap" onPress={handlers.onRebootStrap} danger />
      <Btn label="Power-cycle Strap" onPress={handlers.onPowerCycleStrap} danger />
      <Btn label="Clear Queue" onPress={handlers.onClearQueue} />
      <Btn label="Open Web Inspector" onPress={handlers.onOpenWebInspector} />
    </Grid>
  </InspectorCard>
)

const SectionLabel: FC<{ text: string }> = ({ text }) => {
  const { colors } = LOCAL_THEME
  return (
    <Text
      text={text}
      size="xxs"
      weight="bold"
      style={{
        color: colors.textDim,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginTop: 8,
        marginBottom: 6,
      }}
    />
  )
}

const Grid: FC<{ children: ReactNode }> = ({ children }) => (
  <View style={$grid}>{children}</View>
)

const Btn: FC<{ label: string; onPress: ActionHandler; danger?: boolean }> = ({
  label,
  onPress,
  danger,
}) => {
  const { colors } = LOCAL_THEME
  return (
    <TouchableOpacity
      onPress={() => void onPress()}
      activeOpacity={0.7}
      style={[
        $btn,
        { backgroundColor: danger ? colors.errorBackground : colors.surfaceElevated },
      ]}
    >
      <Text
        text={label}
        size="xxs"
        weight="semiBold"
        style={{ color: danger ? colors.error : colors.text, textAlign: "center" }}
      />
    </TouchableOpacity>
  )
}

const $grid: ViewStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 6,
}

const $btn: ViewStyle = {
  flexBasis: "48%",
  flexGrow: 1,
  borderRadius: 8,
  paddingVertical: 10,
  paddingHorizontal: 8,
  alignItems: "center",
}
