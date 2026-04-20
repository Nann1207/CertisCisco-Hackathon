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
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { ChevronLeft, FileText, MapPin, NotebookPen, ShieldCheck } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";

type AssignedIncident = {
  id: string;
  incident_category: string | null;
  location_unit_no: string | null;
  location_description: string | null;
  created_at: string | null;
};

type AssignedIncidentRow = {
  incident_id: string | null;
  active_status: boolean | null;
  assigned_at: string | null;
  incidents:
    | {
        incident_id: string;
        incident_category: string | null;
        location_unit_no: string | null;
        location_description: string | null;
        created_at: string | null;
      }
    | {
        incident_id: string;
        incident_category: string | null;
        location_unit_no: string | null;
        location_description: string | null;
        created_at: string | null;
      }[]
    | null;
};

type PastReport = {
  reportId: string;
  reportType: string;
  incidentCategory: string;
  incidentLocation: string;
  createdAt: string | null;
};

export default function ReportsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assignedIncidents, setAssignedIncidents] = useState<AssignedIncident[]>([]);
  const [pastReports, setPastReports] = useState<PastReport[]>([]);

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

    const { data: activeData, error: activeError } = await supabase
      .from("incident_assignments")
      .select(
        "incident_id, active_status, assigned_at, incidents(incident_id, incident_category, location_unit_no, location_description, created_at)"
      )
      .eq("officer_id", userId)
      .eq("active_status", true)
      .order("assigned_at", { ascending: false })
      .limit(120);

    const { data: reportsData, error: reportsError } = await supabase
      .from("reports")
      .select("*")
      .eq("officer_id", userId)
      .order("created_at", { ascending: false })
      .limit(120);

    if (activeError || reportsError) {
      Alert.alert("Load failed", activeError?.message ?? reportsError?.message ?? "Unknown error");
      setAssignedIncidents([]);
      setPastReports([]);
      if (!isRefresh) setLoading(false);
      if (isRefresh) setRefreshing(false);
      return;
    }

    const mappedIncidents = ((activeData as AssignedIncidentRow[] | null) ?? [])
      .map((row) => {
        const incident = Array.isArray(row.incidents) ? row.incidents[0] : row.incidents;
        if (!incident?.incident_id) return null;
        return {
          id: incident.incident_id,
          incident_category: incident.incident_category,
          location_unit_no: incident.location_unit_no,
          location_description: incident.location_description,
          created_at: incident.created_at,
        } satisfies AssignedIncident;
      })
      .filter((item): item is AssignedIncident => Boolean(item));

    const mappedPastReports = ((reportsData as Record<string, unknown>[] | null) ?? [])
      .map((row) => {
        const parsedReportId = toReportId(row.report_id ?? row.id);
        if (!parsedReportId) return null;

        const reportType = typeof row.report_type === "string" ? row.report_type : "Report";
        const incidentCategory =
          typeof row.incident_category === "string" && row.incident_category.trim()
            ? row.incident_category
            : "Incident";
        const incidentLocation =
          typeof row.incident_location === "string" && row.incident_location.trim()
            ? row.incident_location
            : "Location unavailable";
        const createdAt = typeof row.created_at === "string" ? row.created_at : null;

        return {
          reportId: parsedReportId,
          reportType,
          incidentCategory,
          incidentLocation,
          createdAt,
        } satisfies PastReport;
      })
      .filter((item): item is PastReport => Boolean(item));

    setAssignedIncidents(mappedIncidents);
    setPastReports(mappedPastReports);
    if (!isRefresh) setLoading(false);
    if (isRefresh) setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    React.useCallback(() => {
      void load(true);
    }, [load])
  );

  const totalResolved = useMemo(
    () => pastReports.filter((item) => item.reportType.toLowerCase() === "resolved").length,
    [pastReports]
  );

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/securityofficer/home"))}
        >
          <ChevronLeft size={24} color="#FFFFFF" strokeWidth={2.6} />
        </Pressable>
        <Text style={styles.headerTitle}>Reports</Text>
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
              <Text style={[styles.summaryValue, { color: "#B45309" }]}>{assignedIncidents.length}</Text>
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
              <Text style={[styles.summaryValue, { color: "#1D7A3E" }]}>{totalResolved}</Text>
              <Text style={styles.summaryLabel}>Resolved</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Reports To Be Made</Text>
          {assignedIncidents.length === 0 ? (
            <Text style={styles.emptyText}>No active incidents assigned to you.</Text>
          ) : (
            assignedIncidents.map((incident) => (
              <View key={incident.id} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <View style={[styles.typeBadge, styles.pendingBadge]}>
                    <Text style={styles.typeBadgeText}>REPORT</Text>
                  </View>
                  <Text style={styles.dateText}>{formatDateTime(incident.created_at)}</Text>
                </View>

                <Text style={styles.titleText}>{incident.incident_category?.trim() || "Incident"}</Text>

                <View style={styles.locationRow}>
                  <MapPin size={14} color="#6B7280" />
                  <Text style={styles.locationText} numberOfLines={2}>
                    {formatIncidentLocation(incident)}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Documentation:</Text>
                  <Text style={styles.metaValue}>Active incident needs a report from you.</Text>
                </View>

                <Pressable
                  style={styles.primaryBtn}
                  onPress={() => router.push(`/securityofficer/createReport?incidentId=${incident.id}`)}
                >
                  <Text style={styles.primaryBtnText}>Write Report</Text>
                </Pressable>
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>Past Reports</Text>
          {pastReports.length === 0 ? (
            <Text style={styles.emptyText}>No submitted reports yet.</Text>
          ) : (
            pastReports.map((report) => (
              <Pressable
                key={report.reportId}
                style={styles.card}
                onPress={() => router.push(`/securityofficer/report-summary?reportId=${report.reportId}`)}
              >
                <View style={styles.cardTopRow}>
                  <View style={[styles.typeBadge, getTypeBadgeStyle(report.reportType)]}>
                    <Text style={styles.typeBadgeText}>{report.reportType.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.dateText}>{formatDateTime(report.createdAt)}</Text>
                </View>

                <Text style={styles.titleText}>{report.incidentCategory || "Incident"}</Text>

                <View style={styles.locationRow}>
                  <MapPin size={14} color="#6B7280" />
                  <Text style={styles.locationText} numberOfLines={2}>
                    {report.incidentLocation || "Location unavailable"}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function formatIncidentLocation(incident: AssignedIncident) {
  const unit = incident.location_unit_no?.trim() ?? "";
  const desc = incident.location_description?.trim() ?? "";
  return [unit ? `#${unit}` : "", desc].filter(Boolean).join(" ") || "Location unavailable";
}

function getTypeBadgeStyle(reportType: string | null | undefined) {
  const type = (reportType ?? "").toLowerCase();
  if (type === "resolved") return { backgroundColor: "#1D7A3E" };
  if (type === "handover") return { backgroundColor: "#A65B00" };
  return { backgroundColor: "#334155" };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toReportId(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
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
