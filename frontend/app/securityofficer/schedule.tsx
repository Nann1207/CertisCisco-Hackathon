import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, ActivityIndicator, useWindowDimensions } from "react-native";
import Text from "../../components/TranslatedText";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
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
  supervisor: {
    first_name: string;
    last_name: string;
  } | null;
};

export default function UpcomingScheduleScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<ShiftItem[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const horizontalPadding = Math.round(clamp(width * 0.04, 12, 20));
  const headerTop = Math.round(clamp(height * 0.055, 30, 50));
  const titleSize = Math.round(clamp(width * 0.06, 20, 26));
  const dateSize = Math.round(clamp(width * 0.043, 14, 17));
  const timeSize = Math.round(clamp(width * 0.05, 15, 19));
  const metaSize = Math.round(clamp(width * 0.034, 12, 14));

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setErrorText(null);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      if (sessionError || !userId) {
        if (alive) {
          setErrorText("Unable to load user session.");
          setLoading(false);
        }
        return;
      }

      const now = new Date();
      const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
        now.getDate()
      ).padStart(2, "0")}`;

      const { data: shiftsRaw, error: shiftsError } = await supabase
        .from("shifts")
        .select("id:shift_id, shift_date, shift_start, shift_end, location, address, supervisor_id")
        .eq("officer_id", userId)
        .gte("shift_date", todayISO)
        .order("shift_date", { ascending: true })
        .order("shift_start", { ascending: true });

      if (shiftsError) {
        if (alive) {
          setErrorText("Unable to load upcoming shifts.");
          setLoading(false);
        }
        return;
      }

      const mapped: ShiftItem[] = (shiftsRaw ?? []).map((item: any) => ({
        id: item.id,
        shift_date: item.shift_date,
        shift_start: item.shift_start,
        shift_end: item.shift_end,
        location: item.location ?? null,
        address: item.address ?? null,
        supervisor_id: item.supervisor_id ?? null,
        supervisor: null,
      }));

      if (!alive) return;

      setShifts(mapped);
      setLoading(false);
    };

    load();

    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.headerRow, { paddingHorizontal: horizontalPadding, paddingTop: headerTop }]}> 
        <Pressable
          style={styles.backButton}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/securityofficer/home")
          }
        >
          <ChevronLeft size={24} color="#0E2D52" />
        </Pressable>
        <Text style={[styles.headerTitle, { fontSize: titleSize }]}>Upcoming Schedule</Text>
      </View>

      <FlatList
        data={shifts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: horizontalPadding, gap: 12, paddingBottom: 28 }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>{errorText ?? "No upcoming shifts found."}</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: "/securityofficer/shift-details",
                params: { shiftData: JSON.stringify(item) },
              })
            }
          >
            <View>
              <Text style={[styles.dateText, { fontSize: dateSize }]}>{formatDate(item.shift_date)}</Text>
              <Text style={[styles.timeText, { fontSize: timeSize }]}>{formatTimeRange(item.shift_start, item.shift_end)}</Text>
              <Text style={[styles.metaText, { fontSize: metaSize }]}>Location: {item.location ?? "-"}</Text>
            </View>
            <Text style={styles.arrowText}>&gt;</Text>
          </Pressable>
        )}
      />
    </View>
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
  root: { flex: 1, backgroundColor: "#F5F7FA" },
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
  headerTitle: { marginLeft: 10, fontSize: 24, fontWeight: "700", color: "#0E2D52" },
  card: {
    borderRadius: 10,
    backgroundColor: "#ECECEC",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateText: { fontSize: 16, fontWeight: "700", color: "#4B5563" },
  timeText: { fontSize: 18, fontWeight: "800", color: "#1F2937", marginTop: 4 },
  metaText: { fontSize: 13, color: "#6B7280", marginTop: 4, fontWeight: "600" },
  arrowText: { fontSize: 28, color: "#0E2D52", fontWeight: "700", marginLeft: 12 },
  emptyText: { color: "#6B7280", fontWeight: "600" },
});
