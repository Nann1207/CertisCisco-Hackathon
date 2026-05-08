import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Text from "../../components/TranslatedText";
import { useRouter } from "expo-router";
import { ChevronLeft, CircleAlert, CircleCheckBig, MapPin } from "lucide-react-native";
import { supabase } from "../../lib/supabase";

type IncidentItem = {
  assignment_id: string;
  id: string;
  incident_category: string | null;
  location_name: string | null;
  location_unit_no: string | null;
  location_description: string | null;
  created_at: string | null;
  assigned_at: string | null;
  assignment_active_status: boolean;
  assignment_declined: boolean;
};

type IncidentAssignmentRow = {
  assignment_id: string;
  incident_id: string | null;
  active_status: boolean | null;
  assigned_at: string | null;
  incidents:
    | {
        incident_id: string;
        incident_category: string | null;
        location_name: string | null;
        location_unit_no: string | null;
        location_description: string | null;
        created_at: string | null;
      }
    | {
        incident_id: string;
        incident_category: string | null;
        location_name: string | null;
        location_unit_no: string | null;
        location_description: string | null;
        created_at: string | null;
      }[]
    | null;
};

type ReportRow = {
  incident_id: string | null;
  report_type: string | null;
  created_at: string | null;
};

type RejectedAssignmentRow = {
  assignment_id: string | null;
};

