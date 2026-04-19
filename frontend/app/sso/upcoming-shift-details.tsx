import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";

const DISPLAY_TIME_ZONE = "Asia/Singapore";

type ShiftItem = {
  id: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  location: string | null;
  address: string | null;
  supervisor_id: string | null;
  officerCount: number;
};

export default function UpcomingSsoShiftDetailsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<ShiftItem[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
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

      const todayISO = new Date().toISOString().slice(0, 10);

      const { data: shiftsRaw, error: shiftsError } = await supabase
        .from("shifts")
        .select("shift_id, shift_date, shift_start, shift_end, location, address, supervisor_id, officer_id")
        .eq("supervisor_id", userId)
        .gte("shift_date", todayISO)
        .order("shift_date", { ascending: true })
        .order("shift_start", { ascending: true });

      if (shiftsError) {
        if (alive) {
          setErrorText(shiftsError.message);
          setLoading(false);
        }
        return;
      }

      const grouped = new Map<string, ShiftItem>();
      for (const row of (shiftsRaw ?? []) as any[]) {
        const key = [row.shift_date, row.shift_start, row.shift_end, row.location ?? "", row.address ?? ""].join("|");
        const existing = grouped.get(key);
        if (existing) {
          existing.officerCount += 1;
          continue;
        }

        grouped.set(key, {
          id: row.shift_id,
          shift_date: row.shift_date,
          shift_start: row.shift_start,
          shift_end: row.shift_end,
          location: row.location ?? null,
          address: row.address ?? null,
          supervisor_id: row.supervisor_id ?? null,
          officerCount: 1,
        });
      }

      if (!alive) return;
      setShifts(Array.from(grouped.values()));
      setLoading(false);
    };

    void load();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.headerRow}>
        <Pressable
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/sso/home"))}
        >
          <ChevronLeft size={24} color="#0E2D52" />
        </Pressable>
        <Text style={styles.headerTitle}>Upcoming Schedule</Text>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color="#0E2D52" />
        </View>
      ) : (
        <FlatList
          data={shifts}
          keyExtractor={(item) => `${item.id}-${item.shift_date}-${item.shift_start}`}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>{errorText ?? "No upcoming shifts found."}</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() =>
                router.push({
                  pathname: "/sso/shift-details",
                  params: { shiftData: JSON.stringify(item) },
                })
              }
            >
              <View style={styles.cardText}>
                <Text style={styles.dateText}>{formatDate(item.shift_date)}</Text>
                <Text style={styles.timeText}>{formatTimeRange(item.shift_start, item.shift_end)}</Text>
                <Text style={styles.metaText}>Location: {item.location ?? "-"}</Text>
                <Text style={styles.metaText}>Assigned officers: {item.officerCount}</Text>
              </View>
              <Text style={styles.arrowText}>&gt;</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  });
}

function formatTimeRange(startISO: string, endISO: string) {
  const opts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  };
  return `${new Date(startISO).toLocaleTimeString([], opts)} - ${new Date(endISO).toLocaleTimeString([], opts)}`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 46,
    paddingBottom: 10,
    backgroundColor: "#fff",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#E9EEF5",
  },
  headerTitle: {
    marginLeft: 10,
    fontSize: 24,
    fontWeight: "700",
    color: "#0E2D52",
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 28,
  },
  card: {
    borderRadius: 10,
    backgroundColor: "#ECECEC",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardText: {
    flex: 1,
  },
  dateText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4B5563",
  },
  timeText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1F2937",
    marginTop: 4,
  },
  metaText: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 4,
    fontWeight: "600",
  },
  arrowText: {
    fontSize: 28,
    color: "#0E2D52",
    fontWeight: "700",
    marginLeft: 12,
  },
  emptyText: {
    color: "#6B7280",
    fontWeight: "600",
  },
});
