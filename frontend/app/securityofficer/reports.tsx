import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

export default function ReportsScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Reports</Text>
      <Text style={styles.subtitle}>Security Officer reports placeholder</Text>

      <Pressable style={styles.button} onPress={() => router.back()}>
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
