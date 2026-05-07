import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Text from "../../components/TranslatedText";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";

const DISPLAY_TIME_ZONE = "Asia/Singapore";

type ReportShift = {
  shift_id: string;
  shift_date: string;
  clockin_time: string | null;
  clockout_time: string | null;
  shift_description: string | null;
  officer_id: string | null;
  supervisor_id: string | null;
};

export default function ShiftReportScreen() {
  const router = useRouter();
  const { shiftId, incidentId, reportType, checkedEarlyActions, checkedSopActions } = useLocalSearchParams<{
    shiftId?: string;
    incidentId?: string;
    reportType?: string;
    checkedEarlyActions?: string;
    checkedSopActions?: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shift, setShift] = useState<ReportShift | null>(null);
  const [dutyOfficerName, setDutyOfficerName] = useState("-");
  const [supervisorName, setSupervisorName] = useState("-");
  const [shiftDescription, setShiftDescription] = useState("");
  const [showSubmitSuccessModal, setShowSubmitSuccessModal] = useState(false);
  const isIncidentReportRoute = Boolean(incidentId && reportType);

  useEffect(() => {
    if (!incidentId || !reportType) return;
    router.replace({
      pathname: "/securityofficer/createReport",
      params: {
        incidentId,
        reportType,
        checkedEarlyActions,
        checkedSopActions,
      },
    });
  }, [checkedEarlyActions, checkedSopActions, incidentId, reportType, router]);

  useEffect(() => {
    if (isIncidentReportRoute) {
      setLoading(true);
      return;
    }

    let alive = true;

    const loadReportData = async () => {
      if (!shiftId) {
        if (alive) setLoading(false);
        return;
      }

      const { data: shiftData, error: shiftError } = await supabase
        .from("shifts")
        .select("shift_id, shift_date, clockin_time, clockout_time, shift_description, officer_id, supervisor_id")
        .eq("shift_id", shiftId)
        .maybeSingle();

      if (!alive) return;

      if (shiftError || !shiftData) {
        setLoading(false);
        Alert.alert("Unable to load shift", "Please try again.");
        return;
      }

      setShift(shiftData as ReportShift);
      setShiftDescription(shiftData.shift_description ?? "");

      const officerId = shiftData.officer_id;
      if (officerId) {
        const { data: officerData } = await supabase
          .from("employees")
          .select("first_name, last_name")
          .eq("id", officerId)
          .maybeSingle();

        if (alive && officerData) {
          const fullName = `${(officerData.first_name ?? "").trim()} ${(officerData.last_name ?? "").trim()}`.trim();
          setDutyOfficerName(fullName || "-");
        }
      }

      const supId = shiftData.supervisor_id;
      if (supId) {
        const { data: supervisorRows } = await supabase.rpc("get_my_supervisor_name", {
          p_supervisor_id: supId,
        });

        if (alive) {
          const row = Array.isArray(supervisorRows) ? supervisorRows[0] : null;
          if (row) {
            const fullName = `${(row.first_name ?? "").trim()} ${(row.last_name ?? "").trim()}`.trim();
            setSupervisorName(fullName || "-");
          }
        }
      }

      if (alive) setLoading(false);
    };

    void loadReportData();

    return () => {
      alive = false;
    };
  }, [isIncidentReportRoute, shiftId]);

  const dateText = useMemo(() => {
    if (!shift?.shift_date) return "-";
    return new Date(shift.shift_date).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: DISPLAY_TIME_ZONE,
    });
  }, [shift?.shift_date]);

  const clockInText = useMemo(() => formatClockTime(shift?.clockin_time), [shift?.clockin_time]);
  const clockOutText = useMemo(() => formatClockTime(shift?.clockout_time), [shift?.clockout_time]);
  const [clockInHour, clockInMinute] = splitClockParts(clockInText);
  const [clockOutHour, clockOutMinute] = splitClockParts(clockOutText);

  const handleSubmit = async () => {
    if (!shift?.shift_id) return;

    const description = shiftDescription.trim();
    if (!description) {
      Alert.alert("Description required", "Please enter your shift description.");
      return;
    }

    setSaving(true);

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const authUserId = sessionData.session?.user.id ?? null;
    if (!authUserId) {
      setSaving(false);
      Alert.alert("Submit failed", sessionError?.message ?? "Unable to validate your session.");
      return;
    }

    const { error } = await supabase
      .from("shifts")
      .update({ shift_description: description })
      .eq("shift_id", shift.shift_id)
      .eq("officer_id", authUserId);

    if (error) {
      setSaving(false);
      Alert.alert("Submit failed", "Unable to save shift description. Please try again.");
      return;
    }

    const { error: closeAssignmentsError } = await supabase
      .from("incident_assignments")
      .update({ active_status: false })
      .eq("officer_id", authUserId)
      .eq("shift_id", shift.shift_id)
      .eq("active_status", true)
      .select("assignment_id");

    if (closeAssignmentsError) {
      setSaving(false);
      Alert.alert(
        "Submit failed",
        `Shift report was saved, but assignments could not be closed for this shift. ${closeAssignmentsError.message}`
      );
      return;
    }

    setSaving(false);
    setShowSubmitSuccessModal(true);
  };

  return (
    <ImageBackground
      source={require("../../assets/srbackground.png")}
      resizeMode="cover"
      style={styles.root}
    >
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/securityofficer/home"))}
        >
          <ChevronLeft size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Shift Report</Text>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color="#0E2D52" />
        </View>
      ) : !shift ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No shift selected</Text>
          <Text style={styles.emptyBody}>Open Shift Reports to select a shift that needs documentation.</Text>
          <Pressable
            style={styles.emptyBtn}
            onPress={() => router.replace("/securityofficer/all-shift-reports")}
          >
            <Text style={styles.emptyBtnText}>Go to Shift Reports</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <Text style={styles.label}>Date</Text>
            <View style={[styles.inputLike, styles.readOnlyInputLike]}>
              <Text style={styles.inputText}>{dateText}</Text>
              <Ionicons name="calendar-outline" size={16} color="#2FA65A" />
            </View>

            <View style={styles.timeRowWrap}>
              <View style={styles.timeCol}>
                <Text style={styles.label}>Clock In Time:</Text>
                <View style={styles.timeInputWrap}>
                  <View style={styles.timeCapsule}>
                    <Text style={styles.timeText}>{clockInHour}</Text>
                  </View>
                  <Text style={styles.timeColon}>:</Text>
                  <View style={styles.timeCapsule}>
                    <Text style={styles.timeText}>{clockInMinute}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.timeArrowWrap}>
                <Text style={styles.timeArrow}>→</Text>
              </View>

              <View style={styles.timeCol}>
                <Text style={styles.label}>Clock Out Time:</Text>
                <View style={styles.timeInputWrap}>
                  <View style={styles.timeCapsule}
                  >
                    <Text style={styles.timeText}>{clockOutHour}</Text>
                  </View>
                  <Text style={styles.timeColon}>:</Text>
                  <View style={styles.timeCapsule}>
                    <Text style={styles.timeText}>{clockOutMinute}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.label}>Duty Officer Name</Text>
            <View style={[styles.inputLike, styles.readOnlyInputLike]}>
              <Text style={styles.inputText}>{dutyOfficerName}</Text>
            </View>

            <Text style={styles.label}>Supervisor Incharge Name</Text>
            <View style={[styles.inputLike, styles.readOnlyInputLike]}>
              <Text style={styles.inputText}>{supervisorName}</Text>
            </View>

            <Text style={styles.label}>Shift Description</Text>
            <TextInput
              value={shiftDescription}
              onChangeText={setShiftDescription}
              placeholder="Describe what happened during your shift"
              placeholderTextColor="#7C828B"
              multiline
              textAlignVertical="top"
              style={styles.descriptionInput}
            />

            <Pressable
              style={[styles.submitButton, saving && styles.submitButtonDisabled]}
              disabled={saving}
              onPress={() => {
                void handleSubmit();
              }}
            >
              <Text style={styles.submitText}>{saving ? "Submitting..." : "Submit"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      <Modal
        visible={showSubmitSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSubmitSuccessModal(false)}
      >
        <View style={styles.successModalBackdrop}>
          <View style={styles.successModalCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark" size={22} color="#fff" />
            </View>
            <Text style={styles.successTitle}>Shift Report Submitted</Text>
            <Text style={styles.successMessage}>Your shift description has been saved successfully.</Text>

            <Pressable
              style={styles.successPrimaryBtn}
              onPress={() => {
                setShowSubmitSuccessModal(false);
                router.replace("/securityofficer/home");
              }}
            >
              <Text style={styles.successPrimaryBtnText}>Back to Home</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
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

function splitClockParts(value: string) {
  const [hour = "--", minute = "--"] = value.split(":");
  return [hour, minute];
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 12,
    paddingTop: 40,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    marginLeft: 10,
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: 16,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  emptyBody: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    textAlign: "center",
  },
  emptyBtn: {
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#0E2D52",
  },
  emptyBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  card: {
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 6,
  },
  inputLike: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    marginBottom: 12,
  },
  readOnlyInputLike: {
    backgroundColor: "#F1F5F9",
  },
  inputText: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "700",
  },
  timeRowWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  timeCol: {
    flex: 1,
  },
  timeInputWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  timeCapsule: {
    minWidth: 44,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  timeText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  timeColon: {
    marginHorizontal: 6,
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  timeArrowWrap: {
    paddingHorizontal: 6,
  },
  timeArrow: {
    fontSize: 20,
    color: "#0F172A",
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 12,
  },
  descriptionInput: {
    minHeight: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    padding: 12,
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "600",
  },
  submitButton: {
    marginTop: 14,
    borderRadius: 999,
    backgroundColor: "#0E2D52",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  successModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  successModalCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 20,
    alignItems: "center",
    gap: 12,
  },
  successIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  successMessage: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
  },
  successPrimaryBtn: {
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#0E2D52",
  },
  successPrimaryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
