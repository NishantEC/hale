// @ts-nocheck
import type { SharedValue } from "react-native-reanimated";
import type { PathProps } from "react-native-svg";

interface IStrokePath extends PathProps {
  animValue: SharedValue<number>;
}

interface ICheckbox {
  checkmarkColor: string;
  readonly checked?: boolean;
  readonly stroke?: number;
  readonly showBorder?: boolean;
  readonly size?: number;
}

export type { IStrokePath, ICheckbox };
