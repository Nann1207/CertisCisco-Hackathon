import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { PhoneCall } from "lucide-react-native";
import Text from "../../../components/TranslatedText";
import { supabase } from "../../../lib/supabase";

type RejectAssignmentRow = {
  assignment_id: string;
  shift_id: string | null;
  incident_id: string | null;
  officer_id: string | null;
  supervisor_id: string | null;
  rejection_reason: string | null;
  rejection_status: string | null;
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

const STORAGE_KEY_PREFIX = "reject_assignment_acknowledged_ids";

function formatName(firstName: string | null, lastName: string | null) {
  return `${firstName?.trim() ?? ""} ${lastName?.trim() ?? ""}`.trim() || "Security Officer";
}

export default function AssignmentRejectionAlertModal({ supervisorId = null }: AssignmentRejectionAlertModalProps) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [alert, setAlert] = useState<RejectionAlert | null>(null);
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const [acknowledged, setAcknowledged] = useState(false);
  const acknowledgedIdsRef = useRef<Set<string>>(new Set());
  const channelNonceRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const storageKey = useMemo(() => {
    if (!userId) return null;
    return `${STORAGE_KEY_PREFIX}:${userId}`;
  }, [userId]);

  useEffect(() => {
    acknowledgedIdsRef.current = acknowledgedIds;
  }, [acknowledgedIds]);

  const loadAcknowledged = useCallback(async (activeUserId: string) => {
    const key = `${STORAGE_KEY_PREFIX}:${activeUserId}`;
    const stored = await AsyncStorage.getItem(key);
    const ids = new Set<string>(stored ? (JSON.parse(stored) as string[]) : []);
    acknowledgedIdsRef.current = ids;
    setAcknowledgedIds(ids);
  }, []);

  const markAcknowledged = useCallback(async (assignmentId: string) => {
    const next = new Set(acknowledgedIdsRef.current);
    next.add(assignmentId);
    acknowledgedIdsRef.current = next;
    setAcknowledgedIds(next);
    if (storageKey) {
      await AsyncStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
    }
  }, [storageKey]);

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
      .eq("active_status", true);

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

  useEffect(() => {
    let alive = true;

    if (supervisorId) {
      setUserId(supervisorId);
      void loadAcknowledged(supervisorId);
      return () => {
        alive = false;
      };
    }

    const bootstrap = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData.session?.user.id ?? null;
      if (!alive) return;
      setUserId(currentUserId);
      if (currentUserId) {
        await loadAcknowledged(currentUserId);
      }
    };

    void bootstrap();

    return () => {
      alive = false;
    };
  }, [loadAcknowledged, supervisorId]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`reject-assignment-${userId}-${channelNonceRef.current}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "reject_assignment",
          filter: `supervisor_id=eq.${userId}`,
        },
        async (payload) => {
          const row = payload.new as RejectAssignmentRow;
          if (!row.assignment_id || acknowledgedIdsRef.current.has(row.assignment_id)) return;

          const nextAlert = await buildAlert(row);
          if (!nextAlert) return;

          setAlert(nextAlert);
          setAcknowledged(false);
          setVisible(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [buildAlert, userId]);

  const onCallOfficer = async () => {
    if (!alert?.officerPhone) {
      router.push({
        pathname: "/sso/phonecalls",
        params: { officerId: alert?.officerId ?? undefined },
      });
      return;
    }

    const tel = `tel:${alert.officerPhone}`;
    try {
      const canOpen = await Linking.canOpenURL(tel);
      if (!canOpen) {
        router.push({
          pathname: "/sso/phonecalls",
          params: { officerId: alert.officerId },
        });
        return;
      }
      await Linking.openURL(tel);
    } catch {
      router.push({
        pathname: "/sso/phonecalls",
        params: { officerId: alert.officerId },
      });
    }
  };

  const closeModal = () => {
    setVisible(false);
    setAlert(null);
    setAcknowledged(false);
  };

  const onAcknowledge = async () => {
    if (!alert) return;
    await markAcknowledged(alert.assignmentId);
    setAcknowledged(true);
  };

  const onDismiss = async () => {
    if (alert) {
      await markAcknowledged(alert.assignmentId);
    }
    closeModal();
  };

  const onDispatchOfficers = async () => {
    if (alert) {
      await markAcknowledged(alert.assignmentId);
      closeModal();
      router.push(`/sso/assign-officer?incidentId=${alert.incidentId}`);
    }
  };

  const onReassignOfficers = async () => {
    if (alert) {
      await markAcknowledged(alert.assignmentId);
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
          <Text style={styles.reasonLabel}>Reason:</Text>
          <Text style={styles.reasonText}>{alert.reason}</Text>

          {alert.scenario === "all" ? (
            acknowledged ? (
              <View style={styles.actionColumn}>
                <Pressable style={[styles.actionBtn, styles.callBtn]} onPress={() => void onCallOfficer()}>
                  <PhoneCall size={16} color="#0F172A" />
                  <Text style={styles.callText}>Call {alert.officerName}</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, styles.primaryBtn]} onPress={() => void onDispatchOfficers()}>
                  <Text style={styles.primaryText}>Dispatch Officers</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.ackBtn} onPress={() => void onAcknowledge()}>
                <Text style={styles.ackText}>I ACKNOWLEDGE THIS UPDATE</Text>
              </Pressable>
            )
          ) : (
            <View style={styles.actionColumn}>
              {!acknowledged ? (
                <Pressable style={styles.ackBtn} onPress={() => void onAcknowledge()}>
                  <Text style={styles.ackText}>I ACKNOWLEDGE THIS UPDATE</Text>
                </Pressable>
              ) : null}
              <Pressable style={[styles.actionBtn, styles.callBtn]} onPress={() => void onCallOfficer()}>
                <PhoneCall size={16} color="#0F172A" />
                <Text style={styles.callText}>Call {alert.officerName}</Text>
              </Pressable>
              <Pressable style={[styles.actionBtn, styles.primaryBtn]} onPress={() => void onReassignOfficers()}>
                <Text style={styles.primaryText}>Reassign Officers</Text>
              </Pressable>
            </View>
          )}

          <Pressable style={styles.dismissBtn} onPress={() => void onDismiss()}>
            <Text style={styles.dismissText}>Close</Text>
          </Pressable>
        </LinearGradient>
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
    marginTop: 14,
    color: "#7C2D12",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  reasonText: {
    marginTop: 6,
    color: "#1F2937",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  ackBtn: {
    marginTop: 18,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#0B2D57",
    alignItems: "center",
    justifyContent: "center",
  },
  ackText: {
    color: "#FFFFFF",
    fontSize: 14,
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
