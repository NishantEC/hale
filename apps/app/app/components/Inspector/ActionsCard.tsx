import { FC, ReactNode } from "react"
import { TouchableOpacity, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"

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
    <SectionLabel text="Recovery" />
    <Grid>
      <Btn label="Reboot Strap" onPress={handlers.onRebootStrap} danger />
      <Btn label="Power-cycle Strap" onPress={handlers.onPowerCycleStrap} danger />
      <Btn label="Clear Queue" onPress={handlers.onClearQueue} />
      <Btn label="Open Web Inspector" onPress={handlers.onOpenWebInspector} />
    </Grid>
  </InspectorCard>
)

const SectionLabel: FC<{ text: string }> = ({ text }) => (
  <Text
    text={text}
    size="xxs"
    weight="bold"
    style={{ color: "#564E4A", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 8, marginBottom: 6 }}
  />
)

const Grid: FC<{ children: ReactNode }> = ({ children }) => (
  <View style={$grid}>{children}</View>
)

const Btn: FC<{ label: string; onPress: ActionHandler; danger?: boolean }> = ({ label, onPress, danger }) => (
  <TouchableOpacity
    onPress={() => void onPress()}
    activeOpacity={0.7}
    style={[$btn, danger ? $btnDanger : null]}
  >
    <Text
      text={label}
      size="xxs"
      weight="semiBold"
      style={{ color: danger ? "#8a1a1a" : "#191015", textAlign: "center" }}
    />
  </TouchableOpacity>
)

const $grid: ViewStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 6,
}

const $btn: ViewStyle = {
  flexBasis: "48%",
  flexGrow: 1,
  backgroundColor: "rgba(0,0,0,0.06)",
  borderRadius: 8,
  paddingVertical: 10,
  paddingHorizontal: 8,
  alignItems: "center",
}

const $btnDanger: ViewStyle = {
  backgroundColor: "rgba(239,68,68,0.12)",
}
