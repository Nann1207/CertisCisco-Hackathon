import React from "react";
import { Image, ImageBackground, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

export default function LaunchScreen() {
  return (
    <View style={styles.root}>
      <ImageBackground
        source={require("../assets/splash.png")}
        style={styles.bg}
        resizeMode="cover"
      >
        {/* Dark overlay + bottom fade */}
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
            <Text style={styles.fortis}>FORTIS</Text>
            <Image
              source={require("../assets/fortis-mark.png")}
              style={styles.mark}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Bottom text */}
        <View style={styles.bottomWrap}>
          <Text style={styles.subtitle}>Certis Cisco</Text>
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
  fortis: {
    color: "#FFFFFF",
    fontSize: 64,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  mark: {
    width: 120,
    height: 120,
    marginLeft: -20,
    marginTop: 8, // slight drop so it visually aligns like your design
  },

  bottomWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 70, // tweak to match your mock
    alignItems: "center",
  },
  subtitle: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "400",
    letterSpacing: -0.4,
  },
});
