import type { SkFont } from "@shopify/react-native-skia";
import type { TStaggerFrom, ICharacterMetrics } from "./types";

const withBuildCharacterMetrics = <T extends SkFont>(
  text: string,
  font: NonNullable<T extends SkFont ? T : never>,
  staggerFrom: TStaggerFrom,
  charDelay: number,
  letterSpacing: number = 0,
): ICharacterMetrics[] => {
  const chars = text.split("");
  const widths = chars.map((c) => font.measureText(c).width);
  const delays = getStaggerDelays(chars.length, staggerFrom, charDelay);

  let XOFFSET: number = 0;
  return chars.map((char, i) => {
    const m: ICharacterMetrics = {
      char,
      x: XOFFSET,
      width: widths[i],
      delay: delays[i],
    };
    XOFFSET += widths[i] + letterSpacing;
    return m;
  });
};

const getStaggerDelays = <T extends number>(
  count: T,
  from: TStaggerFrom,
  step: number,
): number[] => {
  switch (from) {
    case "leading":
      return Array.from({ length: count }, (_, i) => i * step);
    case "trailing":
      return Array.from({ length: count }, (_, i) => (count - 1 - i) * step);
    case "center": {
      const mid = (count - 1) / 2;
      return Array.from({ length: count }, (_, i) => Math.abs(i - mid) * step);
    }
    case "edges": {
      const mid = (count - 1) / 2;
      return Array.from(
        { length: count },
        (_, i) => (mid - Math.abs(i - mid)) * step,
      );
    }
    case "random":
      return Array.from({ length: count }, () => Math.random() * count * step);
  }
};

export { withBuildCharacterMetrics, getStaggerDelays };
