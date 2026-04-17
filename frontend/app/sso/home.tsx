import React from "react";
import { View, StyleSheet, Pressable, useWindowDimensions } from "react-native";
import Text from "../../components/TranslatedText";
import { useRouter } from "expo-router";

export default function Home() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const gap = Math.round(clamp(height * 0.015, 8, 14));
  const titleSize = Math.round(clamp(width * 0.06, 16, 22));
  const buttonPadH = Math.round(clamp(width * 0.045, 14, 22));
  const buttonPadV = Math.round(clamp(height * 0.012, 8, 12));

  return (
    <View style={[styles.root, { gap }]}> 
      <Text style={[styles.title, { fontSize: titleSize }]}>Home (placeholder)</Text>
      <Pressable
        onPress={() => router.replace("/login")}
        style={[styles.btn, { paddingHorizontal: buttonPadH, paddingVertical: buttonPadV }]}
      >
        <Text style={styles.btnText}>Log out (temporary)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  title: { fontSize: 18, fontWeight: "700" },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: "#0E2D52" },
  btnText: { color: "#fff", fontWeight: "700" },
});