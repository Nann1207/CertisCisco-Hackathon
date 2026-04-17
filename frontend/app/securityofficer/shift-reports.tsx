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

export default function ReportsScreen() {
  const router = useRouter();
  const { shiftId } = useLocalSearchParams<{ shiftId?: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shift, setShift] = useState<ReportShift | null>(null);
  const [dutyOfficerName, setDutyOfficerName] = useState("-");
  const [supervisorName, setSupervisorName] = useState("-");
  const [shiftDescription, setShiftDescription] = useState("");
  const [showSubmitSuccessModal, setShowSubmitSuccessModal] = useState(false);

  useEffect(() => {
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
  }, [shiftId]);

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

    const { error } = await supabase
      .from("shifts")
      .update({ shift_description: description })
      .eq("shift_id", shift.shift_id);

    if (error) {
      setSaving(false);
      Alert.alert("Submit failed", "Unable to save shift description. Please try again.");
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
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Shift Report</Text>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color="#0E2D52" />
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
                  <View style={styles.timeCapsule}>
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
    backgroundColor: "#1E3A5F",
  },
  bgGlowTop: {
    position: "absolute",
    right: -40,
    top: -20,
    width: 240,
    height: 220,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  bgGlowBottom: {
    position: "absolute",
    left: -70,
    bottom: -40,
    width: 260,
    height: 220,
    borderRadius: 999,
    backgroundColor: "rgba(243,156,82,0.22)",
  },
  header: {
    paddingTop: 42,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
  },
  loaderWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: "rgba(187,198,212,0.42)",
    borderRadius: 36,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 14,
  },
  label: {
    color: "#0A0F18",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 6,
  },
  inputLike: {
    height: 44,
    borderWidth: 1.8,
    borderColor: "#F5A13E",
    borderRadius: 22,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 13,
    marginBottom: 14,
  },
  readOnlyInputLike: {
    backgroundColor: "#c6cbd1",
  },
  inputText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "500",
  },
  timeRowWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    marginBottom: 12,
  },
  timeCol: {
    flex: 1,
  },
  timeInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  timeCapsule: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.8,
    borderColor: "#F5A13E",
    backgroundColor: "#c6cbd1",
    alignItems: "center",
    justifyContent: "center",
  },
  timeColon: {
    color: "#0A0F18",
    fontSize: 20,
    fontWeight: "600",
    marginTop: -2,
  },
  timeArrowWrap: {
    width: 44,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 2,
    marginHorizontal: 4,
    marginLeft: 20,
    marginRight: 35,
  },
  timeArrow: {
    color: "#E2E8F0",
    fontSize: 40,
    fontWeight: "600",
    lineHeight: 70,
  },
  timeText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.28)",
    marginVertical: 6,
  },
  descriptionInput: {
    minHeight: 232,
    borderWidth: 1.8,
    borderColor: "#F5A13E",
    borderRadius: 22,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: "#111827",
    fontSize: 13,
    fontWeight: "500",
  },
  submitButton: {
    alignSelf: "center",
    marginTop: 16,
    backgroundColor: "#F5A13E",
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 5,
  },
  submitButtonDisabled: {
    opacity: 0.65,
  },
  submitText: {
    color: "#111827",
    fontWeight: "500",
    fontSize: 22,
  },
  successModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  successModalCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    alignItems: "center",
  },
  successIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  successTitle: {
    color: "#0E2D52",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  successMessage: {
    marginTop: 6,
    color: "#475569",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  successPrimaryBtn: {
    marginTop: 16,
    backgroundColor: "#F5A13E",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 150,
    alignItems: "center",
  },
  successPrimaryBtnText: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "700",
  },
});
