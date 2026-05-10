import React, { useState } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  Platform,
  type TextInputContentSizeChangeEvent,
} from "react-native";
import { useResponsive } from "@/helpers/hooks/use-responsive";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";

const MAX_LINES = 5;

interface InputBarProps {
  onSend: (message: string) => void;
}

export const InputBar: React.FC<InputBarProps> = ({
  onSend,
}: InputBarProps) => {
  const screen = useResponsive();

  const [value, setValue] = useState<string>("");
  const [inputHeight, setInputHeight] = useState<number>(0);

  const iconSize = screen.rf(20);
  const circleSize = screen.rf(44);

  const lineHeight = screen.rf(22);
  const minHeight = lineHeight;
  const maxHeight = lineHeight * MAX_LINES;

  const handleContentSizeChange = (e: TextInputContentSizeChangeEvent) => {
    const newHeight = e.nativeEvent.contentSize.height;
    setInputHeight(Math.min(newHeight, maxHeight));
  };

  const handleOnPress = () => {
    onSend(value);
    setValue("");
  };

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.container,
          {
            paddingHorizontal: screen.rf(18),
            paddingTop: screen.rf(16),
            paddingBottom: screen.rf(14),
            borderRadius: screen.rf(28),
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="Ask me anything..."
          placeholderTextColor="#B0B0B0"
          multiline
          scrollEnabled={inputHeight >= maxHeight}
          onContentSizeChange={handleContentSizeChange}
          style={[
            styles.input,
            {
              fontSize: screen.rf(17),
              lineHeight,
              minHeight,
              maxHeight,
            },
          ]}
          selectionColor="#fff"
          textAlignVertical="top"
        />

        <View style={styles.bottomRow}>
          <View style={styles.leftIcons}>
            <Pressable>
              <Feather name="plus" size={iconSize} color="#CFCFCF" />
            </Pressable>

            <Pressable>
              <Ionicons name="globe-outline" size={iconSize} color="#CFCFCF" />
            </Pressable>

            <Pressable>
              <MaterialCommunityIcons
                name="bullhorn-outline"
                size={iconSize}
                color="#CFCFCF"
              />
            </Pressable>
          </View>

          <View style={styles.rightIcons}>
            {value.length === 0 ? (
              <>
                <Feather name="mic" size={iconSize} color="#CFCFCF" />
                <View
                  style={[
                    styles.voiceCircle,
                    {
                      width: circleSize,
                      height: circleSize,
                      borderRadius: circleSize / 2,
                    },
                  ]}
                >
                  {Platform.OS === "ios" ? (
                    <>
                      <SymbolView
                        name="waveform"
                        tintColor={"#000"}
                        size={iconSize}
                      />
                    </>
                  ) : (
                    <Ionicons name="walk" size={iconSize} color="#000" />
                  )}
                </View>
              </>
            ) : (
              <Pressable
                onPress={handleOnPress}
                style={[
                  styles.voiceCircle,
                  {
                    width: circleSize,
                    height: circleSize,
                    borderRadius: circleSize / 2,
                  },
                ]}
              >
                <Ionicons name="arrow-up" size={iconSize} color="#000" />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },

  container: {
    backgroundColor: "#1C1C1E",
    flexDirection: "column",
  },

  input: {
    color: "#FFFFFF",
    width: "100%",
  },

  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 12,
  },

  leftIcons: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
  },

  rightIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  voiceCircle: {
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
});
