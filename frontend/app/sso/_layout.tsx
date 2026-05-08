import React from "react";
import { KeyboardAvoidingView, Platform, View, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import BottomBar from "./components/BottomBar";
import FloatingChatButton from "../securityofficer/components/FloatingChatButton";
import BackupRequestAlertModal from "./components/BackupRequestAlertModal";

export default function Layout() {
  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="home" />
          <Stack.Screen name="reports" />
          <Stack.Screen name="incidents" />
          <Stack.Screen name="incident-before-assign" />
          <Stack.Screen name="assign-officer" />
          <Stack.Screen name="incident-after-assign" />
          <Stack.Screen name="add-backup" />
          <Stack.Screen name="createReport" />
          <Stack.Screen name="upcoming-shift-details" />
          <Stack.Screen name="shift-details" />
          <Stack.Screen name="clock-in" />
          <Stack.Screen name="id-card" />
          <Stack.Screen
            name="translate"
            options={{
              presentation: "transparentModal",
              animation: "fade",
              contentStyle: { backgroundColor: "transparent" },
            }}
          />
          <Stack.Screen name="languages" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="messagingChannel" />
          <Stack.Screen name="message" />
        <Stack.Screen name="phonecalls" />
        <Stack.Screen name="sop" />
        <Stack.Screen name="chatbot" />
      </Stack>
      </KeyboardAvoidingView>

      <FloatingChatButton bottomOffset={98} rightOffset={20} targetHref="/sso/chatbot" />
      <BackupRequestAlertModal />
      <BottomBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1 },
});
