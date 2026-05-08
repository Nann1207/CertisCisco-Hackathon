import React from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import Text from "../../components/TranslatedText";

export default function PayslipScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <ChevronLeft size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>Payslip</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Recent Payslips</Text>
        <Text style={styles.bodyText}>
          Payslips are not connected yet. This page is currently showing placeholder content.
        </Text>

        {["April 2026", "March 2026", "February 2026"].map((month) => (
          <View key={month} style={styles.card}>
            <Text style={styles.cardTitle}>{month}</Text>
            <Text style={styles.cardMeta}>Net Pay: -</Text>
            <Text style={styles.cardMeta}>Gross Pay: -</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backBtn: { width: 40, height: 40, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: { fontSize: 20, lineHeight: 24, fontWeight: "800", color: "#0F172A" },
  headerSpacer: { width: 40, height: 40 },
  content: { padding: 16, paddingBottom: 28 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A", marginBottom: 8 },
  bodyText: { color: "#334155", lineHeight: 20, marginBottom: 14 },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  cardMeta: { marginTop: 4, color: "#475569" },
});

