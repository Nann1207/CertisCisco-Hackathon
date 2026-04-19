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
import { useLocalSearchParams, useRouter } from "expo-router";
import { BellRing, ChevronLeft, ClipboardPen, PhoneCall, Settings2 } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";

type IncidentRow = {
  incident_id: string;
  incident_category: string | null;
  location_name: string | null;
  location_unit_no: string | null;
  location_description: string | null;
  latitude: number | null;
  longitude: number | null;
  cctv_image_1: string | null;
  cctv_image_2: string | null;
  cctv_image_3: string | null;
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
  profilePhotoPath: string | null;
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
  const [backupAcknowledged, setBackupAcknowledged] = useState(false);

  const addBackupPulse = useRef(new Animated.Value(0)).current;

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
          "incident_id, incident_category, location_name, location_unit_no, location_description, latitude, longitude, cctv_image_1, cctv_image_2, cctv_image_3, ai_assessment, active_status"
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
      await refreshAssignedOfficers(incidentId, !backupAcknowledged, setAssignedOfficers, setShowBackupRequestModal, setBackupAttentionActive);
      setLoading(false);
    };

    void load();

    return () => {
      alive = false;
    };
  }, [backupAcknowledged, incidentId]);

  useEffect(() => {
    if (!incidentId) return;

    const channel = supabase
      .channel(`sso-incident-after-${incidentId}`)
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
            !backupAcknowledged,
            setAssignedOfficers,
            setShowBackupRequestModal,
            setBackupAttentionActive
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [backupAcknowledged, incidentId]);

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
    const category = (incident?.incident_category ?? "Incident").toString();
    const locationName = (incident?.location_name ?? incident?.location_description ?? "Unknown Location").toString();
    return `${category} AT ${locationName}`;
  }, [incident?.incident_category, incident?.location_description, incident?.location_name]);

  const cctvUris = useMemo(() => extractCctvUris(incident), [incident]);

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
        <View style={styles.centeredWrap}>
          <ActivityIndicator color="#123A67" />
        </View>
      </SafeAreaView>
    );
  }

  if (!incident) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centeredWrap}>
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
      <View style={styles.header}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/sso/home"))}
        >
          <ChevronLeft size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Incident Information</Text>
        <Pressable style={styles.iconBtn}>
          <Settings2 size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.incidentTitle}>{incidentTitle}</Text>
          <Text style={styles.unitText}>
            {incident.location_unit_no?.trim() ? `#${incident.location_unit_no?.trim()}` : "Unit Pending"}
          </Text>

          <MapView style={styles.map} initialRegion={incidentRegion} onPress={onOpenMapModal}>
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

          <View style={styles.cctvRow}>
            {cctvUris.length > 0 ? (
              cctvUris.slice(0, 3).map((uri, idx) => <Image key={`${uri}-${idx}`} source={{ uri }} style={styles.cctvImage} />)
            ) : (
              <>
                <View style={styles.cctvPlaceholder}><Text style={styles.cctvPlaceholderText}>CCTV 1</Text></View>
                <View style={styles.cctvPlaceholder}><Text style={styles.cctvPlaceholderText}>CCTV 2</Text></View>
                <View style={styles.cctvPlaceholder}><Text style={styles.cctvPlaceholderText}>CCTV 3</Text></View>
              </>
            )}
          </View>

          <View style={styles.actionRowTop}>
            <Animated.View style={backupAttentionActive ? { transform: [{ scale: addBackupScale }] } : null}>
              <Pressable style={[styles.actionChip, styles.actionChipWarm]} onPress={onOpenAddBackup}>
                <BellRing size={16} color="#991B1B" />
                <Text style={styles.actionChipWarmText}>Add Backup</Text>
              </Pressable>
            </Animated.View>

            <Pressable style={[styles.actionChip, styles.actionChipBlue]} onPress={() => router.push("/sso/phonecalls")}>
              <PhoneCall size={16} color="#587493" />
              <Text style={styles.actionChipBlueText}>CCO</Text>
            </Pressable>
          </View>

          <Text style={styles.assessmentTitle}>AI Assessment Report</Text>
          <View style={styles.assessmentBox}>
            <Text style={styles.assessmentText}>{incident.ai_assessment?.trim() || "No AI assessment available."}</Text>
          </View>

          <Text style={styles.assignedTitle}>Assigned Officers</Text>
          <View style={styles.assignedRow}>
            {assignedOfficers.length > 0 ? (
              assignedOfficers.map((officer) => (
                <View key={officer.assignmentId} style={styles.assignedOfficerItem}>
                  <OfficerAvatar profilePhotoPath={officer.profilePhotoPath} officerName={officer.officerName} />
                  <Text style={styles.assignedOfficerName} numberOfLines={1}>{officer.officerName}</Text>
                  <Text style={styles.assignedOfficerRole} numberOfLines={1}>{officer.role}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyAssignedText}>No officers assigned yet.</Text>
            )}
          </View>

          <Pressable style={styles.reportBtn} onPress={() => { void onSubmitIncidentReport(); }}>
            <ClipboardPen size={20} color="#FFFFFF" />
            <Text style={styles.reportBtnText}>Incident Report</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={showBackupRequestModal} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.requestBackdrop}>
          <View style={styles.requestCard}>
            <Text style={styles.requestTitle}>REQUEST BACKUP</Text>
            <Text style={styles.requestSubText}>Your officers requested additional backup support.</Text>
            <Text style={styles.requestAttentionText}>Please attend to request immediately</Text>

            <Pressable
              style={styles.requestAcknowledgeBtn}
              onPress={() => {
                setShowBackupRequestModal(false);
                setBackupAcknowledged(true);
                setBackupAttentionActive(true);
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
  shouldTriggerBackupModal: boolean,
  setAssignedOfficers: (value: AssignedOfficer[]) => void,
  setShowBackupRequestModal: (value: boolean) => void,
  setBackupAttentionActive: (value: boolean) => void
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
      .select("id, first_name, last_name, role, profile_photo_path")
      .in("id", officerIds);

    employeeMap = new Map(
      ((employeeRows as EmployeeRow[] | null) ?? []).map((row) => [row.id, row])
    );
  }

  const assigned = rows
    .map((row, index) => {
      const officerId = typeof row.officer_id === "string" ? row.officer_id : null;
      if (!officerId) return null;

      const employee = employeeMap.get(officerId) ?? null;
      const fallbackName = `${(employee?.first_name ?? "").trim()} ${(employee?.last_name ?? "").trim()}`.trim();
      const officerNameRaw = typeof row.officer_name === "string" ? row.officer_name.trim() : "";
      const officerName = officerNameRaw || fallbackName || "Assigned Officer";

      return {
        assignmentId: typeof row.assignment_id === "string" ? row.assignment_id : `${officerId}-${index}`,
        officerId,
        officerName,
        role: employee?.role?.trim() || "Security Officer",
        profilePhotoPath: employee?.profile_photo_path ?? null,
      } satisfies AssignedOfficer;
    })
    .filter((item): item is AssignedOfficer => Boolean(item));

  setAssignedOfficers(assigned);

  const hasBackupRequest = rows.some((row) => {
    const dynamic = row as Record<string, unknown>;
    return Boolean(
      dynamic.backup_requested ??
        dynamic.request_backup ??
        dynamic.backup_request ??
        dynamic.request_additional_officers ??
        dynamic.needs_backup
    );
  });

  if (hasBackupRequest && shouldTriggerBackupModal) {
    setShowBackupRequestModal(true);
    setBackupAttentionActive(true);
  }
}

