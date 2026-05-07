import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { ChevronLeft, FileText, MapPin, NotebookPen, ShieldCheck } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";

const DISPLAY_TIME_ZONE = "Asia/Singapore";

type ShiftRow = {
  shift_id: string;
  shift_date: string;
  shift_start: string | null;
  shift_end: string | null;
  clockin_time: string | null;
  clockout_time: string | null;
  shift_description: string | null;
  location: string | null;
  address: string | null;
};

type ShiftReportCard = {
  id: string;
  shift_date: string;
  shift_start: string | null;
  shift_end: string | null;
  clockout_time: string | null;
  shift_description: string | null;
  location: string | null;
  address: string | null;
};

export default function AllShiftReportsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shiftRows, setShiftRows] = useState<ShiftReportCard[]>([]);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    if (isRefresh) setRefreshing(true);

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id ?? null;

    if (!userId) {
      if (!isRefresh) setLoading(false);
      if (isRefresh) setRefreshing(false);
      Alert.alert("Load failed", sessionError?.message ?? "Unable to load user session.");
      return;
    }

    const { data: rows, error } = await supabase
      .from("shifts")
      .select("shift_id, shift_date, shift_start, shift_end, clockin_time, clockout_time, shift_description, location, address")
      .eq("officer_id", userId)
      .order("shift_date", { ascending: false })
      .order("shift_start", { ascending: false })
      .limit(300);

    if (error) {
      Alert.alert("Load failed", error.message);
      setShiftRows([]);
      if (!isRefresh) setLoading(false);
      if (isRefresh) setRefreshing(false);
      return;
    }

    const mapped = ((rows as ShiftRow[] | null) ?? []).map((row) => ({
      id: row.shift_id,
      shift_date: row.shift_date,
      shift_start: row.shift_start,
      shift_end: row.shift_end,
      clockout_time: row.clockout_time,
      shift_description: row.shift_description,
      location: row.location,
      address: row.address,
    }));

    setShiftRows(mapped);
    if (!isRefresh) setLoading(false);
    if (isRefresh) setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load])
  );

  const pendingReports = useMemo(
    () =>
      shiftRows.filter(
        (row) => row.clockout_time && !(row.shift_description ?? "").trim()
      ),
    [shiftRows]
  );

  const pastReports = useMemo(
    () => shiftRows.filter((row) => (row.shift_description ?? "").trim()),
    [shiftRows]
  );

  const totalSubmitted = pastReports.length;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/sso/reports"))}
        >
          <ChevronLeft size={24} color="#FFFFFF" strokeWidth={2.6} />
        </Pressable>
        <Text style={styles.headerTitle}>Shift Reports</Text>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color="#0E2D52" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          <View style={styles.summaryCard}>
            <View style={styles.summaryItem}>
              <NotebookPen size={18} color="#B45309" />
              <Text style={[styles.summaryValue, { color: "#B45309" }]}>{pendingReports.length}</Text>
              <Text style={styles.summaryLabel}>To Be Made</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <FileText size={18} color="#0E2D52" />
              <Text style={styles.summaryValue}>{pastReports.length}</Text>
              <Text style={styles.summaryLabel}>Past Reports</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <ShieldCheck size={18} color="#1D7A3E" />
              <Text style={[styles.summaryValue, { color: "#1D7A3E" }]}>{totalSubmitted}</Text>
              <Text style={styles.summaryLabel}>Submitted</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Reports To Be Made</Text>
          {pendingReports.length === 0 ? (
            <Text style={styles.emptyText}>No pending shift reports.</Text>
          ) : (
            pendingReports.map((shift) => (
              <View key={`pending-${shift.id}`} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <View style={[styles.typeBadge, styles.pendingBadge]}>
                    <Text style={styles.typeBadgeText}>REPORT</Text>
                  </View>
                  <Text style={styles.dateText}>{formatDate(shift.shift_date)}</Text>
                </View>

                <Text style={styles.titleText}>Shift Report</Text>

                <View style={styles.locationRow}>
                  <MapPin size={14} color="#6B7280" />
                  <Text style={styles.locationText} numberOfLines={2}>
                    {formatLocation(shift)}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Shift Time:</Text>
                  <Text style={styles.metaValue}>{formatShiftTime(shift)}</Text>
                </View>

                <Pressable
                  style={styles.primaryBtn}
                  onPress={() => router.push(`/sso/shift-report?shiftId=${shift.id}`)}
                >
                  <Text style={styles.primaryBtnText}>Write Report</Text>
                </Pressable>
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>Past Reports</Text>
          {pastReports.length === 0 ? (
            <Text style={styles.emptyText}>No submitted shift reports yet.</Text>
          ) : (
            pastReports.map((shift) => (
              <View key={`past-${shift.id}`} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <View style={[styles.typeBadge, styles.doneBadge]}>
                    <Text style={styles.typeBadgeText}>SUBMITTED</Text>
                  </View>
                  <Text style={styles.dateText}>{formatDate(shift.shift_date)}</Text>
                </View>

                <Text style={styles.titleText}>Shift Report</Text>

                <View style={styles.locationRow}>
                  <MapPin size={14} color="#6B7280" />
                  <Text style={styles.locationText} numberOfLines={2}>
                    {formatLocation(shift)}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Shift Time:</Text>
                  <Text style={styles.metaValue}>{formatShiftTime(shift)}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  });
}

function formatShiftTime(shift: ShiftReportCard) {
  const start = shift.shift_start ? formatClockTime(shift.shift_start) : "--:--";
  const end = shift.shift_end ? formatClockTime(shift.shift_end) : "--:--";
  return `${start} - ${end}`;
}

function formatClockTime(iso: string | null | undefined) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: DISPLAY_TIME_ZONE,
  });
}

function formatLocation(shift: ShiftReportCard) {
  return [shift.location?.trim() ?? "", shift.address?.trim() ?? ""]
    .filter(Boolean)
    .join(" ") || "Location unavailable";
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F4F7FB",
  },
  header: {
    paddingHorizontal: 12,
    paddingTop: 40,
    paddingBottom: 12,
    backgroundColor: "#0E2D52",
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: "#FFFFFF",
    marginLeft: 10,
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    minHeight: 88,
  },
  summaryItem: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minWidth: 120,
  },
  summaryDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#E2E8F0",
  },
  summaryValue: {
    color: "#0E2D52",
    fontSize: 24,
    fontWeight: "900",
  },
  summaryLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
  },
  emptyText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
  sectionTitle: {
    marginTop: 6,
    color: "#163A67",
    fontSize: 22,
    fontWeight: "800",
  },
  card: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  typeBadge: {
    minHeight: 24,
    borderRadius: 999,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  typeBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  pendingBadge: {
    backgroundColor: "#B45309",
  },
  doneBadge: {
    backgroundColor: "#1D7A3E",
  },
  dateText: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "600",
  },
  titleText: {
    marginTop: 10,
    color: "#0F172A",
    fontSize: 22,
    fontWeight: "800",
  },
  locationRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  locationText: {
    color: "#4B5563",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 6,
  },
  metaLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
  },
  metaValue: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  primaryBtn: {
    marginTop: 12,
    alignSelf: "flex-end",
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: "#0E2D52",
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
