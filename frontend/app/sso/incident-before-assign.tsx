import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { BellRing, ChevronLeft, Settings2 } from "lucide-react-native";
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

export default function SsoIncidentBeforeAssignPage() {
  const router = useRouter();
  const { incidentId } = useLocalSearchParams<{ incidentId?: string }>();

  const [loading, setLoading] = useState(true);
  const [incident, setIncident] = useState<IncidentRow | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [modalMapRegion, setModalMapRegion] = useState<Region | null>(null);
  const modalMapRef = useRef<MapView | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (!incidentId) {
        if (alive) {
          setLoading(false);
          Alert.alert("Incident missing", "Please open an incident from SSO home.");
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

      const { data, error } = await supabase
        .from("incidents")
        .select(
          "incident_id, incident_category, location_name, location_unit_no, location_description, latitude, longitude, cctv_image_1, cctv_image_2, cctv_image_3, ai_assessment, active_status"
        )
        .eq("incident_id", incidentId)
        .eq("supervisor_id", userId)
        .maybeSingle();

      if (!alive) return;

      if (error || !data) {
        setLoading(false);
        Alert.alert("Load failed", error?.message ?? "Incident not found for this supervisor.");
        return;
      }

      setIncident(data as IncidentRow);
      setLoading(false);
    };

    void load();
    return () => {
      alive = false;
    };
  }, [incidentId]);

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
          <Pressable style={styles.mapHint} onPress={onOpenMapModal}>
            <Text style={styles.mapHintText}>Tap map to open navigation view</Text>
          </Pressable>

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

          <Text style={styles.assessmentTitle}>AI Assessment Report</Text>
          <View style={styles.assessmentBox}>
            <Text style={styles.assessmentText}>{incident.ai_assessment?.trim() || "No AI assessment available."}</Text>
          </View>

          <Pressable
            style={styles.dispatchBtn}
            onPress={() => router.push(`/sso/assign-officer?incidentId=${incident.incident_id}`)}
          >
            <BellRing size={22} color="#FFFFFF" />
            <Text style={styles.dispatchBtnText}>Dispatch Officers Now</Text>
          </Pressable>
        </View>
      </ScrollView>

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
  mapHint: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#E7EDF6",
  },
  mapHintText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#274C77",
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
  dispatchBtn: {
    marginTop: 20,
    alignSelf: "center",
    minHeight: 56,
    paddingHorizontal: 22,
    borderRadius: 30,
    backgroundColor: "#D60000",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#D60000",
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 10,
    borderWidth: 2,
    borderColor: "#F2D7D7",
  },
  dispatchBtnText: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "800",
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
