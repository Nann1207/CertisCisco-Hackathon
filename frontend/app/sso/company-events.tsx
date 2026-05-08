import React from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, CalendarDays } from "lucide-react-native";
import Text from "../../components/TranslatedText";

type EventItem = {
  id: string;
  title: string;
  date: string;
  location: string;
  description: string;
};

const EVENTS: EventItem[] = [
  {
    id: "townhall-2026-05",
    title: "Company Townhall",
    date: "May 20, 2026 • 10:00 AM",
    location: "HQ Auditorium",
    description: "Quarterly updates, recognition awards, and Q&A with leadership.",
  },
  {
    id: "training-2026-06",
    title: "Officer Refresher Training",
    date: "June 3, 2026 • 2:00 PM",
    location: "Training Room 2",
    description: "De-escalation basics, incident reporting refresh, and SOP reminders.",
  },
  {
    id: "family-day-2026-07",
    title: "Family Day",
    date: "July 12, 2026 • 9:00 AM",
    location: "East Coast Park",
    description: "Games, food, and team bonding activities. Bring your family!",
  },
];

export default function CompanyEventsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <ChevronLeft size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>Company Events</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {EVENTS.map((event) => (
          <View key={event.id} style={styles.card}>
            <View style={styles.cardTitleRow}>
              <View style={styles.iconWrap}>
                <CalendarDays size={18} color="#0AAFD0" />
              </View>
              <Text style={styles.cardTitle}>{event.title}</Text>
            </View>
            <Text style={styles.cardMeta}>{event.date}</Text>
            <Text style={styles.cardMeta}>{event.location}</Text>
            <Text style={styles.cardBody}>{event.description}</Text>
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
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F3FAFD",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D7EEF5",
    marginRight: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A", flex: 1 },
  cardMeta: { color: "#475569", marginBottom: 2 },
  cardBody: { color: "#334155", marginTop: 6, lineHeight: 20 },
});

