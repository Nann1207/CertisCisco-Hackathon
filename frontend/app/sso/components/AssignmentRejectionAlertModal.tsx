import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { PhoneCall, SquareCheckBig, BellRing } from "lucide-react-native";
import Text from "../../../components/TranslatedText";
import { supabase } from "../../../lib/supabase";
import OfficerCallModal from "./OfficerCallModal";

type RejectAssignmentRow = {
  assignment_id: string;
  shift_id: string | null;
  incident_id: string | null;
  officer_id: string | null;
  supervisor_id: string | null;
  rejection_reason: string | null;
  rejection_status: "Unseen" | "Acknowledged" | string | null;
  created_at?: string | null;
};

type OfficerProfile = {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
};

type RejectionAlert = {
  assignmentId: string;
  incidentId: string;
  officerId: string;
  officerName: string;
  officerPhone: string | null;
  reason: string;
  scenario: "all" | "partial";
};

type AssignmentRejectionAlertModalProps = {
  supervisorId?: string | null;
};

function formatName(firstName: string | null, lastName: string | null) {
  return `${firstName?.trim() ?? ""} ${lastName?.trim() ?? ""}`.trim() || "Security Officer";
}

export default function AssignmentRejectionAlertModal({ supervisorId = null }: AssignmentRejectionAlertModalProps) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [showCallModal, setShowCallModal] = useState(false);
  const [alert, setAlert] = useState<RejectionAlert | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const acknowledgedRef = useRef(false);
  const channelNonceRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    acknowledgedRef.current = acknowledged;
  }, [acknowledged]);

  const buildAlert = useCallback(async (row: RejectAssignmentRow) => {
    if (!row.assignment_id || !row.incident_id || !row.officer_id) return null;

    const { data: officerData } = await supabase
      .from("employees")
      .select("first_name, last_name, phone")
      .eq("id", row.officer_id)
      .maybeSingle<OfficerProfile>();

    const officerName = formatName(officerData?.first_name ?? null, officerData?.last_name ?? null);

    const { data: activeAssignments } = await supabase
      .from("incident_assignments")
      .select("assignment_id")
      .eq("incident_id", row.incident_id)
      .eq("active_status", true)
      .neq("assignment_id", row.assignment_id);

    const remainingCount = ((activeAssignments as { assignment_id: string }[] | null) ?? []).length;
    const scenario = remainingCount > 0 ? "partial" : "all";

    return {
      assignmentId: row.assignment_id,
      incidentId: row.incident_id,
      officerId: row.officer_id,
      officerName,
      officerPhone: officerData?.phone ?? null,
      reason: row.rejection_reason?.trim() ?? "No reason provided.",
      scenario,
    } satisfies RejectionAlert;
  }, []);

  const showFirstPendingRejection = useCallback(async (activeUserId: string) => {
    const { data, error } = await supabase
      .from("reject_assignment")
      .select("assignment_id, shift_id, incident_id, officer_id, supervisor_id, rejection_reason, rejection_status, created_at")
      .eq("supervisor_id", activeUserId)
      .eq("rejection_status", "Unseen")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.warn("[AssignmentRejectionAlertModal] pending rejection query failed", error.message);
      return;
    }

    const pendingRows = ((data as RejectAssignmentRow[] | null) ?? []).filter((row) => row.assignment_id);

    for (const row of pendingRows) {
      const nextAlert = await buildAlert(row);
      if (!nextAlert) continue;

      setAlert(nextAlert);
      acknowledgedRef.current = false;
      setAcknowledged(false);
      setVisible(true);
      return;
    }

    if (!acknowledgedRef.current) {
      setAlert(null);
      setVisible(false);
      setAcknowledged(false);
    }
  }, [buildAlert]);

  const markAcknowledged = useCallback(async (assignmentId: string) => {
    const { error } = await supabase
      .from("reject_assignment")
      .update({ rejection_status: "Acknowledged" })
      .eq("assignment_id", assignmentId);

    if (error) {
      console.warn("[AssignmentRejectionAlertModal] acknowledgement update failed", error.message);
      return false;
    }

    return true;
  }, []);

  useEffect(() => {
    let alive = true;

    const loadForUser = async (nextUserId: string | null) => {
      if (!alive) return;
      setUserId(nextUserId);

      if (!nextUserId) {
        setAlert(null);
        setVisible(false);
        acknowledgedRef.current = false;
        setAcknowledged(false);
        return;
      }

      if (!alive) return;
      await showFirstPendingRejection(nextUserId);
    };

    if (supervisorId) {
      void loadForUser(supervisorId);
      return () => {
        alive = false;
      };
    }

    const bootstrap = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData.session?.user.id ?? null;
      await loadForUser(currentUserId);
    };

    void bootstrap();

    const authListener = supabase.auth.onAuthStateChange((_event, session) => {
      void loadForUser(session?.user.id ?? null);
    });

    return () => {
      alive = false;
      authListener.data.subscription.unsubscribe();
    };
  }, [showFirstPendingRejection, supervisorId]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`reject-assignment-${userId}-${channelNonceRef.current}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reject_assignment",
          filter: `supervisor_id=eq.${userId}`,
        },
        async () => {
          await showFirstPendingRejection(userId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showFirstPendingRejection, userId]);

  const closeModal = () => {
    setVisible(false);
    setShowCallModal(false);
    setAlert(null);
    acknowledgedRef.current = false;
    setAcknowledged(false);
  };

  const onAcknowledge = async () => {
    if (!alert) return;
    acknowledgedRef.current = true;
    const success = await markAcknowledged(alert.assignmentId);
    if (!success) {
      acknowledgedRef.current = false;
      return;
    }
    setAcknowledged(true);
  };

  const onDismiss = async () => {
    if (!alert) {
      closeModal();
      return;
    }

    const incidentRoute =
      alert.scenario === "all"
        ? `/sso/incident-before-assign?incidentId=${alert.incidentId}`
        : `/sso/incident-after-assign?incidentId=${alert.incidentId}`;

    closeModal();
    router.push(incidentRoute);
  };

  const onDispatchOfficers = async () => {
    if (alert) {
      closeModal();
      router.push(`/sso/assign-officer?incidentId=${alert.incidentId}`);
    }
  };

  const onReassignOfficers = async () => {
    if (alert) {
      closeModal();
      router.push(`/sso/add-backup?incidentId=${alert.incidentId}`);
    }
  };

  if (!alert) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => {
        void onDismiss();
      }}
    >
      <View style={styles.backdrop}>
        <LinearGradient
          colors={["#FDEBD3", "#FFD8B5", "#F5C7E9"]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.95, y: 1 }}
          style={styles.card}
        >
          <Text style={styles.title}>ASSIGNMENT REJECTED</Text>
          <Text style={styles.subtitle}>{alert.officerName} declined the incident.</Text>
          <View style={styles.reasonBox}>
            <Text style={styles.reasonLabel}>Reason of rejection</Text>
            <View style={styles.divider} />
            <Text style={styles.reasonText}>{alert.reason}</Text>
          </View>

          {acknowledged ? (
            alert.scenario === "all" ? (
              <View style={styles.actionColumn}>
                <Pressable style={[styles.actionBtn, styles.callBtn]} onPress={() => setShowCallModal(true)}>
                  <PhoneCall size={16} color="#0F172A" />
                  <Text style={styles.callText}>Call {alert.officerName}</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, styles.primaryBtn]} onPress={() => void onDispatchOfficers()}>
                  <BellRing size={22} color="#ffffff" />
                  <Text style={styles.primaryText}>Dispatch Officers</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.actionColumn}>
                <Pressable style={[styles.actionBtn, styles.callBtn]} onPress={() => setShowCallModal(true)}>
                  <PhoneCall size={16} color="#0F172A" />
                  <Text style={styles.callText}>Call {alert.officerName}</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, styles.primaryBtn]} onPress={() => void onReassignOfficers()}>
                  <Text style={styles.primaryText}>Reassign Officers</Text>
                </Pressable>
              </View>
            )
          ) : (
            <Pressable style={styles.ackBtn} onPress={() => void onAcknowledge()}>
              <SquareCheckBig size={20} color="#FFFFFF" />
              <Text style={styles.ackText}>I ACKNOWLEDGE THIS UPDATE</Text>
            </Pressable>
          )}

          {acknowledged ? (
            <Pressable style={styles.dismissBtn} onPress={() => void onDismiss()}>
              <Text style={styles.dismissText}>Close</Text>
            </Pressable>
          ) : null}
        </LinearGradient>

        <OfficerCallModal
          visible={showCallModal}
          officerName={alert.officerName}
          phone={alert.officerPhone}
          onClose={() => setShowCallModal(false)}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(10, 22, 38, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  card: {
    width: "100%",
    maxWidth: 390,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: "#7C2D12",
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
  },
  title: {
    color: "#7C2D12",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 6,
    color: "#1F2937",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  reasonLabel: {
    marginTop: 2,
    marginLeft: 5,
    marginBottom: 5,
    color: "#0a133a",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  reasonBox: {
    marginTop: 20,
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(124, 45, 18, 0.24)",
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
  },
  divider: {
    height: 1,
    backgroundColor: "#0d223d",
    marginVertical: 3,
    width: "100%",
  },
  reasonText: {
    color: "#1F2937",
    fontSize: 14,
    lineHeight: 19,
    marginLeft: 5,
    marginTop: 8,
    marginBottom: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  ackBtn: {
    marginTop: 18,
    height: 46,
    borderRadius: 12,
    flexDirection: "row",
    backgroundColor: "#0B2D57",
    alignItems: "center",
    justifyContent: "center",
  },
  ackText: {
    color: "#FFFFFF",
    fontSize: 14,
    marginLeft: 14,
    marginRight: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  actionColumn: {
    marginTop: 16,
    gap: 10,
  },
  actionBtn: {
    height: 44,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  callBtn: {
    backgroundColor: "#FFEAD5",
    borderWidth: 1,
    borderColor: "rgba(124, 45, 18, 0.3)",
  },
  callText: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800",
  },
  primaryBtn: {
    backgroundColor: "#0E2D52",
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  dismissBtn: {
    marginTop: 12,
    alignSelf: "center",
  },
  dismissText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
  },
});
