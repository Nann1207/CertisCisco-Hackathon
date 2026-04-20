import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Vibration, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import Text from "../../../components/TranslatedText";
import { supabase } from "../../../lib/supabase";

type AssignmentRow = {
  assignment_id: string;
  incident_id: string | null;
  assigned_at: string | null;
  active_status: boolean | null;
  incidents:
    | {
        incident_name: string | null;
        location_unit_no: string | null;
      }
    | {
        incident_name: string | null;
        location_unit_no: string | null;
      }[]
    | null;
};

type AlertAssignment = {
  assignmentId: string;
  incidentId: string;
  incidentName: string;
  locationUnitNo: string;
};

const STORAGE_KEY_PREFIX = "assignment_acknowledged_ids";
const DISMISS_STORAGE_KEY_PREFIX = "assignment_dismissed_map";

export default function AssignmentAlertModal() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const [dismissedMap, setDismissedMap] = useState<Record<string, string>>({});
  const [activeAssignment, setActiveAssignment] = useState<AlertAssignment | null>(null);
  const acknowledgedIdsRef = useRef<Set<string>>(new Set());
  const dismissedMapRef = useRef<Record<string, string>>({});
  const channelNonceRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const storageKey = useMemo(() => {
    if (!userId) return null;
    return `${STORAGE_KEY_PREFIX}:${userId}`;
  }, [userId]);

  const storageDismissKey = useMemo(() => {
    if (!userId) return null;
    return `${DISMISS_STORAGE_KEY_PREFIX}:${userId}`;
  }, [userId]);

  const stopVibration = () => {
    Vibration.cancel();
  };

  useEffect(() => {
    acknowledgedIdsRef.current = acknowledgedIds;
  }, [acknowledgedIds]);

  useEffect(() => {
    dismissedMapRef.current = dismissedMap;
  }, [dismissedMap]);

  const parseIncident = useCallback((row: AssignmentRow) => {
    if (Array.isArray(row.incidents)) {
      return row.incidents[0] ?? null;
    }
    return row.incidents ?? null;
  }, []);

  const fetchActiveAssignments = useCallback(
    async (activeUserId: string, ackSet: Set<string>, dismissed: Record<string, string> = {}) => {
      const { data, error } = await supabase
        .from("incident_assignments")
        .select("assignment_id, incident_id, assigned_at, active_status, incidents(incident_name, location_unit_no)")
        .eq("officer_id", activeUserId)
        .eq("active_status", true)
        .order("assigned_at", { ascending: false })
        .limit(20);

      if (error) {
        return;
      }

      const rows = (data as AssignmentRow[] | null) ?? [];
      const activeIds = new Set(rows.map((r) => r.assignment_id).filter(Boolean));

      const prunedAckSet = new Set(Array.from(ackSet).filter((id) => activeIds.has(id)));
      if (prunedAckSet.size !== ackSet.size) {
        acknowledgedIdsRef.current = prunedAckSet;
        setAcknowledgedIds(prunedAckSet);
        await AsyncStorage.setItem(`${STORAGE_KEY_PREFIX}:${activeUserId}`, JSON.stringify(Array.from(prunedAckSet)));
      }

      const prunedDismissed = Object.fromEntries(Object.entries(dismissed).filter(([id]) => activeIds.has(id)));
      if (JSON.stringify(prunedDismissed) !== JSON.stringify(dismissed)) {
        dismissedMapRef.current = prunedDismissed;
        setDismissedMap(prunedDismissed);
        await AsyncStorage.setItem(`${DISMISS_STORAGE_KEY_PREFIX}:${activeUserId}`, JSON.stringify(prunedDismissed));
      }

      const effectiveAckSet = prunedAckSet.size !== ackSet.size ? prunedAckSet : ackSet;
      const next = rows.find((row) => row.incident_id && !effectiveAckSet.has(row.assignment_id) && !prunedDismissed[row.assignment_id]);

      if (!next || !next.incident_id) {
        setActiveAssignment(null);
        setVisible(false);
        stopVibration();
        return;
      }

      const incident = parseIncident(next);
      const incidentName = (incident?.incident_name ?? "New Incident").toUpperCase();
      const locationUnitNo = incident?.location_unit_no?.trim() ? `#${incident.location_unit_no.trim()}` : "Location Unit Pending";

      setActiveAssignment({
        assignmentId: next.assignment_id,
        incidentId: next.incident_id,
        incidentName,
        locationUnitNo,
      });
      setVisible(true);
    },
    [parseIncident]
  );

  useEffect(() => {
    let alive = true;

    const bootstrap = async () => {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData.session?.user.id ?? null;

      if (!alive) return;
      setUserId(currentUserId);

      if (!currentUserId) {
        setLoading(false);
        return;
      }

      const key = `${STORAGE_KEY_PREFIX}:${currentUserId}`;
      const stored = await AsyncStorage.getItem(key);
      const ids = new Set<string>(stored ? (JSON.parse(stored) as string[]) : []);

      const dKey = `${DISMISS_STORAGE_KEY_PREFIX}:${currentUserId}`;
      const storedDismissed = await AsyncStorage.getItem(dKey);
      const dismissed = storedDismissed ? (JSON.parse(storedDismissed) as Record<string, string>) : {};

      if (!alive) return;
      acknowledgedIdsRef.current = ids;
      dismissedMapRef.current = dismissed;
      setAcknowledgedIds(ids);
      setDismissedMap(dismissed);
      await fetchActiveAssignments(currentUserId, ids, dismissed);
      if (alive) setLoading(false);
    };

    void bootstrap();

    const authListener = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextUserId = session?.user?.id ?? null;
      setUserId(nextUserId);

      if (!nextUserId) {
        acknowledgedIdsRef.current = new Set();
        dismissedMapRef.current = {};
        setAcknowledgedIds(new Set());
        setDismissedMap({});
        setActiveAssignment(null);
        setVisible(false);
        stopVibration();
        return;
      }

      const key = `${STORAGE_KEY_PREFIX}:${nextUserId}`;
      const stored = await AsyncStorage.getItem(key);
      const ids = new Set<string>(stored ? (JSON.parse(stored) as string[]) : []);

      const dKey = `${DISMISS_STORAGE_KEY_PREFIX}:${nextUserId}`;
      const storedDismissed = await AsyncStorage.getItem(dKey);
      const dismissed = storedDismissed ? (JSON.parse(storedDismissed) as Record<string, string>) : {};
      acknowledgedIdsRef.current = ids;
      dismissedMapRef.current = dismissed;
      setAcknowledgedIds(ids);
      setDismissedMap(dismissed);
      await fetchActiveAssignments(nextUserId, ids, dismissed);
    });

    return () => {
      alive = false;
      authListener.data.subscription.unsubscribe();
      stopVibration();
    };
  }, [fetchActiveAssignments]);

  useEffect(() => {
    if (!userId || loading) return;

    const channel = supabase
      .channel(`assignment-alert-${userId}-${channelNonceRef.current}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "incident_assignments",
          filter: `officer_id=eq.${userId}`,
        },
        async () => {
          await fetchActiveAssignments(userId, acknowledgedIdsRef.current, dismissedMapRef.current);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchActiveAssignments, loading, userId]);

  useEffect(() => {
    if (!visible) {
      stopVibration();
      return;
    }
    Vibration.vibrate([0, 1000, 650], true);
    return () => stopVibration();
  }, [visible]);

  const onAcknowledge = async () => {
    if (!activeAssignment) return;

    const next = new Set(acknowledgedIds);
    next.add(activeAssignment.assignmentId);
    acknowledgedIdsRef.current = next;
    setAcknowledgedIds(next);

    if (storageKey) {
      await AsyncStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
    }

    if (storageDismissKey) {
      const nextDismissed = { ...dismissedMap };
      delete nextDismissed[activeAssignment.assignmentId];
      setDismissedMap(nextDismissed);
      dismissedMapRef.current = nextDismissed;
      await AsyncStorage.setItem(storageDismissKey, JSON.stringify(nextDismissed));
    }

    setVisible(false);
    stopVibration();
    router.push(`/securityofficer/currentIncident?incidentId=${activeAssignment.incidentId}`);
  };

  const onDismiss = async () => {
    if (!activeAssignment) {
      setVisible(false);
      stopVibration();
      return;
    }

    const id = activeAssignment.assignmentId;
    const next = { ...dismissedMap, [id]: new Date().toISOString() };
    setDismissedMap(next);
    dismissedMapRef.current = next;
    const key = storageDismissKey ?? (userId ? `${DISMISS_STORAGE_KEY_PREFIX}:${userId}` : null);
    if (key) await AsyncStorage.setItem(key, JSON.stringify(next));

    setVisible(false);
    stopVibration();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        void onDismiss();
      }}
    >
      <View style={styles.backdrop}>
        <LinearGradient
          colors={["#FDEFE4", "#FFEAD7", "#FFA07D"]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.card}
        >
          <Text style={styles.incidentTitle}>{activeAssignment?.incidentName ?? "NEW INCIDENT"}</Text>
          <Text style={styles.unitText}>{activeAssignment?.locationUnitNo ?? "Location Unit Pending"}</Text>

          <Text style={styles.message}>You have been assigned a new incident</Text>
          <Text style={styles.subMessage}>Please head to the location and investigate the issue</Text>

          <Pressable style={styles.ackButton} onPress={() => { void onAcknowledge(); }}>
            <Text style={styles.ackButtonText}>{"I ACKNOWLEDGE\nTHIS ASSIGNMENT"}</Text>
          </Pressable>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(10, 22, 38, 0.58)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  card: {
    width: "100%",
    maxWidth: 386,
    borderRadius: 28,
    backgroundColor: "#FDE7D9",
    borderWidth: 3,
    borderColor: "#892E0B",
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
  },
  incidentTitle: {
    fontSize: 23,
    lineHeight: 38,
    fontWeight: "900",
    color: "#792200",
    textAlign: "center",
    textTransform: "uppercase",
  },
  unitText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#00469B",
    textAlign: "center",
  },
  message: {
    marginTop: 20,
    fontSize: 24,
    lineHeight: 27,
    fontWeight: "900",
    color: "#101828",
    textAlign: "center",
  },
  subMessage: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: "800",
    color: "#B91C1C",
    textAlign: "center",
    textDecorationLine: "underline",
  },
  ackButton: {
    marginTop: 18,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#0B2D57",
    borderWidth: 1,
    borderColor: "#1C8ED8",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  ackButtonText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
  },
});
