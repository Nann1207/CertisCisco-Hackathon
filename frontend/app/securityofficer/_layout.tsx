import React from "react";
import { View, StyleSheet } from "react-native";
import { Stack, usePathname } from "expo-router";
import BottomBar from "./components/BottomBar";
import FloatingChatButton from "./components/FloatingChatButton";

export default function Layout() {
  const pathname = usePathname();
  const showFloatingChat = pathname !== "/securityofficer/chatbot";

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="home" />
          <Stack.Screen name="reports" />
          <Stack.Screen name="incidents" />
          <Stack.Screen name="schedule" />
          <Stack.Screen name="shift-details" />
          <Stack.Screen name="clock-in" />
          <Stack.Screen name="messagingChannel" />
          <Stack.Screen name="newMessage" />
          <Stack.Screen name="message" />
          <Stack.Screen name="shift-reports" />
          <Stack.Screen name="id-card" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="translate" />
          <Stack.Screen name="languages" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="chatbot" />
          
        </Stack>
      </View>
      {showFloatingChat ? <FloatingChatButton bottomOffset={98} rightOffset={20} /> : null}
      <BottomBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1 },
});
