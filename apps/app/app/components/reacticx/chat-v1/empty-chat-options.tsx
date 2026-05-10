import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { IChipGrid } from "./types";

export const EmptyChipGrid: React.FC<IChipGrid> = ({
  options,
  columns = 2,
  gap = 12,
  containerStyle,
  chipStyle,
  labelStyle,
  iconStyle,
}) => {
  return (
    <View style={[styles.container, containerStyle]}>
      {chunkArray(options, columns).map((row, rowIdx) => (
        <View
          key={rowIdx}
          style={[styles.row, { marginTop: rowIdx === 0 ? 0 : gap }]}
        >
          {row.map((item, colIdx) => (
            <TouchableOpacity
              key={`${rowIdx}-${colIdx}`}
              activeOpacity={0.7}
              onPress={item.onPress}
              style={[
                styles.chip,
                chipStyle,
                {
                  marginLeft: colIdx === 0 ? 0 : gap,
                },
              ]}
            >
              <View style={[styles.iconWrapper, iconStyle]}>{item.icon}</View>
              <Text style={[styles.label, labelStyle]} numberOfLines={1}>
                {item.text}
              </Text>
            </TouchableOpacity>
          ))}
          {row.length < columns &&
            Array.from({ length: columns - row.length }).map((_, i) => (
              <View key={`spacer-${i}`} style={{ flex: 1, marginLeft: gap }} />
            ))}
        </View>
      ))}
    </View>
  );
};

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  row: {
    flexDirection: "row",
  },
  chip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  iconWrapper: {
    marginRight: 8,
  },
  label: {
    color: "#E5E5E5",
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 0.15,
  },
});
