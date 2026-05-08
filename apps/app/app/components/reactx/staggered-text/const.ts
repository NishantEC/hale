import { Easing } from "react-native-reanimated";
import type { TResolvedChar, TResolvedConfig } from "./types";

const DEFAULT_ENTER_FROM: TResolvedChar = {
  translateY: 0,
  opacity: 1,
  blur: 0,
  scale: 1,
};
const DEFAULT_ENTER_TO: TResolvedChar = {
  translateY: 1,
  opacity: 0,
  blur: 4,
  scale: 1,
};
const DEFAULT_EXIT_FROM: TResolvedChar = {
  translateY: 0,
  opacity: 1,
  blur: 0,
  scale: 1,
};
const DEFAULT_EXIT_TO: TResolvedChar = {
  translateY: -1,
  opacity: 0,
  blur: 4,
  scale: 1,
};
const DEFAULT_CONFIG: TResolvedConfig = {
  duration: 800,
  repeatDelay: 1000,
  characterDelay: 50,
  enterEasing: Easing.out(Easing.quad),
  exitEasing: Easing.out(Easing.quad),
  repeatCount: -1,
};

export {
  DEFAULT_ENTER_FROM,
  DEFAULT_ENTER_TO,
  DEFAULT_EXIT_FROM,
  DEFAULT_EXIT_TO,
  DEFAULT_CONFIG,
};
