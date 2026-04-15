import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";

export default function Home() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Home (placeholder)</Text>
      <Pressable onPress={() => router.replace("/login")} style={styles.btn}>
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