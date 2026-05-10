import { StyleSheet } from "react-native";
import type { WithSpringConfig } from "react-native-reanimated";

const DOCK_DEFAULTS = {
  height: 64,
  size: 50,
  peakSize: 70,
  spread: 1,
  damping: 18,
  stiffness: 220,
  mass: 0.5,
  dockColor: "rgba(255,255,255,0.9)" as const,
  iconColor: "#fff" as const,
  tipColor: "rgba(255,255,255,0.95)" as const,
  tipFontColor: "#333" as const,
  iconRadius: 12,
  dockRadius: 16,
  showTip: true,
  gap: 3,
  paddingTop: 0,
  paddingBottom: 6,
  marginBottom: 0,
} as const;

const ACTIVATE_SPRING: WithSpringConfig = {
  damping: 22,
  stiffness: 400,
  mass: 0.35,
} as const;

const TOOLTIP_SPRING: WithSpringConfig = {
  damping: 20,
  stiffness: 300,
} as const;

const ISACTIVE_INPUT = [0, 1] as const;
const TOOLTIP_OPACITY_INPUT = [0, 0.5] as const;
const TOOLTIP_OPACITY_OUTPUT = [1, 0] as const;
const TOOLTIP_TRANSLATE_OUTPUT = [6, 0] as const;

const styles = StyleSheet.create({
  dockContainer: {
    alignSelf: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.08)",
    paddingHorizontal: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  dockInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    paddingBottom: 6,
  },
  iconWrapper: {
    justifyContent: "flex-end",
    alignItems: "center",
    overflow: "visible",
  },
  tooltip: {
    position: "absolute",
    top: -30,
    alignSelf: "center",
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 4,
  },
  tooltipText: {
    fontSize: 11,
    fontWeight: "500",
  },
  iconInner: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.06)",
    padding: 6,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
});

export {
  DOCK_DEFAULTS,
  ACTIVATE_SPRING,
  TOOLTIP_SPRING,
  ISACTIVE_INPUT,
  TOOLTIP_OPACITY_INPUT,
  TOOLTIP_OPACITY_OUTPUT,
  TOOLTIP_TRANSLATE_OUTPUT,
  styles,
};
