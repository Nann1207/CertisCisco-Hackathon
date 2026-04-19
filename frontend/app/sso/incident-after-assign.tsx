import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";
import * as Location from "expo-location";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BellRing, Check, ChevronLeft, ClipboardPen, PhoneCall } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { resolveIncidentFrameUrls } from "../../lib/incidentFrames";
import { getProfilePhotoUrlFromPath } from "../../lib/profilePhotos";
import { supabase } from "../../lib/supabase";

type IncidentRow = {
  incident_id: string;
  incident_category: string | null;
  location_name: string | null;
  location_unit_no: string | null;
  location_description: string | null;
  latitude: number | null;
  longitude: number | null;
  cctv_image_1_path: string | null;
  cctv_image_2_path: string | null;
  cctv_image_3_path: string | null;
  cctv_image_4: string | null;
  ai_assessment: string | null;
  active_status: boolean | null;
};

type AssignmentRow = Record<string, unknown> & {
  assignment_id?: string;
  officer_id?: string | null;
  officer_name?: string | null;
  incident_id?: string | null;
  active_status?: boolean | null;
};

type EmployeeRow = {
  id: string;
  emp_id?: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  profile_photo_path: string | null;
};

type AssignedOfficer = {
  assignmentId: string;
  officerId: string;
  officerName: string;
  role: string;
  profilePhotoUrl: string | null;
};

type BackupRequestDetails = {
  assignmentId: string;
  requesterName: string;
  requestedCount: number;
  reason: string;
};

