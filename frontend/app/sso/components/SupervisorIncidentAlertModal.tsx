import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Vibration, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import Text from "../../../components/TranslatedText";
import { supabase } from "../../../lib/supabase";

type IncidentRow = {
  incident_id: string;
  incident_category: string | null;
  location_name: string | null;
  location_description: string | null;
  active_status: boolean | null;
  created_at: string | null;
};

type AlertIncident = {
  incidentId: string;
  title: string;
  locationText: string;
};

type SupervisorIncidentAlertModalProps = {
  supervisorId?: string | null;
};

const STORAGE_KEY_PREFIX = "supervisor_incident_acknowledged_ids";
const DISMISS_STORAGE_KEY_PREFIX = "supervisor_incident_dismissed_map";

export default function SupervisorIncidentAlertModal({ supervisorId = null }: SupervisorIncidentAlertModalProps) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const [activeIncident, setActiveIncident] = useState<AlertIncident | null>(null);
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const [dismissedMap, setDismissedMap] = useState<Record<string, string>>({});
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
    dismissedMapRef.current = dismissedMap;
  }, [dismissedMap]);

  const fetchActiveIncidents = useCallback(
    async (activeUserId: string, ackSet: Set<string>, dismissed: Record<string, string> = {}) => {
      const { data, error } = await supabase
        .from("incidents")
        .select("incident_id, incident_category, location_name, location_description, active_status, created_at")
        .eq("supervisor_id", activeUserId)
        .eq("active_status", true)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.warn("[SupervisorIncidentAlertModal] incidents query failed", error.message);
        return;
      }

      const rows = (data as IncidentRow[] | null) ?? [];
      const activeIds = new Set(rows.map((row) => row.incident_id).filter(Boolean));

      const prunedAckSet = new Set(Array.from(ackSet).filter((id) => activeIds.has(id)));
      if (prunedAckSet.size !== ackSet.size) {
        acknowledgedIdsRef.current = prunedAckSet;
        setAcknowledgedIds(prunedAckSet);
        await AsyncStorage.setItem(`${STORAGE_KEY_PREFIX}:${activeUserId}`, JSON.stringify(Array.from(prunedAckSet)));
      }

      const prunedDismissed = Object.fromEntries(Object.entries(dismissed).filter(([id]) => activeIds.has(id)));
      if (JSON.stringify(prunedDismissed) !== JSON.stringify(dismissed)) {
        setDismissedMap(prunedDismissed);
        await AsyncStorage.setItem(`${DISMISS_STORAGE_KEY_PREFIX}:${activeUserId}`, JSON.stringify(prunedDismissed));
      }

      const effectiveAckSet = prunedAckSet.size !== ackSet.size ? prunedAckSet : ackSet;
      const next = rows.find((row) => row.incident_id && !effectiveAckSet.has(row.incident_id) && !prunedDismissed[row.incident_id]);

      if (!next) {
        setActiveIncident(null);
        setVisible(false);
        stopVibration();
        return;
      }

      const category = (next.incident_category ?? "New Incident").toUpperCase();
      const location = (next.location_name ?? next.location_description ?? "Location Pending").trim();

      setActiveIncident({
        incidentId: next.incident_id,
        title: `${category}${location ? ` AT ${location.toUpperCase()}` : ""}`,
        locationText: location || "Location Pending",
      });
      setVisible(true);
    },
    []
  );

  useEffect(() => {
    let alive = true;

    if (supervisorId) {
      setUserId(supervisorId);
      void (async () => {
        const key = `${STORAGE_KEY_PREFIX}:${supervisorId}`;
        const stored = await AsyncStorage.getItem(key);
        const ids = new Set<string>(stored ? (JSON.parse(stored) as string[]) : []);

        const dKey = `${DISMISS_STORAGE_KEY_PREFIX}:${supervisorId}`;
        const storedDismissed = await AsyncStorage.getItem(dKey);
        const dismissed = storedDismissed ? (JSON.parse(storedDismissed) as Record<string, string>) : {};

        acknowledgedIdsRef.current = ids;
        setAcknowledgedIds(ids);
        setDismissedMap(dismissed);
        dismissedMapRef.current = dismissed;
        setLoading(false);
        await fetchActiveIncidents(supervisorId, ids, dismissed);
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

      const dKey = `${DISMISS_STORAGE_KEY_PREFIX}:${currentUserId}`;
      const storedDismissed = await AsyncStorage.getItem(dKey);
      const dismissed = storedDismissed ? (JSON.parse(storedDismissed) as Record<string, string>) : {};

      if (!alive) return;
      acknowledgedIdsRef.current = ids;
      setAcknowledgedIds(ids);
      setDismissedMap(dismissed);
      dismissedMapRef.current = dismissed;
      await fetchActiveIncidents(currentUserId, ids, dismissed);
      if (alive) setLoading(false);
    };

    void bootstrap();

    const authListener = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextUserId = session?.user?.id ?? null;
      setUserId(nextUserId);

      if (!nextUserId) {
        acknowledgedIdsRef.current = new Set();
        setAcknowledgedIds(new Set());
        setActiveIncident(null);
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
      setAcknowledgedIds(ids);
      setDismissedMap(dismissed);
      dismissedMapRef.current = dismissed;
      await fetchActiveIncidents(nextUserId, ids, dismissed);
    });

    return () => {
      alive = false;
      authListener.data.subscription.unsubscribe();
      stopVibration();
    };
  }, [fetchActiveIncidents, supervisorId]);

  useEffect(() => {
    if (!userId || loading) return;

    const channel = supabase
      .channel(`sso-incident-alert-${userId}-${channelNonceRef.current}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "incidents",
          filter: `supervisor_id=eq.${userId}`,
        },
        async () => {
          await fetchActiveIncidents(userId, acknowledgedIdsRef.current, dismissedMapRef.current);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchActiveIncidents, loading, userId]);

  useEffect(() => {
    if (!visible) {
      stopVibration();
      return;
    }

    Vibration.vibrate([0, 950, 700], true);
    return () => stopVibration();
  }, [visible]);

  const onAcknowledge = async () => {
    if (!activeIncident) return;

    const next = new Set(acknowledgedIds);
    next.add(activeIncident.incidentId);
    acknowledgedIdsRef.current = next;
    setAcknowledgedIds(next);

    if (storageKey) {
      await AsyncStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
    }

    if (storageDismissKey) {
      const nextDismissed = { ...dismissedMap };
      delete nextDismissed[activeIncident.incidentId];
      setDismissedMap(nextDismissed);
      dismissedMapRef.current = nextDismissed;
      await AsyncStorage.setItem(storageDismissKey, JSON.stringify(nextDismissed));
    }

    setVisible(false);
    stopVibration();
    router.push(`/sso/incident-before-assign?incidentId=${activeIncident.incidentId}`);
  };

  const onDismiss = async () => {
    if (!activeIncident) {
      setVisible(false);
      stopVibration();
      return;
    }

    const id = activeIncident.incidentId;
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
          colors={["#FBEBD8", "#F7DBD3", "#D7B8F0"]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.95, y: 1 }}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>NEW INCIDENT ASSIGNED</Text>
          <Text style={styles.subtleText}>You are now in charge of this incident as supervisor.</Text>

          <Text style={styles.incidentTitle}>{activeIncident?.title ?? "NEW INCIDENT"}</Text>
          <Text style={styles.locationText}>{activeIncident?.locationText ?? "Location Pending"}</Text>

          <Text style={styles.warningText}>
            Quickly assign security officers{"\n"}
            to this incident.
        </Text>

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
    maxWidth: 390,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: "#7E22CE",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  cardTitle: {
    color: "#10345F",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 34,
  },
  subtleText: {
    color: "#6B7280",
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
  },
  incidentTitle: {
    marginTop: 16,
    color: "#0F172A",
    fontSize: 38,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 42,
  },
  locationText: {
    marginTop: 6,
    color: "#0F172A",
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
  },
  warningText: {
    marginTop: 12,
    color: "#B91C1C",
    textAlign: "center",
    fontSize: 18,
    textDecorationLine: "underline",
    fontWeight: "700",
  },
  ackButton: {
    marginTop: 18,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#0B2D57",
    borderWidth: 1,
    borderColor: "#1C8ED8",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  ackButtonText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
  },
});
