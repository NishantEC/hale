import { Ionicons } from "@expo/vector-icons";
import type { ReactElement } from "react";

interface Dimensions {
  width: number;
  height: number;
  x: number;
  y: number;
}

type IconName = keyof typeof Ionicons.glyphMap;
type IconRenderFn = () => ReactElement & React.ReactNode;

interface FlexiButtonProps {
  onPress?: () => void;
  collapsedWidth?: number;
  expandedWidth?: number;
  text?: string;
  icon?: IconName | IconRenderFn;
  onDimensionsChange?: (dimensions: Dimensions) => void;
  backgroundColor?: string;
}

export { FlexiButtonProps, Dimensions };
