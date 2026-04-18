import React from "react";
import { View, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import BottomBar from "./components/BottomBar";
import FloatingChatButton from "./components/FloatingChatButton";
import AssignmentAlertModal from "./components/AssignmentAlertModal";

export default function Layout() {
  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="home" />
          <Stack.Screen name="reports" />
          <Stack.Screen name="report-summary" />
          <Stack.Screen name="createReport" />
          <Stack.Screen name="incidents" />
          <Stack.Screen name="currentIncident" />
          <Stack.Screen name="schedule" />
          <Stack.Screen name="shift-details" />
          <Stack.Screen name="clock-in" />
          <Stack.Screen name="messagingChannel" />
          <Stack.Screen name="newMessage" />
          <Stack.Screen name="message" />
          <Stack.Screen name="shift-reports" />
          <Stack.Screen name="id-card" />
          <Stack.Screen
            name="translate"
            options={{
              presentation: "transparentModal",
              animation: "fade",
              contentStyle: { backgroundColor: "transparent" },
            }}
          />
          <Stack.Screen
            name="languages"
            options={{
              presentation: "transparentModal",
              animation: "fade",
              contentStyle: { backgroundColor: "transparent" },
            }}
          />
          <Stack.Screen name="settings" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="profile" />
          
        </Stack>
      </View>
      <AssignmentAlertModal />
      <FloatingChatButton bottomOffset={98} rightOffset={20} />
      <BottomBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1 },
});
