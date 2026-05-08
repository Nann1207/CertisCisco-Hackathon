import { LinearGradient } from "expo-linear-gradient";
import { usePathname, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Vibration, View } from "react-native";
import Text from "../../../components/TranslatedText";
import { supabase } from "../../../lib/supabase";

type BackupRequestDetails = {
  assignmentId: string;
  incidentId: string;
  requesterName: string;
  requestedCount: number;
  reason: string;
};

type AssignmentRow = {
  assignment_id?: string | null;
  incident_id?: string | null;
  officer_id?: string | null;
  officer_name?: string | null;
  active_status?: boolean | null;
  backup_requested?: boolean | number | string | null;
  request_backup?: boolean | number | string | null;
  backup_request?: boolean | number | string | null;
  request_additional_officers?: boolean | number | string | null;
  needs_backup?: boolean | number | string | null;
  backup_amount?: number | string | null;
  backup_requested_count?: number | string | null;
  request_backup_count?: number | string | null;
  requested_officer_count?: number | string | null;
  backup_count?: number | string | null;
  backup_reason?: string | null;
  request_backup_reason?: string | null;
  backup_request_reason?: string | null;
};

type IncidentRow = {
  incident_id: string;
};

const POLL_INTERVAL_MS = 8000;

export default function BackupRequestAlertModal() {
  const router = useRouter();
  const pathname = usePathname();
  const channelNonceRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const [supervisorId, setSupervisorId] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<BackupRequestDetails | null>(null);
  const isOnAddBackupPage = pathname === "/sso/add-backup";

  const stopVibration = () => {
    Vibration.cancel();
  };

  const loadPendingRequest = useCallback(async () => {
    if (!supervisorId) {
      setPendingRequest(null);
      return;
    }

    if (isOnAddBackupPage) {
      setPendingRequest(null);
      return;
    }

    const { data: incidentRows, error: incidentError } = await supabase
      .from("incidents")
      .select("incident_id")
      .eq("supervisor_id", supervisorId)
      .eq("active_status", true)
      .limit(200);

    if (incidentError) {
      console.warn("[BackupRequestAlertModal] incidents query failed:", incidentError.message);
      return;
    }

    const incidentIds = ((incidentRows as IncidentRow[] | null) ?? [])
      .map((row) => row.incident_id)
      .filter(Boolean);

    if (incidentIds.length === 0) {
      setPendingRequest(null);
      return;
    }

    const { data: assignmentRows, error: assignmentError } = await supabase
      .from("incident_assignments")
      .select("*")
      .in("incident_id", incidentIds)
      .eq("active_status", true)
      .limit(300);

    if (assignmentError) {
      console.warn("[BackupRequestAlertModal] assignments query failed:", assignmentError.message);
      return;
    }

    const nextRequest =
      ((assignmentRows as AssignmentRow[] | null) ?? [])
        .filter((row) => Boolean(row.incident_id))
        .filter(hasRequestedBackup)
        .map(toBackupRequestDetails)
        .find((request) => Boolean(request.incidentId)) ?? null;

    setPendingRequest(nextRequest);
  }, [isOnAddBackupPage, supervisorId]);

  useEffect(() => {
    let alive = true;

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setSupervisorId(data.session?.user.id ?? null);
    };

    void loadSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupervisorId(session?.user.id ?? null);
      if (!session?.user.id) {
        setPendingRequest(null);
      }
    });

    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void loadPendingRequest();
  }, [loadPendingRequest, pathname]);

  useEffect(() => {
    if (!supervisorId) return;

    const interval = setInterval(() => {
      void loadPendingRequest();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [loadPendingRequest, supervisorId]);

  useEffect(() => {
    if (!supervisorId) return;

    const channel = supabase
      .channel(`sso-backup-request-alert-${supervisorId}-${channelNonceRef.current}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "incident_assignments",
        },
        () => {
          void loadPendingRequest();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadPendingRequest, supervisorId]);

  const openAddBackup = () => {
    if (!pendingRequest) return;
    stopVibration();
    setPendingRequest(null);
    router.push(`/sso/add-backup?incidentId=${pendingRequest.incidentId}`);
  };

  const visible = Boolean(pendingRequest);

  useEffect(() => {
    if (!visible) {
      stopVibration();
      return;
    }

    Vibration.vibrate([0, 950, 700], true);
    return () => stopVibration();
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={styles.requestBackdrop}>
        <LinearGradient
          colors={["#FFEAD7", "#9d84b9", "#6700D5"]}
          locations={[0.4, 0.7, 1]}
          start={{ x: 0.1, y: 0.08 }}
          end={{ x: 0.92, y: 1 }}
          style={styles.requestCard}
        >
          <Text style={styles.requestTitle}>REQUEST BACKUP</Text>
          <Text style={styles.requestSubText}>
            {pendingRequest?.reason || "Your officers requested additional backup support."}
          </Text>
          <Text style={styles.requestNameText}>
            {(pendingRequest?.requesterName || "Assigned Officer")} request{" "}
            {pendingRequest?.requestedCount ?? 1} officer(s) for backup
          </Text>
          <Text style={styles.requestAttentionText}>Please attend to request immediately</Text>
          <View style={styles.requestAlertRule} />

          <Pressable
            style={styles.requestAcknowledgeBtn}
            onPress={() => {
              void openAddBackup();
            }}
          >
            <LinearGradient
              colors={["#0E2D52", "#09213D"]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.requestAcknowledgeBtnGradient}
            >
              <Text style={styles.requestAcknowledgeText}>ADD BACKUP OFFICERS</Text>
            </LinearGradient>
          </Pressable>
        </LinearGradient>
      </View>
    </Modal>
  );
}

function hasRequestedBackup(row: AssignmentRow) {
  const rawRequested =
    row.backup_requested ??
    row.request_backup ??
    row.backup_request ??
    row.request_additional_officers ??
    row.needs_backup;

  const normalizedRequested =
    rawRequested === true ||
    rawRequested === 1 ||
    rawRequested === "1" ||
    String(rawRequested ?? "").trim().toLowerCase() === "true";

  const hasBackupAmount =
    row.backup_amount !== null &&
    row.backup_amount !== undefined &&
    String(row.backup_amount).trim().length > 0 &&
    Number.parseInt(String(row.backup_amount), 10) > 0;

  return normalizedRequested || hasBackupAmount;
}

function toBackupRequestDetails(row: AssignmentRow): BackupRequestDetails {
  const countRaw =
    row.backup_amount ??
    row.backup_requested_count ??
    row.request_backup_count ??
    row.requested_officer_count ??
    row.backup_count ??
    1;

  const reasonRaw =
    row.backup_reason ??
    row.request_backup_reason ??
    row.backup_request_reason ??
    "";

  return {
    assignmentId: row.assignment_id || `${row.officer_id ?? "officer"}-${row.incident_id ?? "incident"}`,
    incidentId: row.incident_id ?? "",
    requesterName: row.officer_name?.trim() || "Assigned Officer",
    requestedCount: Math.max(1, Number.parseInt(String(countRaw), 10) || 1),
    reason: String(reasonRaw ?? "").trim(),
  };
}

const styles = StyleSheet.create({
  requestBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.73)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  requestCard: {
    width: "100%",
    maxWidth: 362,
    minHeight: 253,
    borderRadius: 27,
    borderWidth: 3,
    borderColor: "#650B89",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 14,
  },
  requestTitle: {
    color: "#0E2D52",
    fontSize: 22,
    lineHeight: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  requestSubText: {
    marginTop: 4,
    color: "rgba(85, 55, 106, 0.65)",
    textAlign: "center",
    fontSize: 13,
    lineHeight: 13,
    fontWeight: "700",
  },
  requestNameText: {
    marginTop: 30,
    color: "#111827",
    textAlign: "center",
    fontSize: 23,
    lineHeight: 22,
    fontWeight: "900",
  },
  requestAttentionText: {
    marginTop: 8,
    color: "#D70B0B",
    textAlign: "center",
    fontSize: 12,
    lineHeight: 22,
    fontWeight: "600",
    textShadowColor: "rgba(255, 255, 255, 0.76)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4.3,
  },
  requestAlertRule: {
    alignSelf: "center",
    marginTop: 2,
    width: 201,
    borderTopWidth: 2,
    borderTopColor: "#E20000",
  },
  requestAcknowledgeBtn: {
    alignSelf: "center",
    marginTop: 14,
    width: 292,
    height: 51,
    borderRadius: 12,
    overflow: "hidden",
  },
  requestAcknowledgeBtnGradient: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(170, 195, 199, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  requestAcknowledgeText: {
    color: "#E6E6E6",
    textAlign: "center",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
});