function OfficerAvatar({ profilePhotoPath, officerName }: { profilePhotoPath: string | null; officerName: string }) {
  if (profilePhotoPath && /^https?:\/\//i.test(profilePhotoPath)) {
    return <Image source={{ uri: profilePhotoPath }} style={styles.assignedAvatar} />;
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

function extractCctvUris(incident: IncidentRow | null) {
  if (!incident) return [] as string[];
  const raw = [incident.cctv_image_1, incident.cctv_image_2, incident.cctv_image_3];
  return raw.filter((item): item is string => Boolean(item && item.startsWith("http")));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ECEDEF" },
  centeredWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  emptyText: {
    fontSize: 15,
    color: "#475569",
  },
  header: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: "#133762",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  scrollContent: {
    paddingHorizontal: 10,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: "#EFF0F1",
    borderRadius: 24,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 14,
    borderLeftWidth: 8,
    borderLeftColor: "#6589BD",
  },
  incidentTitle: {
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "900",
    color: "#163A67",
    textTransform: "uppercase",
  },
  unitText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0059D6",
    marginBottom: 8,
  },
  map: {
    height: 130,
    borderRadius: 10,
    overflow: "hidden",
  },
  cctvRow: {
    marginTop: 8,
    flexDirection: "row",
    gap: 4,
  },
  cctvImage: {
    flex: 1,
    height: 90,
    borderRadius: 6,
  },
  cctvPlaceholder: {
    flex: 1,
    height: 90,
    borderRadius: 6,
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
    alignItems: "center",
    gap: 8,
  },
  actionChip: {
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
  },
  actionChipWarm: {
    backgroundColor: "#FFE9E2",
    borderColor: "#F4C2B3",
  },
  actionChipWarmText: {
    color: "#B42318",
    fontSize: 20,
    fontWeight: "800",
  },
  actionChipBlue: {
    backgroundColor: "#E6F3FF",
    borderColor: "#BAD9F2",
  },
  actionChipBlueText: {
    color: "#587493",
    fontSize: 20,
    fontWeight: "800",
  },
  assessmentTitle: {
    marginTop: 12,
    fontSize: 28,
    fontWeight: "800",
    color: "#163A67",
  },
  assessmentBox: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#5F9BD3",
    backgroundColor: "#D4DDE2",
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 98,
  },
  assessmentText: {
    color: "#2F4E73",
    fontSize: 19,
    lineHeight: 28,
  },
  assignedTitle: {
    marginTop: 12,
    color: "#163A67",
    fontSize: 24,
    fontWeight: "800",
  },
  assignedRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 10,
  },
  assignedOfficerItem: {
    width: 90,
    alignItems: "center",
  },
  assignedAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#CBD5E1",
  },
  assignedAvatarFallback: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0E2D52",
  },
  assignedAvatarInitials: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  assignedOfficerName: {
    marginTop: 4,
    color: "#374151",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  assignedOfficerRole: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyAssignedText: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "600",
  },
  reportBtn: {
    marginTop: 16,
    alignSelf: "center",
    minHeight: 42,
    borderRadius: 22,
    backgroundColor: "#0E2D52",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  reportBtnText: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
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
  primaryBtn: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#123A67",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
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
