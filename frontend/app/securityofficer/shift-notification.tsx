import React from "react";
import { Pressable, SafeAreaView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import Text from "../../components/TranslatedText";

export default function ShiftNotificationScreen() {
  const router = useRouter();
  const { message } = useLocalSearchParams<{ message?: string }>();
  const text = typeof message === "string" && message.trim() ? message : "baaa";

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/securityofficer/home"))}>
          <ChevronLeft size={22} color="#0E2D52" strokeWidth={2.6} />
          <Text style={styles.headerTitle}>Shift Notification</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <Text style={styles.bodyText}>{text}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F7FA" },
  headerRow: { backgroundColor: "#FFFFFF", paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle: { color: "#0E2D52", fontWeight: "900", fontSize: 18 },
  body: { flex: 1, padding: 16 },
  bodyText: { color: "#0F172A", fontWeight: "700", fontSize: 18 },
});
