import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Bell, CalendarDays, ChevronLeft, Clock3, ShieldAlert } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DISPLAY_TIME_ZONE } from "../../lib/notifications";
import Text from "../../components/TranslatedText";
import {
  generateNotifications,
  type NotificationKind,
  type NotificationShift,
  type NotificationAssignment,
  type NotificationItem,
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
  const [assignmentRows, setAssignmentRows] = useState<NotificationAssignment[]>([]);
  const [dismissedMap, setDismissedMap] = useState<Record<string, string>>({});
  const NOTIF_DISMISS_PREFIX = "notifications_dismissed";
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("today");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [localScheduled, setLocalScheduled] = useState<Record<string, any>>({});
  const [localInbox, setLocalInbox] = useState<any[]>([]);
  const [authUserId, setAuthUserId] = useState<string | null>(null);

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
      if (alive) setAuthUserId(userId ?? null);

      if (!userId) {
        if (alive) {
          setErrorText(sessionError?.message ?? "Unable to load user session.");
          setLoading(false);
        }
        return;
      }

      const [shiftsResp, assignmentsResp] = await Promise.all([
        supabase
          .from("shifts")
          .select("shift_id, shift_date, shift_start, shift_end, completion_status, location, clockin_time, clockout_time")
          .eq("officer_id", userId)
          .order("shift_date", { ascending: false })
          .order("shift_start", { ascending: false })
          .limit(120),
        supabase
          .from("incident_assignments")
          .select("assignment_id, incident_id, assigned_at, active_status, incidents(incident_name, location_unit_no, created_at)")
          .eq("officer_id", userId)
          .order("assigned_at", { ascending: false })
          .limit(120),
      ]);

      if (!alive) return;

      const shiftsError = (shiftsResp as any).error;
      const assignmentsError = (assignmentsResp as any).error;

      if (shiftsError) {
        setErrorText(shiftsError.message);
        setLoading(false);
        return;
      }

      if (assignmentsError) {
        // non-fatal; continue with shifts only
        console.warn("Assignments load error:", assignmentsError.message);
      }

      const shiftsRaw = (shiftsResp as any).data ?? [];
      const assignmentsRaw = (assignmentsResp as any).data ?? [];

      const mappedRows: NotificationShift[] = (shiftsRaw as ShiftRow[]).map((shift) => ({
        id: shift.shift_id,
        shift_date: shift.shift_date,
        shift_start: shift.shift_start,
        shift_end: shift.shift_end,
        completion_status: shift.completion_status,
        location: shift.location,
        clockin_time: shift.clockin_time,
        clockout_time: shift.clockout_time,
      }));

      const mappedAssignments: NotificationAssignment[] = (assignmentsRaw as any[]).map((r) => ({
        assignment_id: r.assignment_id,
        incident_id: r.incident_id,
        assigned_at: r.assigned_at,
        active_status: r.active_status,
        incidents: r.incidents ?? null,
      }));

      setShiftRows(mappedRows);
      setAssignmentRows(mappedAssignments);
      // load dismissed map for this user
      if (userId) {
        try {
          const key = `${NOTIF_DISMISS_PREFIX}:${userId}`;
          const [storedDismissed, storedScheduled, storedInbox] = await Promise.all([
            AsyncStorage.getItem(key),
            AsyncStorage.getItem(`scheduled_local_notifications:${userId}`),
            AsyncStorage.getItem(`local_inbox_notifications:${userId}`),
          ]);
          const parsed = storedDismissed ? (JSON.parse(storedDismissed) as Record<string, string>) : {};
          setDismissedMap(parsed);
          setLocalScheduled(storedScheduled ? JSON.parse(storedScheduled) : {});
          setLocalInbox(storedInbox ? JSON.parse(storedInbox) : []);
        } catch (err) {
          console.warn("Failed to load dismissed notifications:", err);
        }
      }
      setLoading(false);
    };

    void loadNotifications();

    return () => {
      alive = false;
    };
  }, []);

  const localEntries = useMemo(() => {
    const nowMs = currentTime.getTime();
    const scheduledItems: NotificationItem[] = Object.entries(localScheduled ?? {})
      .map(([key, value]: any) => {
        const at = Number(value?.at);
        if (!Number.isFinite(at)) return null;
        const isDue = at <= nowMs;
        const isOverdue = at < nowMs;
        const title = (value?.title ?? "Reminder").toString();
        const bodyRaw = (value?.body ?? "").toString();
        const body = isOverdue ? `Overdue: ${bodyRaw}` : bodyRaw;
        return {
          id: `local:${key}`,
          title,
          body,
          timestamp: new Date(at).toLocaleString(),
          kind: isDue ? ("today" as any) : ("upcoming" as any),
          priority: typeof value?.priority === "number" ? value.priority : 0,
          time: typeof value?.time === "number" ? value.time : at,
          dismissedAt: dismissedMap[`local:${key}`] ?? null,
        } satisfies NotificationItem;
      })
      .filter(Boolean) as NotificationItem[];

    const inboxItems: NotificationItem[] = (localInbox ?? [])
      .map((it: any) => {
        const at = Number(it?.at ?? it?.time ?? 0);
        if (!Number.isFinite(at) || at <= 0) return null;
        const id = `local_inbox:${String(it.id ?? at)}`;
        return {
          id,
          title: String(it.title ?? "Notification"),
          body: String(it.body ?? ""),
          timestamp: new Date(at).toLocaleString(),
          kind: (it.kind ?? "today") as any,
          priority: typeof it.priority === "number" ? it.priority : 2,
          time: typeof it.time === "number" ? it.time : at,
          dismissedAt: dismissedMap[id] ?? null,
        } satisfies NotificationItem;
      })
      .filter(Boolean) as NotificationItem[];

    return [...scheduledItems, ...inboxItems];
  }, [currentTime, dismissedMap, localInbox, localScheduled]);

  const entries = useMemo(() => {
    const generated = generateNotifications(shiftRows, null, null, assignmentRows, currentTime, { includePast: true });
    return [...localEntries, ...generated];
  }, [assignmentRows, currentTime, localEntries, shiftRows]);

  const entriesWithDismissed = useMemo(() => {
    return entries.map((e) => ({ ...e, dismissedAt: dismissedMap[e.id] ?? null }));
  }, [entries, dismissedMap]);

  const filteredEntries = useMemo(() => {
    const includeKindsForFilter: Record<NotificationFilter, NotificationKind[]> = {
      today: ["today", "incident", "assignment", "report"],
      upcoming: ["upcoming", "assignment"],
      past: ["past", "report"],
      all: ["today", "incident", "assignment", "report", "upcoming", "past"],
    };

    const kinds = includeKindsForFilter[activeFilter];
    let list: NotificationItem[] = [];

    const todayKey = currentTime.toLocaleDateString("en-CA", { timeZone: DISPLAY_TIME_ZONE });
    const getItemDateKey = (it: NotificationItem) => {
      if (it.time) return new Date(it.time).toLocaleDateString("en-CA", { timeZone: DISPLAY_TIME_ZONE });
      if (typeof it.timestamp === "string" && it.timestamp.toLowerCase().includes("today")) return todayKey;
      try {
        const dt = new Date(it.timestamp);
        if (Number.isFinite(dt.getTime())) return dt.toLocaleDateString("en-CA", { timeZone: DISPLAY_TIME_ZONE });
      } catch (e) {
        // ignore
      }
      return null;
    };

    if (activeFilter === "today") {
      list = entriesWithDismissed.filter((e) => getItemDateKey(e) === todayKey);
    } else {
      list = entriesWithDismissed.filter((e) => kinds.includes(e.kind));
    }

    // De-duplicate by id to avoid duplicate-key rendering errors
    list = Array.from(new Map(list.map((e) => [e.id, e])).values());

    // Order by time (upcoming: soonest first; everything else: most recent first)
    list.sort((a, b) => {
      const ta = a.time ?? 0;
      const tb = b.time ?? 0;
      if (activeFilter === "upcoming") return ta - tb;
      return tb - ta;
    });

    return list;
  }, [activeFilter, currentTime, entriesWithDismissed]);

  const hasEntries = filteredEntries.length > 0;

  const groupedTitle = useMemo(() => {
    if (!hasEntries) return "No notifications yet";
    const currentFilterLabel = FILTER_TABS.find((tab) => tab.key === activeFilter)?.label ?? "All";
    return `${currentFilterLabel} Notifications`;
  }, [activeFilter, hasEntries]);

  const onPressEntry = async (entry: NotificationItem) => {
    if (!authUserId) return;
    const id = entry.id;
    if (!id) return;
    const nowISO = new Date().toISOString();
    const key = `${NOTIF_DISMISS_PREFIX}:${authUserId}`;
    const next = { ...(dismissedMap ?? {}), [id]: nowISO } as Record<string, string>;
    try {
      await AsyncStorage.setItem(key, JSON.stringify(next));
    } catch (err) {
      console.warn("Failed to persist dismissed notification", err);
    }
    setDismissedMap(next);

    if (id.startsWith("local_inbox:payslip:")) {
      const parts = id.split(":");
      const payslipId = parts.length >= 4 ? parts[3] : "";
      if (payslipId) {
        router.push({ pathname: "/securityofficer/payslip-details", params: { id: payslipId } });
      } else {
        router.push("/securityofficer/payslip");
      }
      return;
    }

    if (id.startsWith("local:shift:") || entry.title.toLowerCase().includes("shift") || entry.title.toLowerCase().includes("clock")) {
      router.push({ pathname: "/securityofficer/shift-notification", params: { message: entry.body || "baaa" } });
      return;
    }
  };

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
                <Pressable key={entry.id} style={styles.entryCard} onPress={() => void onPressEntry(entry)}>
                  <View style={styles.entryIconWrap}>{iconForKind(entry.kind)}</View>

                  <View style={styles.entryTextWrap}>
                    <Text style={styles.entryTitle}>{entry.title}</Text>
                    <Text style={styles.entryBody}>{entry.body}</Text>
                    <Text style={styles.entryTime}>{entry.timestamp}</Text>
                  </View>
                </Pressable>
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
