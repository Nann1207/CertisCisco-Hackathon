import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Bell, CalendarDays, ChevronLeft, Clock3, ShieldAlert } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import Text from "../../components/TranslatedText";
import {
  generateShiftNotifications,
  type NotificationKind,
  type NotificationShift,
} from "../../lib/notifications";

type ShiftRow = {
  shift_id: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  completion_status: boolean | null;
  location: string | null;
  clockin_time: string | null;
  clockout_time: string | null;
};

type NotificationFilter = "today" | "upcoming" | "past" | "all";

const FILTER_TABS: { key: NotificationFilter; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "all", label: "All" },
];

export default function NotificationsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [shiftRows, setShiftRows] = useState<NotificationShift[]>([]);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("today");
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60 * 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;

    const loadNotifications = async () => {
      setLoading(true);
      setErrorText(null);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      if (!userId) {
        if (alive) {
          setErrorText(sessionError?.message ?? "Unable to load user session.");
          setLoading(false);
        }
        return;
      }

      const { data: shiftsRaw, error: shiftsError } = await supabase
        .from("shifts")
        .select("shift_id, shift_date, shift_start, shift_end, completion_status, location, clockin_time, clockout_time")
        .eq("officer_id", userId)
        .order("shift_date", { ascending: false })
        .order("shift_start", { ascending: false })
        .limit(120);

      if (!alive) return;

      if (shiftsError) {
        setErrorText(shiftsError.message);
        setLoading(false);
        return;
      }

      const mappedRows: NotificationShift[] = ((shiftsRaw ?? []) as ShiftRow[]).map((shift) => ({
        id: shift.shift_id,
        shift_date: shift.shift_date,
        shift_start: shift.shift_start,
        shift_end: shift.shift_end,
        completion_status: shift.completion_status,
        location: shift.location,
        clockin_time: shift.clockin_time,
        clockout_time: shift.clockout_time,
      }));

      setShiftRows(mappedRows);
      setLoading(false);
    };

    void loadNotifications();

    return () => {
      alive = false;
    };
  }, []);

  const entries = useMemo(() => {
    return generateShiftNotifications(shiftRows, currentTime, { includePast: true });
  }, [currentTime, shiftRows]);

  const filteredEntries = useMemo(() => {
    if (activeFilter === "all") return entries;
    if (activeFilter === "today") {
      return entries.filter((entry) => entry.kind === "today" || entry.kind === "incident");
    }
    return entries.filter((entry) => entry.kind === activeFilter);
  }, [activeFilter, entries]);

  const hasEntries = filteredEntries.length > 0;

  const groupedTitle = useMemo(() => {
    if (!hasEntries) return "No notifications yet";
    const currentFilterLabel = FILTER_TABS.find((tab) => tab.key === activeFilter)?.label ?? "All";
    return `${currentFilterLabel} Notifications`;
  }, [activeFilter, hasEntries]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/securityofficer/home")
          }
        >
          <ChevronLeft size={22} color="#FFFFFF" strokeWidth={2.6} />
          <Text style={styles.headerTitle}>Notifications</Text>
        </Pressable>
      </View>

      <View style={styles.contentWrap}>
        <Text style={styles.sectionTitle}>{groupedTitle}</Text>

        <View style={styles.tabsRow}>
          {FILTER_TABS.map((tab) => {
            const active = tab.key === activeFilter;
            return (
              <Pressable
                key={tab.key}
                style={[styles.tabChip, active ? styles.tabChipActive : null]}
                onPress={() => setActiveFilter(tab.key)}
              >
                <Text style={[styles.tabChipText, active ? styles.tabChipTextActive : null]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator color="#0E2D52" />
          </View>
        ) : errorText ? (
          <View style={styles.stateWrap}>
            <Text style={styles.errorText}>{errorText}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.listWrap}>
            {!hasEntries ? (
              <View style={styles.emptyCard}>
                <Bell size={18} color="#64748B" />
                <Text style={styles.emptyText}>No notifications to show.</Text>
              </View>
            ) : (
              filteredEntries.map((entry) => (
                <View key={entry.id} style={styles.entryCard}>
                  <View style={styles.entryIconWrap}>{iconForKind(entry.kind)}</View>

                  <View style={styles.entryTextWrap}>
                    <Text style={styles.entryTitle}>{entry.title}</Text>
                    <Text style={styles.entryBody}>{entry.body}</Text>
                    <Text style={styles.entryTime}>{entry.timestamp}</Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

function iconForKind(kind: NotificationKind) {
  switch (kind) {
    case "upcoming":
      return <CalendarDays size={18} color="#0EA5E9" strokeWidth={2.2} />;
    case "today":
      return <Clock3 size={18} color="#F97316" strokeWidth={2.2} />;
    case "incident":
      return <ShieldAlert size={18} color="#DC2626" strokeWidth={2.2} />;
    default:
      return <Bell size={18} color="#475569" strokeWidth={2.2} />;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },
  header: {
    backgroundColor: "#0E2D52",
    paddingHorizontal: 16,
    paddingTop: 45,
    paddingBottom: 14,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },
  contentWrap: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  sectionTitle: {
    color: "#0F172A",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 10,
  },
  tabsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  tabChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  tabChipActive: {
    borderColor: "#0E2D52",
    backgroundColor: "#0E2D52",
  },
  tabChipText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },
  tabChipTextActive: {
    color: "#FFFFFF",
  },
  stateWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  listWrap: {
    gap: 10,
    paddingBottom: 22,
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  emptyText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "600",
  },
  entryCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D5DEE8",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  entryIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginTop: 2,
  },
  entryTextWrap: {
    flex: 1,
  },
  entryTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800",
  },
  entryBody: {
    marginTop: 4,
    color: "#334155",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  entryTime: {
    marginTop: 6,
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
  },
});