export default function SsoIncidentAfterAssignPage() {
  const router = useRouter();
  const { incidentId } = useLocalSearchParams<{ incidentId?: string }>();

  const [loading, setLoading] = useState(true);
  const [incident, setIncident] = useState<IncidentRow | null>(null);
  const [assignedOfficers, setAssignedOfficers] = useState<AssignedOfficer[]>([]);
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const [showMapModal, setShowMapModal] = useState(false);
  const [modalMapRegion, setModalMapRegion] = useState<Region | null>(null);
  const modalMapRef = useRef<MapView | null>(null);

  const [showBackupRequestModal, setShowBackupRequestModal] = useState(false);
  const [backupAttentionActive, setBackupAttentionActive] = useState(false);
  const [acknowledgedBackupRequestIds, setAcknowledgedBackupRequestIds] = useState<Set<string>>(new Set());
  const [backupRequestDetails, setBackupRequestDetails] = useState<BackupRequestDetails | null>(null);
  const [cctvUris, setCctvUris] = useState<string[]>([]);

  const addBackupPulse = useRef(new Animated.Value(0)).current;
  const channelNonceRef = useRef(0);

  useEffect(() => {
    if (!backupAttentionActive) {
      addBackupPulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(addBackupPulse, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(addBackupPulse, {
          toValue: 0,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => {
      loop.stop();
    };
  }, [addBackupPulse, backupAttentionActive]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (!incidentId) {
        if (alive) {
          setLoading(false);
          Alert.alert("Incident missing", "Please open an incident first.");
        }
        return;
      }

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

      const { data: incidentData, error: incidentError } = await supabase
        .from("incidents")
        .select(
          "incident_id, incident_category, location_name, location_unit_no, location_description, latitude, longitude, cctv_image_1_path, cctv_image_2_path, cctv_image_3_path, cctv_image_4, ai_assessment, active_status"
        )
        .eq("incident_id", incidentId)
        .eq("supervisor_id", userId)
        .maybeSingle();

      if (!alive) return;

      if (incidentError || !incidentData) {
        setLoading(false);
        Alert.alert("Load failed", incidentError?.message ?? "Incident not found for this supervisor.");
        return;
      }

      setIncident(incidentData as IncidentRow);
      await refreshAssignedOfficers(
        incidentId,
        acknowledgedBackupRequestIds,
        setAssignedOfficers,
        setShowBackupRequestModal,
        setBackupAttentionActive,
        setBackupRequestDetails
      );
      setLoading(false);
    };

    void load();

    return () => {
      alive = false;
    };
  }, [acknowledgedBackupRequestIds, incidentId]);

  useEffect(() => {
    let alive = true;

    const loadCctvUris = async () => {
      if (!incident) {
        if (alive) setCctvUris([]);
        return;
      }

      const uris = await resolveIncidentFrameUrls([
        incident.cctv_image_1_path,
        incident.cctv_image_2_path,
        incident.cctv_image_3_path,
        incident.cctv_image_4,
      ]);

      if (alive) {
        setCctvUris(uris);
      }
    };

    void loadCctvUris();
    return () => {
      alive = false;
    };
  }, [incident]);

  useEffect(() => {
    if (!incidentId) return;

    channelNonceRef.current += 1;

    const channel = supabase
      .channel(`sso-incident-after-${incidentId}-${channelNonceRef.current}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "incident_assignments",
          filter: `incident_id=eq.${incidentId}`,
        },
        async () => {
          await refreshAssignedOfficers(
            incidentId,
            acknowledgedBackupRequestIds,
            setAssignedOfficers,
            setShowBackupRequestModal,
            setBackupAttentionActive,
            setBackupRequestDetails
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [acknowledgedBackupRequestIds, incidentId]);

  useEffect(() => {
    let watcher: Location.LocationSubscription | null = null;
    let active = true;

    const setupTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      watcher = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 7000, distanceInterval: 8 },
        (pos) => {
          if (!active) return;
          setCurrentCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        }
      );
    };

    void setupTracking();
    return () => {
      active = false;
      watcher?.remove();
    };
  }, []);

  const incidentRegion = useMemo<Region>(
    () => ({
      latitude: incident?.latitude ?? 1.3006,
      longitude: incident?.longitude ?? 103.8457,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }),
    [incident?.latitude, incident?.longitude]
  );

  const incidentTitle = useMemo(() => {
    const category = (incident?.incident_category ?? "Incident").toString().trim();
    const locationName = (incident?.location_name ?? incident?.location_description ?? "Unknown Location").toString().trim();
    return `${category} AT ${locationName}`.toUpperCase();
  }, [incident?.incident_category, incident?.location_description, incident?.location_name]);

  const locationLabel = useMemo(() => {
    const unit = incident?.location_unit_no?.trim();
    return unit ? `#${unit}` : "Unit Pending";
  }, [incident?.location_unit_no]);

  const addBackupScale = addBackupPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });

  const onOpenMapModal = () => {
    setModalMapRegion(incidentRegion);
    setShowMapModal(true);
  };

  const onZoomModalMap = (direction: "in" | "out") => {
    setModalMapRegion((prev) => {
      const base = prev ?? incidentRegion;
      const factor = direction === "in" ? 0.55 : 1.8;
      const next: Region = {
        ...base,
        latitudeDelta: clamp(base.latitudeDelta * factor, 0.0008, 0.2),
        longitudeDelta: clamp(base.longitudeDelta * factor, 0.0008, 0.2),
      };
      modalMapRef.current?.animateToRegion(next, 180);
      return next;
    });
  };

  const onRecenterModalMap = () => {
    setModalMapRegion(incidentRegion);
    modalMapRef.current?.animateToRegion(incidentRegion, 180);
  };

  const onOpenAddBackup = () => {
    setBackupAttentionActive(false);
    router.push(`/sso/add-backup?incidentId=${incidentId}`);
  };

  const onSubmitIncidentReport = async () => {
    if (!incidentId) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id ?? null;
    if (!userId) {
      Alert.alert("Submit failed", "Unable to validate your session.");
      return;
    }

    const { error } = await supabase
      .from("incidents")
      .update({ active_status: false })
      .eq("incident_id", incidentId)
      .eq("supervisor_id", userId);

    if (error) {
      Alert.alert("Submit failed", error.message);
      return;
    }

    router.push(`/sso/createReport?incidentId=${incidentId}&reportType=Resolved`);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      </SafeAreaView>
    );
  }

  if (!incident) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.loaderWrap}>
          <Text style={styles.emptyText}>Incident is unavailable.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.replace("/sso/home")}>
            <Text style={styles.primaryBtnText}>Back to Home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topPanel}>
        <View style={styles.header}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/sso/home"))}
          >
            <ChevronLeft size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Incident Information</Text>
        </View>
      </View>

      <View style={styles.bodyPanel}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.incidentTitle}>{incidentTitle}</Text>
          <Text style={styles.unitText}>{locationLabel}</Text>

          <Pressable style={styles.mapCard} onPress={onOpenMapModal}>
            <MapView style={styles.map} initialRegion={incidentRegion}>
              {incident.latitude && incident.longitude ? (
                <Marker coordinate={{ latitude: incident.latitude, longitude: incident.longitude }} title="Incident" />
              ) : null}
              {currentCoords ? <Marker coordinate={currentCoords} title="You" pinColor="#2563EB" /> : null}
              {currentCoords && incident.latitude && incident.longitude ? (
                <Polyline
                  coordinates={[currentCoords, { latitude: incident.latitude, longitude: incident.longitude }]}
                  strokeColor="#D7263D"
                  strokeWidth={3}
                  lineDashPattern={[8, 6]}
                />
              ) : null}
            </MapView>
          </Pressable>

          <View style={styles.cctvRow}>
            {cctvUris.length > 0 ? (
              cctvUris.slice(0, 3).map((uri, idx) => (
                <Image key={`${uri}-${idx}`} source={{ uri }} style={styles.cctvImage} />
              ))
            ) : (
              <>
                <View style={styles.cctvPlaceholder}>
                  <Text style={styles.cctvPlaceholderText}>CCTV 1</Text>
                </View>
                <View style={styles.cctvPlaceholder}>
                  <Text style={styles.cctvPlaceholderText}>CCTV 2</Text>
                </View>
                <View style={styles.cctvPlaceholder}>
                  <Text style={styles.cctvPlaceholderText}>CCTV 3</Text>
                </View>
              </>
            )}
          </View>

          <View style={styles.actionRowTop}>
            <Animated.View style={backupAttentionActive ? { transform: [{ scale: addBackupScale }] } : null}>
              <Pressable style={[styles.actionChip, styles.actionChipWarm]} onPress={onOpenAddBackup}>
                <BellRing size={16} color="#9C2222" />
                <Text style={styles.actionChipWarmText}>Add Backup</Text>
              </Pressable>
            </Animated.View>

            <Pressable style={[styles.actionChip, styles.actionChipBlue]} onPress={() => router.push("/sso/phonecalls")}>
              <PhoneCall size={16} color="#5A6E85" />
              <Text style={styles.actionChipBlueText}>CCO</Text>
            </Pressable>
          </View>

          <View style={styles.sectionDivider} />

          <Text style={styles.sectionLabel}>AI Assessment Report</Text>
          <View style={styles.assessmentBox}>
            <Text style={styles.assessmentText}>{incident.ai_assessment?.trim() || "No AI assessment available."}</Text>
          </View>

          <Text style={styles.sectionLabel}>Assigned Officers</Text>
          <View style={styles.assignedStrip}>
            {assignedOfficers.length > 0 ? (
              assignedOfficers.map((officer) => (
                <View key={officer.assignmentId} style={styles.assignedOfficerItem}>
                  <OfficerAvatar profilePhotoUrl={officer.profilePhotoUrl} officerName={officer.officerName} />
                  <Text style={styles.assignedOfficerName} numberOfLines={1}>
                    {officer.officerName}
                  </Text>
                  <Text style={styles.assignedOfficerRole} numberOfLines={1}>
                    {officer.role}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyAssignedText}>No officers assigned yet.</Text>
            )}
          </View>

          <View style={styles.footerActionArea}>
            <LinearGradient
              colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.45)", "#FFFFFF"]}
              locations={[0.15, 0.45, 0.82]}
              style={styles.footerGlow}
            />

            <Pressable style={styles.reportBtn} onPress={() => { void onSubmitIncidentReport(); }}>
              <ClipboardPen size={19} color="#FFFFFF" />
              <Text style={styles.reportBtnText}>Incident Report</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>

      <Modal visible={showBackupRequestModal} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.requestBackdrop}>
          <View style={styles.requestCard}>
            <Text style={styles.requestTitle}>REQUEST BACKUP</Text>
            <Text style={styles.requestSubText}>
              {backupRequestDetails?.reason || "Your officers requested additional backup support."}
            </Text>
            <Text style={styles.requestNameText}>
              {(backupRequestDetails?.requesterName || "Assigned Officer")} request{" "}
              {backupRequestDetails?.requestedCount ?? 1} officer(s) for backup
            </Text>
            <Text style={styles.requestAttentionText}>Please attend to request immediately</Text>

            <Pressable
              style={styles.requestAcknowledgeBtn}
              onPress={() => {
                setShowBackupRequestModal(false);
                setBackupAttentionActive(true);
                if (backupRequestDetails?.assignmentId) {
                  setAcknowledgedBackupRequestIds((prev) => {
                    const next = new Set(prev);
                    next.add(backupRequestDetails.assignmentId);
                    return next;
                  });
                }
              }}
            >
              <Text style={styles.requestAcknowledgeText}>{"I ACKNOWLEDGE\nTHIS REQUEST"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showMapModal} animationType="slide" onRequestClose={() => setShowMapModal(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeaderTitle}>Map Navigation</Text>
            <Pressable style={styles.modalCloseBtn} onPress={() => setShowMapModal(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>

          <MapView
            ref={(ref) => {
              modalMapRef.current = ref;
            }}
            style={styles.modalMap}
            region={modalMapRegion ?? incidentRegion}
            onRegionChangeComplete={(region) => setModalMapRegion(region)}
          >
            {incident.latitude && incident.longitude ? (
              <Marker coordinate={{ latitude: incident.latitude, longitude: incident.longitude }} title="Incident" />
            ) : null}
            {currentCoords ? <Marker coordinate={currentCoords} title="You" pinColor="#2563EB" /> : null}
            {currentCoords && incident.latitude && incident.longitude ? (
              <Polyline
                coordinates={[currentCoords, { latitude: incident.latitude, longitude: incident.longitude }]}
                strokeColor="#D7263D"
                strokeWidth={3}
              />
            ) : null}
          </MapView>

          <View style={styles.modalControlsRow}>
            <Pressable style={styles.modalControlBtn} onPress={() => onZoomModalMap("out")}>
              <Text style={styles.modalControlText}>-</Text>
            </Pressable>
            <Pressable style={styles.modalControlBtn} onPress={onRecenterModalMap}>
              <Text style={styles.modalControlText}>Recenter</Text>
            </Pressable>
            <Pressable style={styles.modalControlBtn} onPress={() => onZoomModalMap("in")}>
              <Text style={styles.modalControlText}>+</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

async function refreshAssignedOfficers(
  incidentId: string,
  acknowledgedRequestIds: Set<string>,
  setAssignedOfficers: (value: AssignedOfficer[]) => void,
  setShowBackupRequestModal: (value: boolean) => void,
  setBackupAttentionActive: (value: boolean) => void,
  setBackupRequestDetails: (value: BackupRequestDetails | null) => void
) {
  const { data: assignmentData } = await supabase
    .from("incident_assignments")
    .select("*")
    .eq("incident_id", incidentId)
    .eq("active_status", true)
    .limit(200);

  const rows = (assignmentData as AssignmentRow[] | null) ?? [];

  const officerIds = Array.from(
    new Set(rows.map((item) => item.officer_id).filter((id): id is string => typeof id === "string" && id.length > 0))
  );

  let employeeMap = new Map<string, EmployeeRow>();
  if (officerIds.length > 0) {
    const { data: employeeRows } = await supabase
      .from("employees")
      .select("id, emp_id, first_name, last_name, role, profile_photo_path")
      .in("id", officerIds);

    employeeMap = new Map(((employeeRows as EmployeeRow[] | null) ?? []).map((row) => [row.id, row]));
  }

  const assigned = (
    await Promise.all(
      rows.map(async (row, index) => {
        const officerId = typeof row.officer_id === "string" ? row.officer_id : null;
        if (!officerId) return null;

        const employee = employeeMap.get(officerId) ?? null;
        const fallbackName = `${(employee?.first_name ?? "").trim()} ${(employee?.last_name ?? "").trim()}`.trim();
        const officerNameRaw = typeof row.officer_name === "string" ? row.officer_name.trim() : "";
        const officerName = officerNameRaw || fallbackName || "Assigned Officer";
        const profilePhotoUrl = await getProfilePhotoUrlFromPath(employee?.profile_photo_path ?? null);

        return {
          assignmentId: typeof row.assignment_id === "string" ? row.assignment_id : `${officerId}-${index}`,
          officerId,
          officerName,
          role: employee?.role?.trim() || "Security Officer",
          profilePhotoUrl,
        } satisfies AssignedOfficer;
      })
    )
  ).filter((item): item is AssignedOfficer => Boolean(item));

  setAssignedOfficers(assigned);

  const pendingRequest = rows.find((row, index) => {
    const dynamic = row as Record<string, unknown>;
    const requested = Boolean(
      dynamic.backup_requested ??
        dynamic.request_backup ??
        dynamic.backup_request ??
        dynamic.request_additional_officers ??
        dynamic.needs_backup
    );

    if (!requested) return false;
    const assignmentId =
      typeof row.assignment_id === "string" ? row.assignment_id : `${row.officer_id ?? "officer"}-${index}`;
    return !acknowledgedRequestIds.has(assignmentId);
  });

  if (pendingRequest) {
    const dynamic = pendingRequest as Record<string, unknown>;
    const assignmentId =
      typeof pendingRequest.assignment_id === "string"
        ? pendingRequest.assignment_id
        : `${pendingRequest.officer_id ?? "officer"}-request`;

    const countRaw =
      dynamic.backup_requested_count ??
      dynamic.request_backup_count ??
      dynamic.requested_officer_count ??
      dynamic.backup_count ??
      1;
    const requestedCount = Math.max(1, Number.parseInt(String(countRaw), 10) || 1);

    const reasonRaw =
      dynamic.backup_reason ??
      dynamic.request_backup_reason ??
      dynamic.backup_request_reason ??
      "";
    const reason = String(reasonRaw ?? "").trim();

    const requesterNameRaw =
      (typeof pendingRequest.officer_name === "string" ? pendingRequest.officer_name : "") || "Assigned Officer";

    setBackupRequestDetails({
      assignmentId,
      requesterName: requesterNameRaw,
      requestedCount,
      reason,
    });
    setShowBackupRequestModal(true);
    setBackupAttentionActive(true);
    return;
  }

  setBackupRequestDetails(null);
}

function OfficerAvatar({ profilePhotoUrl, officerName }: { profilePhotoUrl: string | null; officerName: string }) {
  if (profilePhotoUrl) {
    return <Image source={{ uri: profilePhotoUrl }} style={styles.assignedAvatar} />;
  }

  const initials = officerName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "SO";

  return (
    <View style={[styles.assignedAvatar, styles.assignedAvatarFallback]}>
      <Text style={styles.assignedAvatarInitials}>{initials}</Text>
    </View>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0E2D52",
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  primaryBtn: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  topPanel: {
    backgroundColor: "#0E2D52",
    paddingBottom: 2,
  },
  header: {
    paddingHorizontal: 12,
    paddingTop: 40,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    marginHorizontal: 10,
    color: "#FFFFFF",
    fontSize: 24,
    lineHeight: 22,
    fontWeight: "600",
  },
  bodyPanel: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 32,
  },
  incidentTitle: {
    color: "#0E2D52",
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  unitText: {
    marginTop: 4,
    color: "#0062FF",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  mapCard: {
    marginTop: 10,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D9E2EC",
  },
  map: {
    height: 214,
    width: "100%",
  },
  cctvRow: {
    marginTop: 8,
    flexDirection: "row",
    gap: 8,
  },
  cctvImage: {
    flex: 1,
    height: 103,
    borderRadius: 10,
    backgroundColor: "#D7DEE8",
  },
  cctvPlaceholder: {
    flex: 1,
    height: 103,
    borderRadius: 10,
    backgroundColor: "#D7DEE8",
    alignItems: "center",
    justifyContent: "center",
  },
  cctvPlaceholderText: {
    color: "#5B6472",
    fontWeight: "700",
    fontSize: 12,
  },
  actionRowTop: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  actionChip: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    shadowColor: "#0E2D52",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  actionChipWarm: {
    backgroundColor: "#FFEBDD",
    borderColor: "rgba(160,176,192,0.4)",
  },
  actionChipWarmText: {
    color: "#9C2222",
    fontSize: 11,
    fontWeight: "700",
  },
  actionChipBlue: {
    backgroundColor: "#EEF7FF",
    borderColor: "rgba(160,176,192,0.4)",
  },
  actionChipBlueText: {
    color: "#5A6E85",
    fontSize: 11,
    fontWeight: "700",
  },
  sectionDivider: {
    marginTop: 12,
    height: 4,
    backgroundColor: "#F1F1F1",
    borderRadius: 999,
  },
  sectionLabel: {
    marginTop: 12,
    color: "#0E2D52",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  assessmentBox: {
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#5B9AC2",
    backgroundColor: "#E9F2F5",
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 78,
  },
  assessmentText: {
    color: "#000000",
    fontSize: 16,
    lineHeight: 18,
    fontWeight: "400",
  },
  assignedStrip: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    minHeight: 86,
  },
  assignedOfficerItem: {
    width: 84,
    alignItems: "center",
  },
  assignedAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#CBD5E1",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  assignedAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0E2D52",
  },
  assignedAvatarInitials: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  assignedOfficerName: {
    marginTop: 6,
    color: "#243B53",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    width: "100%",
  },
  assignedOfficerRole: {
    marginTop: 1,
    color: "#6B7280",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    width: "100%",
  },
  emptyAssignedText: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "600",
  },
  footerActionArea: {
    marginTop: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 74,
  },
  footerGlow: {
    position: "absolute",
    left: -18,
    right: -18,
    top: -10,
    bottom: -8,
  },
  reportBtn: {
    minHeight: 40,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
    backgroundColor: "#0E2D52",
    borderWidth: 1,
    borderColor: "rgba(160,176,192,0.4)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#0E2D52",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  reportBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  requestBackdrop: {
    flex: 1,
    backgroundColor: "rgba(10, 22, 38, 0.62)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  requestCard: {
    width: "100%",
    maxWidth: 390,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: "#A21CAF",
    backgroundColor: "#F4E6D8",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  requestTitle: {
    color: "#10345F",
    fontSize: 42,
    fontWeight: "900",
    textAlign: "center",
  },
  requestSubText: {
    marginTop: 8,
    color: "#6B7280",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
  },
  requestNameText: {
    marginTop: 14,
    color: "#111827",
    textAlign: "center",
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "900",
  },
  requestAttentionText: {
    marginTop: 12,
    color: "#DC2626",
    textDecorationLine: "underline",
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
  },
  requestAcknowledgeBtn: {
    marginTop: 16,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#0B2D57",
    borderWidth: 1,
    borderColor: "#1C8ED8",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  requestAcknowledgeText: {
    color: "#FFFFFF",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "900",
  },
  modalWrap: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  modalHeader: {
    paddingHorizontal: 14,
    paddingTop: 40,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#123A67",
  },
  modalHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  modalCloseBtn: {
    minWidth: 72,
    height: 34,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  modalCloseText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  modalMap: {
    flex: 1,
  },
  modalControlsRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 20,
    backgroundColor: "#123A67",
  },
  modalControlBtn: {
    minWidth: 92,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  modalControlText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
