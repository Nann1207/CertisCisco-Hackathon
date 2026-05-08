import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronLeft, FileText } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";

type ReportStatus = "submitted" | "in_review" | "need_info" | "resolved" | "closed";

type ReportListRow = {
  id: string;
  created_at: string | null;
  report_code: string | null;
  status: ReportStatus | null;
};

const formatStatusLabel = (status: ReportStatus | null) => {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "in_review":
      return "In Review";
    case "need_info":
      return "Need More Info";
    case "resolved":
      return "Resolved";
    case "closed":
      return "Closed";
    default:
      return "Submitted";
  }
};

export default function HarassmentWhistleblowingScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [harassmentReports, setHarassmentReports] = useState<ReportListRow[]>([]);
  const [whistleReports, setWhistleReports] = useState<ReportListRow[]>([]);

  const loadReports = useCallback(async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id ?? null;
    if (!userId) {
      Alert.alert("Load failed", sessionError?.message ?? "Unable to validate your session.");
      setHarassmentReports([]);
      setWhistleReports([]);
      return;
    }

    const { data: harassmentData, error: harassmentError } = await supabase
      .from("harassment_reports")
      .select("id, created_at, report_code, status")
      .eq("reporter_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (harassmentError) {
      Alert.alert("Load failed", harassmentError.message);
      setHarassmentReports([]);
      return;
    }

    setHarassmentReports(((harassmentData as ReportListRow[] | null) ?? []).filter(Boolean));

    const { data: whistleData, error: whistleError } = await supabase
      .from("whistleblowing_reports")
      .select("id, created_at, report_code, status")
      .eq("reporter_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (whistleError) {
      Alert.alert("Load failed", whistleError.message);
      setWhistleReports([]);
      return;
    }

    setWhistleReports(((whistleData as ReportListRow[] | null) ?? []).filter(Boolean));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const run = async () => {
        setLoading(true);
        await loadReports();
        if (alive) setLoading(false);
      };
      void run();
      return () => {
        alive = false;
      };
    }, [loadReports])
  );

  const hasHarassmentReports = useMemo(() => harassmentReports.length > 0, [harassmentReports.length]);
  const hasWhistleReports = useMemo(() => whistleReports.length > 0, [whistleReports.length]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <ChevronLeft size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>Harassment & Whistleblowing</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.bodyText}>
          Use these forms to report workplace harassment or raise concerns confidentially. This is currently static
          placeholder content.
        </Text>

        <Pressable
          style={styles.item}
          onPress={() => router.push("/securityofficer/harassment-report")}
        >
          <View style={styles.iconWrap}>
            <FileText size={20} color="#0AAFD0" />
          </View>
          <View style={styles.itemTextWrap}>
            <Text style={styles.itemTitle}>Harassment Report Form</Text>
            <Text style={styles.itemSubtitle}>Submit details of an incident.</Text>
          </View>
        </Pressable>

        <Pressable
          style={styles.item}
          onPress={() => router.push("/securityofficer/whistleblowing-report")}
        >
          <View style={styles.iconWrap}>
            <FileText size={20} color="#0AAFD0" />
          </View>
          <View style={styles.itemTextWrap}>
            <Text style={styles.itemTitle}>Whistleblowing Form</Text>
            <Text style={styles.itemSubtitle}>Report misconduct or policy breaches.</Text>
          </View>
        </Pressable>

        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>Note</Text>
          <Text style={styles.noteText}>
            If you are in immediate danger, contact emergency services and your supervisor immediately.
          </Text>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>My Harassment Reports</Text>
          <Pressable onPress={() => void loadReports()} hitSlop={10} disabled={loading}>
            {loading ? <ActivityIndicator /> : <Text style={styles.refreshText}>Refresh</Text>}
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator />
          </View>
        ) : hasHarassmentReports ? (
          <View style={styles.reportsWrap}>
            {harassmentReports.map((report) => (
              <Pressable
                key={report.id}
                style={styles.reportRow}
                onPress={() =>
                  router.push({
                    pathname: "/securityofficer/harassment-report-details",
                    params: { id: report.id },
                  } as any)
                }
              >
                <View style={styles.reportLeft}>
                  <Text style={styles.reportTitle}>{report.report_code ?? report.id}</Text>
                  <Text style={styles.reportMeta}>{report.created_at ?? ""}</Text>
                </View>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{formatStatusLabel(report.status)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No reports yet.</Text>
        )}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>My Whistleblowing Reports</Text>
          <Pressable onPress={() => void loadReports()} hitSlop={10} disabled={loading}>
            {loading ? <ActivityIndicator /> : <Text style={styles.refreshText}>Refresh</Text>}
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator />
          </View>
        ) : hasWhistleReports ? (
          <View style={styles.reportsWrap}>
            {whistleReports.map((report) => (
              <Pressable
                key={report.id}
                style={styles.reportRow}
                onPress={() =>
                  router.push({
                    pathname: "/securityofficer/whistleblowing-report-details",
                    params: { id: report.id },
                  } as any)
                }
              >
                <View style={styles.reportLeft}>
                  <Text style={styles.reportTitle}>{report.report_code ?? report.id}</Text>
                  <Text style={styles.reportMeta}>{report.created_at ?? ""}</Text>
                </View>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{formatStatusLabel(report.status)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No reports yet.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backBtn: { width: 40, height: 40, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A", textAlign: "center" },
  headerSpacer: { width: 40, height: 40 },
  content: { padding: 16, paddingBottom: 28 },
  bodyText: { color: "#334155", lineHeight: 20, marginBottom: 14 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F3FAFD",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D7EEF5",
    marginRight: 12,
  },
  itemTextWrap: { flex: 1 },
  itemTitle: { color: "#0F172A", fontWeight: "800" },
  itemSubtitle: { marginTop: 2, color: "#475569" },
  noteBox: {
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    padding: 12,
  },
  noteTitle: { fontWeight: "800", color: "#0F172A", marginBottom: 4 },
  noteText: { color: "#475569", lineHeight: 20 },
  sectionHeaderRow: {
    marginTop: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: "#0F172A", fontWeight: "900", fontSize: 16 },
  refreshText: { color: "#088EAB", fontWeight: "900" },
  loadingRow: { paddingVertical: 14, alignItems: "center" },
  reportsWrap: { gap: 10 },
  reportRow: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reportLeft: { flex: 1, marginRight: 10 },
  reportTitle: { color: "#0F172A", fontWeight: "900" },
  reportMeta: { marginTop: 4, color: "#64748B", fontSize: 12 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F3FAFD",
    borderWidth: 1,
    borderColor: "#D7EEF5",
  },
  statusText: { color: "#088EAB", fontWeight: "900", fontSize: 12 },
  emptyText: { color: "#64748B", marginTop: 4 },
});
