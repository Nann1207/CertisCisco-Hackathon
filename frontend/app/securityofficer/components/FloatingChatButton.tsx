import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Image, PanResponder, StyleSheet, ViewStyle, useWindowDimensions } from "react-native";
import { usePathname, useRouter } from "expo-router";
import Svg, { Defs, RadialGradient, Stop, Circle } from "react-native-svg";

const ROBOT_ICON = require("../assets/robot.png");

type Point = { x: number; y: number };

const sessionFabPositions = new Map<string, Point>();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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
  const { width, height } = useWindowDimensions();
  const isHidden = pathname?.endsWith("/chatbot");

  const cacheKey = targetHref;
  const maxX = Math.max(0, width - size);
  const maxY = Math.max(0, height - size);

  const clampPoint = useMemo(
    () => (p: Point): Point => ({ x: clamp(p.x, 0, maxX), y: clamp(p.y, 0, maxY) }),
    [maxX, maxY]
  );

  const defaultPoint = useMemo(() => {
    const x = width - rightOffset - size;
    const y = height - bottomOffset - size;
    return clampPoint({ x, y });
  }, [bottomOffset, clampPoint, height, rightOffset, size, width]);

  const initialPoint = useMemo(() => clampPoint(sessionFabPositions.get(cacheKey) ?? defaultPoint), [cacheKey, clampPoint, defaultPoint]);

  const pan = useRef(new Animated.ValueXY(initialPoint)).current;
  const startPointRef = useRef<Point>(initialPoint);
  const movedRef = useRef(false);

  useEffect(() => {
    const next = clampPoint(sessionFabPositions.get(cacheKey) ?? defaultPoint);
    startPointRef.current = next;
    pan.setValue(next);
  }, [cacheKey, clampPoint, defaultPoint, pan]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
        onPanResponderGrant: () => {
          movedRef.current = false;
          const current = (pan as any).__getValue?.() as Point | undefined;
          startPointRef.current = clampPoint(current ?? startPointRef.current);
        },
        onPanResponderMove: (_, gesture) => {
          const dx = gesture.dx ?? 0;
          const dy = gesture.dy ?? 0;
          if (!movedRef.current && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) movedRef.current = true;

          const next = clampPoint({
            x: startPointRef.current.x + dx,
            y: startPointRef.current.y + dy,
          });
          pan.setValue(next);
        },
        onPanResponderRelease: () => {
          const current = (pan as any).__getValue?.() as Point | undefined;
          const next = clampPoint(current ?? startPointRef.current);
          startPointRef.current = next;
          sessionFabPositions.set(cacheKey, next);
          pan.setValue(next);

          if (!movedRef.current) {
            router.push(targetHref as any);
          }
        },
        onPanResponderTerminate: () => {
          const next = clampPoint(startPointRef.current);
          pan.setValue(next);
        },
      }),
    [cacheKey, clampPoint, pan, router, targetHref]
  );

  if (isHidden) {
    return null;
  }

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.fab,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        { transform: pan.getTranslateTransform() },
        style,
      ]}
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    left: 0,
    top: 0,
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
