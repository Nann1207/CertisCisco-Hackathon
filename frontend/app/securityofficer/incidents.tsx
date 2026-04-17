import React from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Text from "../../components/TranslatedText";
import { useRouter } from "expo-router";

export default function IncidentsScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const gap = Math.round(clamp(height * 0.015, 8, 14));
  const titleSize = Math.round(clamp(width * 0.07, 20, 28));
  const subtitleSize = Math.round(clamp(width * 0.04, 13, 16));
  const buttonPadH = Math.round(clamp(width * 0.045, 14, 22));
  const buttonPadV = Math.round(clamp(height * 0.012, 8, 12));

  return (
    <View style={[styles.root, { gap }]}> 
      <Text style={[styles.title, { fontSize: titleSize }]}>Incidents</Text>
      <Text style={[styles.subtitle, { fontSize: subtitleSize }]}>Security Officer incidents placeholder</Text>

      <Pressable style={[styles.button, { paddingHorizontal: buttonPadH, paddingVertical: buttonPadV }]} onPress={() => router.back()}>
        <Text style={styles.buttonText}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 20,
    backgroundColor: "#F5F7FA",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  title: { fontSize: 24, fontWeight: "700", color: "#0E2D52" },
  subtitle: { fontSize: 15, color: "#4B5563" },
  button: {
    marginTop: 16,
    backgroundColor: "#0E2D52",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  buttonText: { color: "#fff", fontWeight: "700" },
});
