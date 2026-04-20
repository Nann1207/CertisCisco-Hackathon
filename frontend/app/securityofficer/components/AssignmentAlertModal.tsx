import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, Vibration, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import Text from "../../../components/TranslatedText";
import { supabase } from "../../../lib/supabase";

type AssignmentRow = {
  assignment_id: string;
  incident_id: string | null;
  shift_id: string | null;
  assigned_at: string | null;
  active_status: boolean | null;
  incidents:
    | {
        incident_name: string | null;
        incident_category?: string | null;
        location_name?: string | null;
        location_description?: string | null;
        location_unit_no: string | null;
      }
    | {
        incident_name: string | null;
        incident_category?: string | null;
        location_name?: string | null;
        location_description?: string | null;
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

type AssignmentAlertModalProps = {
  officerId?: string | null;
  currentShiftId?: string | null;
  onAcknowledgeAssignment?: (assignment: AlertAssignment) => void;
};

export default function AssignmentAlertModal({
  officerId = null,
  currentShiftId = null,
  onAcknowledgeAssignment,
}: AssignmentAlertModalProps) {
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
  const buttonRotate = useRef(new Animated.Value(0)).current;

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
    async (
      activeUserId: string,
      shiftId: string | null,
      ackSet: Set<string>,
      dismissed: Record<string, string> = {}
    ) => {
      if (!shiftId) {
        setActiveAssignment(null);
        setVisible(false);
        stopVibration();
        return;
      }

      const { data, error } = await supabase
        .from("incident_assignments")
        .select(
          "assignment_id, incident_id, shift_id, assigned_at, active_status, incidents(incident_name, incident_category, location_name, location_description, location_unit_no)"
        )
        .eq("officer_id", activeUserId)
        .eq("shift_id", shiftId)
        .eq("active_status", true)
        .order("assigned_at", { ascending: false })
        .limit(20);

      if (error) {
        console.warn("[AssignmentAlertModal] assignments query failed", error.message);
        return;
      }

      const rows = (data as AssignmentRow[] | null) ?? [];
      const activeIds = new Set(rows.map((row) => row.assignment_id).filter(Boolean));

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
      const next = rows.find(
        (row) =>
          row.incident_id &&
          !effectiveAckSet.has(row.assignment_id) &&
          !prunedDismissed[row.assignment_id]
      );

      if (!next || !next.incident_id) {
        setActiveAssignment(null);
        setVisible(false);
        stopVibration();
        return;
      }

      const incident = parseIncident(next);
      const incidentName = (
        incident?.incident_name ??
        incident?.incident_category ??
        "New Incident"
      ).toUpperCase();
      const locationUnitNo = incident?.location_unit_no?.trim()
        ? `${incident.location_unit_no.trim()}`
        : "Location Unit Pending";

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

    if (officerId) {
      setUserId(officerId);
      void (async () => {
        const key = `${STORAGE_KEY_PREFIX}:${officerId}`;
        const stored = await AsyncStorage.getItem(key);
        const ids = new Set<string>(stored ? (JSON.parse(stored) as string[]) : []);

        const dismissKey = `${DISMISS_STORAGE_KEY_PREFIX}:${officerId}`;
        const storedDismissed = await AsyncStorage.getItem(dismissKey);
        const dismissed = storedDismissed ? (JSON.parse(storedDismissed) as Record<string, string>) : {};

        acknowledgedIdsRef.current = ids;
        dismissedMapRef.current = dismissed;
        setAcknowledgedIds(ids);
        setDismissedMap(dismissed);
        setLoading(false);
        await fetchActiveAssignments(officerId, currentShiftId, ids, dismissed);
      })();

      return () => {
        alive = false;
        stopVibration();
      };
    }

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

      const dismissKey = `${DISMISS_STORAGE_KEY_PREFIX}:${currentUserId}`;
      const storedDismissed = await AsyncStorage.getItem(dismissKey);
      const dismissed = storedDismissed ? (JSON.parse(storedDismissed) as Record<string, string>) : {};

      if (!alive) return;
      acknowledgedIdsRef.current = ids;
      dismissedMapRef.current = dismissed;
      setAcknowledgedIds(ids);
      setDismissedMap(dismissed);
      await fetchActiveAssignments(currentUserId, currentShiftId, ids, dismissed);
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

      const dismissKey = `${DISMISS_STORAGE_KEY_PREFIX}:${nextUserId}`;
      const storedDismissed = await AsyncStorage.getItem(dismissKey);
      const dismissed = storedDismissed ? (JSON.parse(storedDismissed) as Record<string, string>) : {};
      acknowledgedIdsRef.current = ids;
      dismissedMapRef.current = dismissed;
      setAcknowledgedIds(ids);
      setDismissedMap(dismissed);
      await fetchActiveAssignments(nextUserId, currentShiftId, ids, dismissed);
    });

    return () => {
      alive = false;
      authListener.data.subscription.unsubscribe();
      stopVibration();
    };
  }, [currentShiftId, fetchActiveAssignments, officerId]);

  useEffect(() => {
    if (!userId || loading) return;

    void fetchActiveAssignments(userId, currentShiftId, acknowledgedIdsRef.current, dismissedMapRef.current);
  }, [currentShiftId, fetchActiveAssignments, loading, userId]);

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
          await fetchActiveAssignments(userId, currentShiftId, acknowledgedIdsRef.current, dismissedMapRef.current);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentShiftId, fetchActiveAssignments, loading, userId]);

  useEffect(() => {
    if (!visible) {
      stopVibration();
      return;
    }

    Vibration.vibrate([0, 1000, 650], true);
    return () => stopVibration();
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      buttonRotate.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.timing(buttonRotate, {
        toValue: 1,
        duration: 2200,
        useNativeDriver: true,
      })
    );

    loop.start();
    return () => {
      loop.stop();
    };
  }, [buttonRotate, visible]);

  const buttonBorderRotate = buttonRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

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

    onAcknowledgeAssignment?.(activeAssignment);
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
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
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
          <View style={styles.cardContent}>
            <Text style={styles.incidentTitle}>{activeAssignment?.incidentName ?? "NEW INCIDENT"}</Text>
            <Text style={styles.unitText}>{activeAssignment?.locationUnitNo ?? "Location Unit Pending"}</Text>

            <Text style={styles.message}>You have been assigned a new incident</Text>
            <Text style={styles.subMessage}>Please head to the location and investigate the issue</Text>

            <View style={styles.ackButtonShell}>
              <View style={styles.ackButtonMask}>
                <Animated.View
                  pointerEvents="none"
                  style={[styles.ackButtonBorderSpinner, { transform: [{ rotate: buttonBorderRotate }] }]}
                >
                  <LinearGradient
                    colors={["rgba(255,255,255,0)", "#71D2FF", "#F4FAFF", "#71D2FF", "rgba(255,255,255,0)"]}
                    locations={[0, 0.22, 0.5, 0.78, 1]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.ackButtonBorderGlow}
                  />
                </Animated.View>
                <View pointerEvents="none" style={styles.ackButtonMaskFill} />
                <Pressable
                  style={styles.ackButton}
                  onPress={() => {
                    void onAcknowledge();
                  }}
                >
                  <Text style={styles.ackButtonText}>{"I ACKNOWLEDGE\nTHIS ASSIGNMENT"}</Text>
                </Pressable>
              </View>
            </View>
          </View>
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
    overflow: "hidden",
  },
  cardContent: {
    zIndex: 1,
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
  ackButtonShell: {
    marginTop: 18,
  },
  ackButtonMask: {
    position: "relative",
    height: 48,
    borderRadius: 12,
    overflow: "hidden",
  },
  ackButtonBorderSpinner: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 170,
    height: 170,
    marginLeft: -85,
    marginTop: -85,
  },
  ackButtonBorderGlow: {
    flex: 1,
  },
  ackButtonMaskFill: {
    position: "absolute",
    top: 1,
    right: 1,
    bottom: 1,
    left: 1,
    borderRadius: 11,
    backgroundColor: "#0B2D57",
  },
  ackButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    zIndex: 1,
  },
  ackButtonText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
  },
});
