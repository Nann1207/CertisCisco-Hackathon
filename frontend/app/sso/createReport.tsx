import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronDown, ChevronLeft } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";

type ReportType = "Handover" | "Resolved";

type IncidentRow = {
  id: string;
  incident_category: string | null;
  location_unit_no: string | null;
  location_description: string | null;
  created_at: string | null;
};

type EmployeeName = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

const INCIDENT_CATEGORIES = [
  "Fire & Evacuation",
  "Robbery",
  "Violence",
  "Lift Alarm",
  "Medical",
  "Bomb Threat",
  "Suspicious Item/Vehicle",
  "Suspicious Person",
] as const;

export default function SsoCreateReportScreen() {
  const router = useRouter();
  const { incidentId, reportType: routeReportType } = useLocalSearchParams<{ incidentId?: string; reportType?: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [reportType, setReportType] = useState<ReportType>(
    routeReportType === "Handover" ? "Handover" : "Resolved"
  );
  const [showSubmitSuccessModal, setShowSubmitSuccessModal] = useState(false);

  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(INCIDENT_CATEGORIES[0]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  const [dutyOfficerName, setDutyOfficerName] = useState("-");
  const [securitySupervisorName, setSecuritySupervisorName] = useState("-");

  const [incidentDescription, setIncidentDescription] = useState("");
  const [handoverInstructions, setHandoverInstructions] = useState("");

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 30 * 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (routeReportType === "Resolved") {
      setReportType("Resolved");
    } else if (routeReportType === "Handover") {
      setReportType("Handover");
    }
  }, [routeReportType]);

  useEffect(() => {
    if (reportType === "Resolved" && handoverInstructions) {
      setHandoverInstructions("");
    }
  }, [handoverInstructions, reportType]);

  useEffect(() => {
    let alive = true;

    const loadData = async () => {
      setLoading(true);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id ?? null;

      if (!userId) {
        if (alive) {
          setLoading(false);
          Alert.alert("Load failed", sessionError?.message ?? "Unable to load user session.");
        }
        return;
      }

      const { data: self } = await supabase
        .from("employees")
        .select("id, first_name, last_name")
        .eq("id", userId)
        .maybeSingle<EmployeeName>();

      if (alive) {
        const myName = `${(self?.first_name ?? "").trim()} ${(self?.last_name ?? "").trim()}`.trim();
        setDutyOfficerName(myName || "-");
      }

      const { data: supervisor } = await supabase
        .from("employees")
        .select("id, first_name, last_name")
        .eq("role", "Security Supervisor")
        .order("first_name", { ascending: true })
        .limit(1)
        .maybeSingle<EmployeeName>();

      if (alive) {
        const supervisorName = `${(supervisor?.first_name ?? "").trim()} ${(supervisor?.last_name ?? "").trim()}`.trim();
        setSecuritySupervisorName(supervisorName || "-");
      }

      const { data: incidentRows, error: incidentsError } = await supabase
        .from("incidents")
        .select("id:incident_id, incident_category, location_unit_no, location_description, created_at")
        .eq("supervisor_id", userId)
        .order("created_at", { ascending: false })
        .limit(120);

      if (incidentsError) {
        if (alive) {
          setLoading(false);
          Alert.alert("Load failed", incidentsError.message);
        }
        return;
      }

      const list = (incidentRows as IncidentRow[] | null) ?? [];
      if (alive) {
        setIncidents(list);
        if (incidentId) {
          const selectedById = list.find((item) => item.id === incidentId);
          if (selectedById?.incident_category) {
            setSelectedCategory(selectedById.incident_category);
          }
        }
        setLoading(false);
      }
    };

    void loadData();

    return () => {
      alive = false;
    };
  }, [incidentId]);

  const selectedIncident = useMemo(() => {
    if (incidentId) {
      const byId = incidents.find((incident) => incident.id === incidentId);
      if (byId) return byId;
    }

    if (selectedCategory) {
      const byCategory = incidents.find((incident) => (incident.incident_category ?? "") === selectedCategory);
      if (byCategory) return byCategory;
    }

    return incidents[0] ?? null;
  }, [incidents, incidentId, selectedCategory]);

  const locationText = useMemo(() => {
    if (!selectedIncident) return "-";
    const unit = selectedIncident.location_unit_no?.trim() ?? "";
    const desc = selectedIncident.location_description?.trim() ?? "";
    return [unit, desc].filter(Boolean).join(" ") || "-";
  }, [selectedIncident]);

  const createdAtDate = selectedIncident?.created_at ? new Date(selectedIncident.created_at) : null;
  const incidentDateText = createdAtDate ? formatDate(createdAtDate) : "-";
  const startTimeText = createdAtDate ? formatTime(createdAtDate) : "-";
  const nowTimeText = formatTime(now);

  const onSubmit = async () => {
    if (saving) return;

    const descriptionValue = incidentDescription.trim();
    const instructionsValue = handoverInstructions.trim();

    if (!selectedIncident) {
      Alert.alert("Submit failed", "No incident found to create report from.");
      return;
    }
    if (!descriptionValue) {
      Alert.alert("Submit failed", "Incident description is required.");
      return;
    }
    if (reportType === "Handover" && !instructionsValue) {
      Alert.alert("Submit failed", "Handover instructions are required.");
      return;
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const authUserId = sessionData.session?.user.id ?? null;
    if (!authUserId) {
      Alert.alert("Submit failed", sessionError?.message ?? "Unable to validate your session.");
      return;
    }

    setSaving(true);

    const nowIso = new Date().toISOString();
    const startIso = selectedIncident.created_at ?? nowIso;

    const payload = {
      report_type: reportType,
      incident_id: selectedIncident.id,
      officer_id: authUserId,
      incident_category: selectedCategory,
      incident_location: locationText,
      incident_date: selectedIncident.created_at,
      start_time: startIso,
      handover_time: reportType === "Handover" ? nowIso : null,
      resolved_time: reportType === "Resolved" ? nowIso : null,
      duty_officer_name: dutyOfficerName,
      incident_description: descriptionValue,
      handover_instructions: reportType === "Handover" ? instructionsValue : null,
      supervisor_incharge_name: securitySupervisorName,
    };

    const { error } = await supabase.from("reports").insert(payload);

    if (error) {
      setSaving(false);
      Alert.alert("Submit failed", error.message);
      return;
    }

    await supabase
      .from("incidents")
      .update({ active_status: false })
      .eq("incident_id", selectedIncident.id);

    await supabase
      .from("incident_assignments")
      .update({ active_status: false })
      .eq("incident_id", selectedIncident.id)
      .eq("active_status", true);

    setSaving(false);
    setShowSubmitSuccessModal(true);
  };

  const onCloseSubmitSuccess = () => {
    setShowSubmitSuccessModal(false);
    router.replace("/sso/reports");
  };

  return (
    <ImageBackground source={require("../../assets/srbackground.png")} style={styles.bgImage} resizeMode="cover">
      <SafeAreaView style={styles.root}>
        <View style={styles.headerRow}>
          <Pressable
            style={styles.backButton}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/sso/home"))}
          >
            <ChevronLeft color="#FFFFFF" size={24} strokeWidth={2.4} />
          </Pressable>
          <Text style={styles.headerTitle}>Incident Report</Text>
        </View>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <Pressable
                  style={[styles.toggleBtn, reportType === "Handover" ? styles.toggleBtnActive : null]}
                  onPress={() => setReportType("Handover")}
                >
                  <Text style={[styles.toggleText, reportType === "Handover" ? styles.toggleTextActive : null]}>Handover</Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleBtn, reportType === "Resolved" ? styles.toggleBtnActive : null]}
                  onPress={() => setReportType("Resolved")}
                >
                  <Text style={[styles.toggleText, reportType === "Resolved" ? styles.toggleTextActive : null]}>Resolved</Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Incident Category:</Text>
              <Pressable style={styles.categoryDropdownTrigger} onPress={() => setShowCategoryDropdown(true)}>
                <Text style={styles.categoryDropdownText}>{selectedCategory}</Text>
                <ChevronDown size={20} color="#6B7280" />
              </Pressable>

              <Text style={styles.label}>Location of Incident:</Text>
              <FieldBox value={locationText} />

              <Text style={styles.label}>Date:</Text>
              <FieldBox value={incidentDateText} />

              <View style={styles.timeRow}>
                <View style={styles.timeCol}>
                  <Text style={styles.label}>Start Time:</Text>
                  <FieldBox value={startTimeText} />
                </View>

                <Text style={styles.arrowText}>{"\u2192"}</Text>

                <View style={styles.timeCol}>
                  <Text style={styles.label}>{reportType === "Handover" ? "Handover Time:" : "Resolved Time:"}</Text>
                  <FieldBox value={nowTimeText} />
                </View>
              </View>

              <View style={styles.separator} />

              <Text style={styles.label}>Duty Officer Name:</Text>
              <FieldBox value={dutyOfficerName} />

              <Text style={styles.label}>Incident Description:</Text>
              <TextInput
                value={incidentDescription}
                onChangeText={setIncidentDescription}
                placeholder="Enter incident description"
                placeholderTextColor="#9CA3AF"
                multiline
                textAlignVertical="top"
                style={[styles.textArea, styles.largeTextArea]}
              />

              {reportType === "Handover" ? (
                <>
                  <Text style={styles.label}>Handover Instructions:</Text>
                  <TextInput
                    value={handoverInstructions}
                    onChangeText={setHandoverInstructions}
                    placeholder="Enter instructions for next officer"
                    placeholderTextColor="#9CA3AF"
                    multiline
                    textAlignVertical="top"
                    style={styles.textArea}
                  />
                </>
              ) : null}

              <Text style={styles.label}>Supervisor Incharge Name:</Text>
              <FieldBox value={securitySupervisorName} />

              <Pressable
                style={[styles.submitButton, saving ? styles.submitButtonDisabled : null]}
                disabled={saving}
                onPress={() => {
                  void onSubmit();
                }}
              >
                <Text style={styles.submitText}>{saving ? "Submitting..." : "Submit"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}

        <Modal
          visible={showCategoryDropdown}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCategoryDropdown(false)}
        >
          <Pressable style={styles.dropdownBackdrop} onPress={() => setShowCategoryDropdown(false)}>
            <View style={styles.dropdownCard}>
              {INCIDENT_CATEGORIES.map((category) => (
                <Pressable
                  key={category}
                  style={styles.dropdownOption}
                  onPress={() => {
                    setSelectedCategory(category);
                    setShowCategoryDropdown(false);
                  }}
                >
                  <Text style={styles.dropdownOptionText}>{category}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>

        <Modal
          visible={showSubmitSuccessModal}
          transparent
          animationType="fade"
          onRequestClose={onCloseSubmitSuccess}
        >
          <View style={styles.successBackdrop}>
            <View style={styles.successCard}>
              <LinearGradient
                colors={["#0E2D52", "#1E4B80"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.successIconWrap}
              >
                <Text style={styles.successIcon}>✓</Text>
              </LinearGradient>

              <Text style={styles.successTitle}>Report Submitted</Text>
              <Text style={styles.successMessage}>Your report has been submitted and archived in Past Reports.</Text>

              <Pressable style={styles.successPrimaryBtn} onPress={onCloseSubmitSuccess}>
                <Text style={styles.successPrimaryBtnText}>Back to Reports</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </ImageBackground>
  );
}

function FieldBox({ value }: { value: string }) {
  return (
    <View style={styles.fieldBox}>
      <Text style={styles.fieldValue}>{value || "-"}</Text>
    </View>
  );
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value: Date) {
  return value.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const styles = StyleSheet.create({
  bgImage: {
    flex: 1,
    backgroundColor: "#10273F",
  },
  root: {
    flex: 1,
    backgroundColor: "rgba(5, 16, 30, 0.35)",
  },
  headerRow: {
    paddingHorizontal: 14,
    paddingTop: 40,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: "rgba(187,198,212,0.42)",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.48)",
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
  },
  toggleBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBtnActive: {
    backgroundColor: "#0E2D52",
  },
  toggleText: {
    color: "#0F172A",
    fontWeight: "700",
  },
  toggleTextActive: {
    color: "#FFFFFF",
  },
  label: {
    color: "#0A0F18",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 2,
  },
  categoryDropdownTrigger: {
    height: 44,
    borderWidth: 1.8,
    borderColor: "#F5A13E",
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 13,
    marginBottom: 10,
  },
  categoryDropdownText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "600",
  },
  fieldBox: {
    minHeight: 42,
    borderWidth: 1.8,
    borderColor: "#F5A13E",
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    paddingHorizontal: 13,
    marginBottom: 10,
  },
  fieldValue: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "600",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  timeCol: {
    flex: 1,
  },
  arrowText: {
    color: "#E2E8F0",
    fontSize: 24,
    fontWeight: "700",
    marginHorizontal: 8,
  },
  separator: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.28)",
    marginVertical: 6,
  },
  textArea: {
    minHeight: 120,
    borderWidth: 1.8,
    borderColor: "#F5A13E",
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 13,
    paddingVertical: 10,
    color: "#111827",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 10,
  },
  largeTextArea: {
    minHeight: 150,
  },
  submitButton: {
    alignSelf: "center",
    marginTop: 8,
    backgroundColor: "#F5A13E",
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 22,
  },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  dropdownCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    overflow: "hidden",
  },
  dropdownOption: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  dropdownOptionText: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "600",
  },
  successBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  successCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  successIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  successIcon: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
  },
  successTitle: {
    marginTop: 12,
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
  },
  successMessage: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
    textAlign: "center",
  },
  successPrimaryBtn: {
    marginTop: 16,
    minHeight: 42,
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: "#0E2D52",
    alignItems: "center",
    justifyContent: "center",
  },
  successPrimaryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
