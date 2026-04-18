import React, { useEffect } from "react";
import { Image, ImageBackground, StyleSheet, View , useWindowDimensions } from "react-native";
import Text from "../components/TranslatedText";

import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";


export default function LaunchScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const logoWidth = Math.round(clamp(width * 0.82, 240, 360));
  const logoHeight = Math.round(clamp(logoWidth * 0.38, 92, 136));
  const subtitleSize = Math.round(clamp(width * 0.09, 24, 40));
  const bottomOffset = Math.round(clamp(height * 0.065, 30, 62));

  useEffect(() => {
    const t = setTimeout(() => router.replace("/login"), 1800);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <View style={styles.root}>
      <ImageBackground
        source={require("../assets/splash.png")}
        style={styles.bg}
        imageStyle={{ opacity: 0.50 }}
        resizeMode="cover"
      >
        
        <LinearGradient
          colors={[
            "rgba(14,45,82,0.00)",
            "rgba(14,45,82,0.78)",
            "rgba(14,45,82,0.97)",
          ]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* Center content */}
        <View style={styles.centerWrap}>
          <View style={styles.brandRow}>
            <Image
              source={require("../assets/fortis-logo.png")}
              style={[styles.mark, { width: logoWidth, height: logoHeight }]}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Bottom text */}
        <View style={[styles.bottomWrap, { bottom: bottomOffset }]}> 
          <Text style={[styles.subtitle, { fontSize: subtitleSize }]}>Certis Cisco</Text>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0E2D52",
  },
  bg: {
    flex: 1,
    
  },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1, 
  },
  mark: {
    width: 320,
    height: 120,
  },

  bottomWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 50, 
    alignItems: "center",
  },
  subtitle: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "400",
    letterSpacing: -0.4,
  },
});
