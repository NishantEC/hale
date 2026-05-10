import { View, Text } from "react-native";
import React from "react";
import { useFonts } from "expo-font";
import { MaterialIcons, FontAwesome, AntDesign } from "@expo/vector-icons";

export function ChatHeader() {
  const [fontLoaded] = useFonts({
    HelveticaNowDisplay: require("@/assets/fonts/HelveticaNowDisplayMedium.ttf"),
  });

  return (
    <View
      style={{
        width: "100%",
        height: 100,
        position: "absolute",
        left: 0,
        backgroundColor: "#000",
        borderBottomWidth: 0.5,
        borderBottomColor: "#333",
        paddingHorizontal: 16,
        paddingTop: 40,
        justifyContent: "center",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
          }}
        >
          <MaterialIcons name="menu" size={22} color="#fff" />
          <Text
            style={{
              color: "#fff",
              fontSize: 18,
              fontFamily: fontLoaded ? "HelveticaNowDisplay" : undefined,
            }}
          >
            ChadGPT
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 18,
          }}
        >
          <FontAwesome name="pencil-square-o" size={20} color="#fff" />
          <AntDesign name="ellipsis" size={20} color="#fff" />
        </View>
      </View>
    </View>
  );
}
