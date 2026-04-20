import React, { useEffect, useMemo, useState } from "react";
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
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronLeft, CircleAlert, CircleCheckBig, MapPin } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";

type IncidentRow = {
  incident_id: string;
  incident_category: string | null;
  location_name: string | null;
  location_unit_no: string | null;
  location_description: string | null;
  created_at: string | null;
  active_status: boolean | null;
};

type ReportRow = {
  incident_id: string | null;
};

export default function SsoIncidentsScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);

  const load = async (isRefresh = false) => {
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

    const { data, error } = await supabase
      .from("incidents")
      .select(
        "incident_id, incident_category, location_name, location_unit_no, location_description, created_at, active_status"
      )
      .eq("supervisor_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      if (!isRefresh) setLoading(false);
      if (isRefresh) setRefreshing(false);
      Alert.alert("Load failed", error.message);
      return;
    }

    const nextIncidents = (data as IncidentRow[] | null) ?? [];
    setIncidents(nextIncidents);

    const incidentIds = nextIncidents.map((item) => item.incident_id).filter(Boolean);

    if (incidentIds.length === 0) {
      setReports([]);
      if (!isRefresh) setLoading(false);
      if (isRefresh) setRefreshing(false);
      return;
    }

    const { data: reportRows, error: reportError } = await supabase
      .from("reports")
      .select("incident_id")
      .in("incident_id", incidentIds)
      .order("created_at", { ascending: false })
      .limit(500);

    if (reportError) {
      if (!isRefresh) setLoading(false);
      if (isRefresh) setRefreshing(false);
      Alert.alert("Load failed", reportError.message);
      return;
    }

    setReports((reportRows as ReportRow[] | null) ?? []);
    if (!isRefresh) setLoading(false);
    if (isRefresh) setRefreshing(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      void load();
      return () => {};
    }, [])
  );

  const reportedIncidentIds = useMemo(
    () => new Set(reports.map((report) => report.incident_id).filter((id): id is string => Boolean(id))),
    [reports]
  );

  const activeIncidents = useMemo(
    () =>
      incidents.filter(
        (incident) => Boolean(incident.active_status) && !reportedIncidentIds.has(incident.incident_id)
      ),
    [incidents, reportedIncidentIds]
  );

  const postShiftOngoingIncidents = useMemo(
    () =>
      incidents.filter(
        (incident) => Boolean(incident.active_status) && reportedIncidentIds.has(incident.incident_id)
      ),
    [incidents, reportedIncidentIds]
  );

  const pastIncidents = useMemo(
    () => incidents.filter((incident) => !incident.active_status),
    [incidents]
  );

  const onOpenActiveIncident = async (incidentId: string) => {
    const { data: assignmentRows, error } = await supabase
      .from("incident_assignments")
      .select("assignment_id")
      .eq("incident_id", incidentId)
      .eq("active_status", true)
      .limit(1);

    if (error) {
      Alert.alert("Open failed", error.message);
      return;
    }

    const hasAssignment = (assignmentRows?.length ?? 0) > 0;
    if (hasAssignment) {
      router.push(`/sso/incident-after-assign?incidentId=${incidentId}`);
      return;
    }

    router.push(`/sso/incident-before-assign?incidentId=${incidentId}`);
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/sso/home"))}
        >
          <ChevronLeft size={24} color="#FFFFFF" strokeWidth={2.6} />
        </Pressable>
        <Text style={styles.headerTitle}>Incidents</Text>
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
          <SectionTitle title="Active Incidents" />
          {activeIncidents.length === 0 ? (
            <EmptyText text="No active incidents." />
          ) : (
            activeIncidents.map((incident) => (
              <IncidentCard
                key={incident.incident_id}
                incident={incident}
                tone="active"
                ctaLabel="Open Incident"
                onPress={() => {
                  void onOpenActiveIncident(incident.incident_id);
                }}
              />
            ))
          )}

          <SectionTitle title="Post Shift - Ongoing" />
          {postShiftOngoingIncidents.length === 0 ? (
            <EmptyText text="No post-shift ongoing incidents." />
          ) : (
            postShiftOngoingIncidents.map((incident) => (
              <IncidentCard
                key={`post-shift-${incident.incident_id}`}
                incident={incident}
                tone="active"
                ctaLabel="View Reports"
                onPress={() => router.push("/sso/reports")}
              />
            ))
          )}

          <SectionTitle title="Past Incidents" />
          {pastIncidents.length === 0 ? (
            <EmptyText text="No past incidents." />
          ) : (
            pastIncidents.map((incident) => (
              <IncidentCard
                key={incident.incident_id}
                incident={incident}
                tone="past"
                ctaLabel="View Reports"
                onPress={() => router.push("/sso/reports")}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function EmptyText({ text }: { text: string }) {
  return <Text style={styles.emptyText}>{text}</Text>;
}

function IncidentCard({
  incident,
  tone,
  ctaLabel,
  onPress,
}: {
  incident: IncidentRow;
  tone: "active" | "past";
  ctaLabel: string;
  onPress: () => void;
}) {
  const location = [
    incident.location_name?.trim() ?? "",
    incident.location_unit_no?.trim() ? `#${incident.location_unit_no?.trim()}` : "",
    incident.location_description?.trim() ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={[styles.statusBadge, tone === "active" ? styles.badgeActive : styles.badgePast]}>
          {tone === "active" ? (
            <CircleAlert size={14} color="#FFFFFF" />
          ) : (
            <CircleCheckBig size={14} color="#FFFFFF" />
          )}
          <Text style={styles.statusText}>{tone === "active" ? "ACTIVE" : "RESOLVED"}</Text>
        </View>
        <Text style={styles.dateText}>{formatDateTime(incident.created_at)}</Text>
      </View>

      <Text style={styles.titleText}>{incident.incident_category?.trim() || "Incident"}</Text>

      <View style={styles.locationRow}>
        <MapPin size={14} color="#6B7280" />
        <Text style={styles.locationText} numberOfLines={2}>{location || "Location unavailable"}</Text>
      </View>

      <Pressable style={styles.ctaBtn} onPress={onPress}>
        <Text style={styles.ctaBtnText}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

function formatDateTime(value: string | null) {
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
  sectionTitle: {
    marginTop: 4,
    color: "#163A67",
    fontSize: 22,
    fontWeight: "800",
  },
  emptyText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
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
  statusBadge: {
    minHeight: 24,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 6,
  },
  badgeActive: {
    backgroundColor: "#B91C1C",
  },
  badgePast: {
    backgroundColor: "#1D7A3E",
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
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
    marginTop: 7,
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
  ctaBtn: {
    marginTop: 12,
    alignSelf: "flex-end",
    minHeight: 32,
    borderRadius: 999,
    backgroundColor: "#0E2D52",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  ctaBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
