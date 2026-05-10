import React, { useEffect, useState, useRef } from "react";
import { Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from "react-native-reanimated";

const CHAR_DELAY = 18;
const FADE_DURATION = 250;

interface StreamingTextProps {
  text: string;
  style?: any;
  onComplete?: () => void;
}

function FadeChar({ char, delay }: { char: string; delay: number }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(4);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: FADE_DURATION, easing: Easing.out(Easing.ease) })
    );
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: FADE_DURATION, easing: Easing.out(Easing.ease) })
    );
  }, [delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.Text style={animatedStyle}>
      {char}
    </Animated.Text>
  );
}

export function StreamingText({ text, style, onComplete }: StreamingTextProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const hasCompleted = useRef(false);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setVisibleCount(i);
      if (i >= text.length) {
        clearInterval(interval);
        if (!hasCompleted.current) {
          hasCompleted.current = true;
          onComplete?.();
        }
      }
    }, CHAR_DELAY);
    return () => clearInterval(interval);
  }, [text, onComplete]);

  return (
    <Text style={[styles.text, style]}>
      {text
        .slice(0, visibleCount)
        .split("")
        .map((char, index) => (
          <FadeChar key={index} char={char} delay={0} />
        ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    color: "#E5E5E5",
    fontSize: 15,
  },
});
