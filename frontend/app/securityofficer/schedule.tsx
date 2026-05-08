import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, ActivityIndicator, useWindowDimensions } from "react-native";
import Text from "../../components/TranslatedText";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
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
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toISODate(new Date()));

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const horizontalPadding = Math.round(clamp(width * 0.04, 12, 20));
  const headerTop = Math.round(clamp(height * 0.055, 30, 50));
  const titleSize = Math.round(clamp(width * 0.06, 20, 26));
  const timeSize = Math.round(clamp(width * 0.05, 15, 19));
  const metaSize = Math.round(clamp(width * 0.034, 12, 14));
  const dayCell = Math.round(clamp(width * 0.11, 38, 54));

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

      const monthStart = toISODate(startOfMonth(monthCursor));
      const monthEnd = toISODate(endOfMonth(monthCursor));

      const { data: shiftsRaw, error: shiftsError } = await supabase
        .from("shifts")
        .select("id:shift_id, shift_date, shift_start, shift_end, location, address, supervisor_id")
        .eq("officer_id", userId)
        .gte("shift_date", monthStart)
        .lte("shift_date", monthEnd)
        .order("shift_date", { ascending: true })
        .order("shift_start", { ascending: true });

      if (shiftsError) {
        if (alive) {
          setErrorText("Unable to load shifts.");
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
  }, [monthCursor]);

  useEffect(() => {
    const key = toISODate(monthCursor);
    if (!selectedDate.startsWith(key.slice(0, 7))) {
      setSelectedDate(key);
    }
  }, [monthCursor, selectedDate]);

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, ShiftItem[]>();
    for (const s of shifts) {
      const key = (s.shift_date ?? "").slice(0, 10);
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return map;
  }, [shifts]);

  const selectedShifts = useMemo(() => shiftsByDate.get(selectedDate) ?? [], [selectedDate, shiftsByDate]);
  const calendarCells = useMemo(() => buildCalendarCells(monthCursor), [monthCursor]);
  const monthLabel = useMemo(
    () => monthCursor.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: DISPLAY_TIME_ZONE }),
    [monthCursor]
  );

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
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={24} color="#0E2D52" />
        </Pressable>
        <Text style={[styles.headerTitle, { fontSize: titleSize }]}>Schedule</Text>
      </View>

      <View style={{ paddingHorizontal: horizontalPadding, paddingTop: 14 }}>
        <View style={styles.monthRow}>
          <Pressable
            style={styles.monthNavBtn}
            onPress={() => setMonthCursor((d) => startOfMonth(addMonths(d, -1)))}
          >
            <ChevronLeft size={18} color="#0E2D52" />
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Pressable
            style={styles.monthNavBtn}
            onPress={() => setMonthCursor((d) => startOfMonth(addMonths(d, 1)))}
          >
            <ChevronRight size={18} color="#0E2D52" />
          </Pressable>
        </View>

        <View style={styles.dowRow}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <Text key={d} style={[styles.dowText, { width: dayCell }]}>
              {d}
            </Text>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {calendarCells.map((cell) => {
            const dateKey = cell.dateKey;
            const inMonth = cell.inMonth;
            const day = cell.day;
            const hasShift = shiftsByDate.has(dateKey);
            const isSelected = dateKey === selectedDate;
            return (
              <Pressable
                key={dateKey}
                onPress={() => setSelectedDate(dateKey)}
                style={[
                  styles.dayCell,
                  { width: dayCell, height: dayCell },
                  !inMonth ? styles.dayCellOutMonth : null,
                  isSelected ? styles.dayCellSelected : null,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    !inMonth ? styles.dayTextOutMonth : null,
                    isSelected ? styles.dayTextSelected : null,
                  ]}
                >
                  {day}
                </Text>
                {hasShift ? <View style={styles.shiftDot} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ flex: 1, paddingHorizontal: horizontalPadding, paddingTop: 14 }}>
        <Text style={styles.selectedTitle}>{formatSelectedDate(selectedDate)}</Text>
        <FlatList
          data={selectedShifts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 12, paddingBottom: 28 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>{errorText ?? "No shifts for this day."}</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() =>
                router.push({
                  pathname: "/securityofficer/upcoming-shift-details",
                  params: { shiftData: JSON.stringify(item) },
                })
              }
            >
              <View>
                <Text style={[styles.timeText, { fontSize: timeSize }]}>{formatTimeRange(item.shift_start, item.shift_end)}</Text>
                <Text style={[styles.metaText, { fontSize: metaSize }]}>Location: {item.location ?? "-"}</Text>
              </View>
              <Text style={styles.arrowText}>&gt;</Text>
            </Pressable>
          )}
        />
      </View>
    </View>
  );
}

function formatTimeRange(startISO: string, endISO: string) {
  const opts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  };
  return `${new Date(startISO).toLocaleTimeString([], opts)} - ${new Date(endISO).toLocaleTimeString([], opts)}`;
}

function toISODate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function buildCalendarCells(monthCursor: Date) {
  // week starts on Monday
  const first = startOfMonth(monthCursor);
  const firstDow = (first.getDay() + 6) % 7; // 0=Mon ... 6=Sun
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - firstDow);

  const cells: { dateKey: string; day: number; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push({
      dateKey: toISODate(d),
      day: d.getDate(),
      inMonth: d.getMonth() === monthCursor.getMonth(),
    });
  }
  return cells;
}

function formatSelectedDate(dateKey: string) {
  const d = new Date(dateKey);
  if (!Number.isFinite(d.getTime())) return dateKey;
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: DISPLAY_TIME_ZONE });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F7FA" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 44,
    paddingBottom: 12,
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
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  monthNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9EEF5",
  },
  monthLabel: { color: "#0E2D52", fontWeight: "800", fontSize: 16 },
  dowRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 10,
    paddingHorizontal: 2,
  },
  dowText: { textAlign: "center", color: "#64748B", fontWeight: "800", fontSize: 12 },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingTop: 8,
    paddingBottom: 6,
    justifyContent: "space-between",
  },
  dayCell: {
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    position: "relative",
  },
  dayCellOutMonth: { backgroundColor: "#F8FAFC", borderColor: "#EEF2F7" },
  dayCellSelected: { backgroundColor: "#EEF2FF", borderColor: "#C7D2FE" },
  dayText: { color: "#0F172A", fontWeight: "800", fontSize: 14 },
  dayTextOutMonth: { color: "#94A3B8" },
  dayTextSelected: { color: "#1E3A8A" },
  shiftDot: {
    position: "absolute",
    bottom: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F97316",
  },
  selectedTitle: { color: "#0E2D52", fontWeight: "900", fontSize: 16, marginBottom: 10 },
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
