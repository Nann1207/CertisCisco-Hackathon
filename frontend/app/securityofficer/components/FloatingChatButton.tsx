import React from "react";
import { Image, Pressable, StyleSheet, ViewStyle } from "react-native";
import { usePathname, useRouter } from "expo-router";
import Svg, { Defs, RadialGradient, Stop, Circle } from "react-native-svg";

const ROBOT_ICON = require("../assets/robot.png");

type Props = {
  bottomOffset?: number;
  rightOffset?: number;
  size?: number; // <-- make it bigger easily
  targetHref?: string;
  style?: ViewStyle;
};

export default function FloatingChatButton({
  bottomOffset = 104, // slightly higher because button is bigger
  rightOffset = 20,
  size = 62, // <-- bigger than your original 46ish
  targetHref = "/securityofficer/chatbot",
  style,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname?.endsWith("/chatbot")) {
    return null;
  }

  return (
    <Pressable
      onPress={() => router.push(targetHref as any)}
      style={[
        styles.fab,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          bottom: bottomOffset,
          right: rightOffset,
        },
        style,
      ]}
      hitSlop={12}
    >
      {/* Radial gradient background */}
      <Svg width={size} height={size} style={StyleSheet.absoluteFillObject}>
        <Defs>
          {/* Figma: radial-gradient( ... at 48.97% 46.45%, #4B7DB0 0%, #0E2D52 100%) */}
          <RadialGradient
            id="grad"
            cx="48.97%"
            cy="46.45%"
            rx="84.62%"
            ry="84.62%"
            fx="48.97%"
            fy="46.45%"
          >
            <Stop offset="0%" stopColor="#4B7DB0" />
            <Stop offset="100%" stopColor="#0E2D52" />
          </RadialGradient>
        </Defs>

        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#grad)" />
      </Svg>

      <Image source={ROBOT_ICON} style={styles.robotIcon} resizeMode="cover" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",

    // shadow like your spec:
    shadowColor: "rgba(14, 45, 82, 1)",
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    zIndex: 20,

    // ensure gradient is clipped perfectly to circle
    overflow: "hidden",
  },
  robotIcon: {
    width: "100%",
    height: "100%",
  },
});
