import React from "react";
import { View, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import BottomBar from "./components/BottomBar";

export default function Layout() {
  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="home" />
          <Stack.Screen name="dashboard" />
          <Stack.Screen name="reports" />
          <Stack.Screen name="incidents" />
          
        </Stack>
      </View>

      <BottomBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1 },
});