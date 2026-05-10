import type { StyleProp, ViewStyle } from "react-native";

type TextDirection = "left" | "right";

enum Direction {
  Left = "left",
  Right = "right",
}

interface ICurvedMarquee {
  readonly text?: string;
  readonly speed?: number;
  readonly curve?: number;
  readonly direction?: Direction | TextDirection;
  readonly textColor?: string;
  readonly fontSize?: number;
  readonly copies?: number;
  readonly style?: StyleProp<Required<ViewStyle>>;
}

export type { ICurvedMarquee, TextDirection };
export { Direction };
