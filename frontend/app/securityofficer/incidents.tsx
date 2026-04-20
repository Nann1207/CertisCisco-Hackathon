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
import { ChevronLeft } from "lucide-react-native";
import { supabase } from "../../lib/supabase";

type IncidentItem = {
  assignment_id: string;
  id: string;
  incident_category: string | null;
  location_name?: string | null;
  location_unit_no: string | null;
  location_description: string | null;
  created_at: string | null;
  assigned_at: string | null;
  assignment_active_status: boolean;
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
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sectionTitle}>Current Incidents</Text>
          {currentIncidents.length === 0 ? (
            <Text style={styles.emptyText}>No current incidents assigned to your shift.</Text>
          ) : (
            currentIncidents.map((incident) => (
              <View key={incident.id} style={styles.card}>
                <Text style={styles.cardCategory}>{buildIncidentTitle(incident)}</Text>
                <Text style={styles.cardMeta}>{buildLocation(incident)}</Text>
                <Pressable
                  style={styles.writeReportBtn}
                  onPress={() => router.push(`/securityofficer/currentIncident?incidentId=${incident.id}`)}
                >
                  <Text style={styles.writeReportBtnText}>Open Incident</Text>
                </Pressable>
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>Past Incidents</Text>
          {pastIncidents.length === 0 ? (
            <Text style={styles.emptyText}>No past incidents resolved or handed over yet.</Text>
          ) : (
            pastIncidents.map((incident) => (
              <View key={incident.id} style={styles.card}>
                <Text style={styles.cardCategory}>{buildIncidentTitle(incident)}</Text>
                <Text style={styles.cardMeta}>{buildLocation(incident)}</Text>
                <Text style={styles.statusPill}>
                  {(latestReportByIncident.get(incident.id)?.report_type ?? "Completed").toUpperCase()}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function buildIncidentTitle(incident: IncidentItem) {
  const category = (incident.incident_category ?? "Incident").trim();
  const locationName = (incident.location_name ?? incident.location_description ?? "Unknown Location").trim();
  return `${category} AT ${locationName}`;
}

function buildLocation(incident: IncidentItem) {
  const unit = incident.location_unit_no?.trim() ?? "";
  const desc = incident.location_description?.trim() ?? "";
  const createdAt = incident.created_at ? new Date(incident.created_at) : null;
  const timestamp = createdAt && Number.isFinite(createdAt.getTime())
    ? createdAt.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "Unknown time";
  return [unit, desc, timestamp].filter(Boolean).join(" • ");
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
    paddingHorizontal: 12,
    paddingTop: 40,
    paddingBottom: 12,
    backgroundColor: "#0E2D52",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  headerTitle: {
    fontSize: 27,
    fontWeight: "700",
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 22,
  },
  sectionTitle: {
    marginTop: 10,
    marginBottom: 8,
    fontSize: 17,
    fontWeight: "700",
    color: "#1E2A38",
  },
  emptyText: {
    color: "#5E6A78",
    fontSize: 14,
    marginBottom: 10,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5EAF0",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    marginBottom: 10,
  },
  cardCategory: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0E2D52",
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: 13,
    color: "#566271",
    marginBottom: 8,
  },
  writeReportBtn: {
    height: 36,
    borderRadius: 10,
    backgroundColor: "#0E2D52",
    alignItems: "center",
    justifyContent: "center",
  },
  writeReportBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  statusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
});