export default function IncidentsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id ?? null;

      if (!userId) {
        if (alive) {
          Alert.alert("Load failed", sessionError?.message ?? "Unable to load user session.");
          setLoading(false);
        }
        return;
      }

      const { data: assignmentData, error: assignedError } = await supabase
        .from("incident_assignments")
        .select(
          "assignment_id, incident_id, active_status, assigned_at, incidents(incident_id, incident_category, location_name, location_unit_no, location_description, created_at)"
        )
        .eq("officer_id", userId)
        .order("assigned_at", { ascending: false })
        .limit(200);

      const { data: reportData, error: reportError } = await supabase
        .from("reports")
        .select("incident_id, report_type, created_at")
        .eq("officer_id", userId)
        .order("created_at", { ascending: false })
        .limit(120);

      if (alive) {
        if (assignedError || reportError) {
          Alert.alert("Load failed", assignedError?.message ?? reportError?.message ?? "Unknown error");
          setIncidents([]);
          setReports([]);
        } else {
          const assignments = (assignmentData as IncidentAssignmentRow[] | null) ?? [];
          const reportRows = (reportData as ReportRow[] | null) ?? [];
          const assignmentIds = assignments.map((row) => row.assignment_id).filter(Boolean);
          let rejectedAssignmentIds = new Set<string>();

          if (assignmentIds.length > 0) {
            const { data: rejectedRows, error: rejectedError } = await supabase
              .from("reject_assignment")
              .select("assignment_id")
              .in("assignment_id", assignmentIds);

            if (rejectedError) {
              console.warn("[securityofficer/incidents] rejected assignments query failed", rejectedError.message);
            } else {
              rejectedAssignmentIds = new Set(
                ((rejectedRows as RejectedAssignmentRow[] | null) ?? [])
                  .map((row) => row.assignment_id)
                  .filter((id): id is string => Boolean(id))
              );
            }
          }

          const assignedIncidents: IncidentItem[] = assignments
            .map((row) => {
              const incident = Array.isArray(row.incidents) ? row.incidents[0] : row.incidents;
              if (!incident?.incident_id) return null;

              return {
                assignment_id: row.assignment_id,
                id: incident.incident_id,
                incident_category: incident.incident_category,
                location_name: incident.location_name,
                location_unit_no: incident.location_unit_no,
                location_description: incident.location_description,
                created_at: incident.created_at,
                assigned_at: row.assigned_at,
                assignment_active_status: Boolean(row.active_status),
                assignment_declined: rejectedAssignmentIds.has(row.assignment_id),
              } satisfies IncidentItem;
            })
            .filter((item): item is IncidentItem => Boolean(item));

          const mergedByAssignment = new Map<string, IncidentItem>();
          for (const item of assignedIncidents) {
            mergedByAssignment.set(item.assignment_id, item);
          }

          setIncidents(Array.from(mergedByAssignment.values()));
          setReports(reportRows);
        }
        setLoading(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, []);

  const latestReportByIncident = useMemo(() => {
    const map = new Map<string, ReportRow>();
    for (const row of reports) {
      if (!row.incident_id) continue;
      if (!map.has(row.incident_id)) {
        map.set(row.incident_id, row);
      }
    }
    return map;
  }, [reports]);

  const currentIncidents = useMemo(() => {
    return incidents
      .filter((incident) => incident.assignment_active_status)
      .sort((a, b) => toMillis(b.assigned_at ?? b.created_at) - toMillis(a.assigned_at ?? a.created_at));
  }, [incidents]);

  const pastIncidents = useMemo(() => {
    return incidents
      .filter((incident) => !incident.assignment_active_status)
      .sort((a, b) => {
        return toMillis(b.assigned_at ?? b.created_at) - toMillis(a.assigned_at ?? a.created_at);
      });
  }, [incidents]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/securityofficer/home")
          }
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
        <ScrollView contentContainerStyle={styles.content}>
          <SectionTitle title="Active Incidents" />
          {currentIncidents.length === 0 ? (
            <EmptyText text="No active incidents assigned to your shift." />
          ) : (
            currentIncidents.map((incident) => (
              <IncidentCard
                key={incident.assignment_id}
                incident={incident}
                tone="active"
                ctaLabel="Open Incident"
                onPress={() => router.push(`/securityofficer/currentIncident?incidentId=${incident.id}`)}
              />
            ))
          )}

          <SectionTitle title="Past Incidents" />
          {pastIncidents.length === 0 ? (
            <EmptyText text="No past incidents resolved or handed over yet." />
          ) : (
            pastIncidents.map((incident) => (
              <IncidentCard
                key={incident.assignment_id}
                incident={incident}
                tone="past"
                statusLabel={getPastIncidentStatus(incident, latestReportByIncident)}
                ctaLabel="View Reports"
                onPress={() => router.push("/securityofficer/reports")}
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
  statusLabel,
  ctaLabel,
  onPress,
}: {
  incident: IncidentItem;
  tone: "active" | "past";
  statusLabel?: string;
  ctaLabel: string;
  onPress: () => void;
}) {
  const isActive = tone === "active";
  const resolvedStatus = (statusLabel ?? (isActive ? "Active" : "Resolved")).toUpperCase();
  const statusStyle = incident.assignment_declined ? styles.badgeDeclined : isActive ? styles.badgeActive : styles.badgePast;

  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={[styles.statusBadge, statusStyle]}>
          {isActive ? (
            <CircleAlert size={14} color="#FFFFFF" />
          ) : (
            <CircleCheckBig size={14} color="#FFFFFF" />
          )}
          <Text style={styles.statusText}>{resolvedStatus}</Text>
        </View>
        <Text style={styles.dateText}>{formatDateTime(incident.assigned_at ?? incident.created_at)}</Text>
      </View>

      <Text style={styles.titleText}>{incident.incident_category?.trim() || "Incident"}</Text>

      <View style={styles.locationRow}>
        <MapPin size={14} color="#6B7280" />
        <Text style={styles.locationText} numberOfLines={2}>
          {buildLocation(incident) || "Location unavailable"}
        </Text>
      </View>

      <Pressable
        style={[styles.ctaBtn, ctaLabel === "Open Incident" ? styles.ctaBtnWide : styles.ctaBtnCompact]}
        accessibilityLabel={`${ctaLabel}: ${buildLocationMeta(incident)}`}
        onPress={onPress}
      >
        <Text style={styles.ctaBtnText}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

function buildLocation(incident: IncidentItem) {
  const locationName = incident.location_name?.trim() ?? "";
  const unit = incident.location_unit_no?.trim() ?? "";
  const desc = incident.location_description?.trim() ?? "";
  return [locationName, unit ? `#${unit}` : "", desc].filter(Boolean).join(" ");
}

function buildLocationMeta(incident: IncidentItem) {
  const unit = incident.location_unit_no?.trim() ?? "";
  const desc = incident.location_description?.trim() ?? "";
  const createdAt = incident.created_at ? new Date(incident.created_at) : null;
  const timestamp = createdAt && Number.isFinite(createdAt.getTime())
    ? createdAt.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "Unknown time";
  return [unit, desc, timestamp].filter(Boolean).join(" • ");
}

function getPastIncidentStatus(incident: IncidentItem, latestReportByIncident: Map<string, ReportRow>) {
  if (incident.assignment_declined) return "Declined";
  return latestReportByIncident.get(incident.id)?.report_type ?? "Completed";
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

function toMillis(iso: string | null | undefined) {
  if (!iso) return 0;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 44,
    paddingBottom: 12,
    backgroundColor: "#0E2D52",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  headerTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    marginLeft: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
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
  badgeDeclined: {
    backgroundColor: "#D97706",
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
    minHeight: 36,
    borderRadius: 999,
    backgroundColor: "#0E2D52",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  ctaBtnWide: {
    alignSelf: "stretch",
  },
  ctaBtnCompact: {
    alignSelf: "flex-end",
    minHeight: 32,
  },
  ctaBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
