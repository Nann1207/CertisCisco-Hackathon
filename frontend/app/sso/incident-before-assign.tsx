import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import { BellRing, ChevronLeft, Settings2 } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { resolveIncidentFrameUrls } from "../../lib/incidentFrames";
import { getProfilePhotoUrlFromFolder, getProfilePhotoUrlFromPath } from "../../lib/profilePhotos";
import { supabase } from "../../lib/supabase";
import CctvCarouselModal from "./components/CctvCarouselModal";

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

export default function SsoIncidentBeforeAssignPage() {
  const router = useRouter();
  const { incidentId } = useLocalSearchParams<{ incidentId?: string }>();

  const [loading, setLoading] = useState(true);
  const [incident, setIncident] = useState<IncidentRow | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const modalMapRef = useRef<MapView | null>(null);
  const [cctvUris, setCctvUris] = useState<Array<string | null>>([]);
  const [showCctvModal, setShowCctvModal] = useState(false);
  const [activeCctvIndex, setActiveCctvIndex] = useState(0);
  const [routeCoords, setRouteCoords] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [currentUserAvatarUrl, setCurrentUserAvatarUrl] = useState<string | null>(null);
  const mapRegionAdjustingRef = useRef(false);

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

      setCurrentUserId(userId);

      const { data, error } = await supabase
        .from("incidents")
        .select(
          "incident_id, incident_category, location_name, location_unit_no, location_description, latitude, longitude, cctv_image_1_path, cctv_image_2_path, cctv_image_3_path, cctv_image_4, ai_assessment, active_status"
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
    let alive = true;

    const loadAvatar = async () => {
      if (!currentUserId) {
        if (alive) setCurrentUserAvatarUrl(null);
        return;
      }

      const { data } = await supabase
        .from("employees")
        .select("profile_photo_path, emp_id")
        .eq("id", currentUserId)
        .maybeSingle<{ profile_photo_path?: string | null; emp_id?: string | null }>();

      const resolvedUrl =
        (await getProfilePhotoUrlFromPath(data?.profile_photo_path ?? null)) ??
        (data?.emp_id ? await getProfilePhotoUrlFromFolder(data.emp_id) : null) ??
        (await getProfilePhotoUrlFromFolder(currentUserId));

      if (alive) setCurrentUserAvatarUrl(resolvedUrl);
    };

    void loadAvatar();
    return () => {
      alive = false;
    };
  }, [currentUserId]);

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

  useEffect(() => {
    if (!incident?.latitude || !incident?.longitude || !currentCoords) {
      setDistanceMeters(null);
      return;
    }
    setDistanceMeters(
      getDistanceMeters(
        currentCoords.latitude,
        currentCoords.longitude,
        incident.latitude,
        incident.longitude
      )
    );
  }, [currentCoords, incident?.latitude, incident?.longitude]);

  useEffect(() => {
    let alive = true;

    const loadRoute = async () => {
      if (!currentCoords || !incident?.latitude || !incident?.longitude) {
        if (alive) setRouteCoords([]);
        return;
      }

      const start = `${currentCoords.longitude},${currentCoords.latitude}`;
      const end = `${incident.longitude},${incident.latitude}`;
      const url = `https://router.project-osrm.org/route/v1/foot/${start};${end}?overview=full&geometries=geojson`;

      try {
        const response = await fetch(url);
        const body = (await response.json().catch(() => null)) as {
          routes?: Array<{ geometry?: { coordinates?: number[][] } }>;
        } | null;

        const coords = body?.routes?.[0]?.geometry?.coordinates ?? null;
        if (!alive) return;
        if (Array.isArray(coords) && coords.length >= 2) {
          setRouteCoords(coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng })));
          return;
        }
      } catch (error) {
        console.warn("[sso-incident-before] walking route failed:", error);
      }

      if (alive) {
        setRouteCoords([
          currentCoords,
          { latitude: incident.latitude, longitude: incident.longitude },
        ]);
      }
    };

    void loadRoute();
    return () => {
      alive = false;
    };
  }, [currentCoords, incident?.latitude, incident?.longitude]);

  const incidentRegion = useMemo<Region>(
    () => ({
      latitude: incident?.latitude ?? 1.3006,
      longitude: incident?.longitude ?? 103.8457,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }),
    [incident?.latitude, incident?.longitude]
  );

  useEffect(() => {
    if (!mapRegion) {
      setMapRegion(incidentRegion);
    }
  }, [incidentRegion, mapRegion]);

  const cctvItems = useMemo(
    () => (cctvUris.length ? cctvUris : [null, null, null, null]),
    [cctvUris]
  );

  const mapDistanceLabel = formatDistanceText(distanceMeters);
  const hasRoute = routeCoords.length >= 2;
  const carouselWidth = Math.min(Dimensions.get("window").width - 44, 420);

  const incidentTitle = useMemo(() => {
    const category = (incident?.incident_category ?? "Incident").toString();
    const locationName = (incident?.location_name ?? incident?.location_description ?? "Unknown Location").toString();
    return `${category} AT ${locationName}`;
  }, [incident?.incident_category, incident?.location_description, incident?.location_name]);

  const onOpenMapModal = () => {
    if (!mapRegion) setMapRegion(incidentRegion);
    setShowMapModal(true);
  };

  const onZoomModalMap = (direction: "in" | "out") => {
    setMapRegion((prev) => {
      const base = prev ?? incidentRegion;
      const factor = direction === "in" ? 0.55 : 1.8;
      const next: Region = {
        ...base,
        latitudeDelta: clamp(base.latitudeDelta * factor, 0.0008, 0.2),
        longitudeDelta: clamp(base.longitudeDelta * factor, 0.0008, 0.2),
      };
      mapRegionAdjustingRef.current = true;
      modalMapRef.current?.animateToRegion(next, 180);
      return next;
    });
  };

  const onRecenterModalMap = () => {
    setMapRegion(incidentRegion);
    mapRegionAdjustingRef.current = true;
    modalMapRef.current?.animateToRegion(incidentRegion, 180);
  };

  const onOpenCctvModal = (index: number) => {
    setActiveCctvIndex(index);
    setShowCctvModal(true);
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

      <View style={styles.bodyPanel}>
        <View style={styles.leftRail} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <Text style={styles.incidentTitle}>{incidentTitle}</Text>
            <Text style={styles.unitText}>
              {incident.location_unit_no?.trim() ? `#${incident.location_unit_no?.trim()}` : "#B2-05/06/07/08"}
            </Text>

            <View style={styles.mapInfoRow}>
              <Text style={styles.mapHintText}>Tap map to open navigation view</Text>
              <Text style={styles.mapDistanceText}>{mapDistanceLabel}</Text>
            </View>
            <MapView
              style={styles.map}
              region={mapRegion ?? incidentRegion}
              onPress={onOpenMapModal}
              onRegionChangeComplete={setMapRegion}
            >
              {incident.latitude && incident.longitude ? (
                <Marker coordinate={{ latitude: incident.latitude, longitude: incident.longitude }} title="Incident" />
              ) : null}
              {currentCoords ? (
                <Marker coordinate={currentCoords} title="You" anchor={{ x: 0.5, y: 0.5 }}>
                  <View style={styles.userMarker}>
                    {currentUserAvatarUrl ? (
                      <Image source={{ uri: currentUserAvatarUrl }} style={styles.userMarkerImage} />
                    ) : (
                      <View style={styles.userMarkerFallback}>
                        <Text style={styles.userMarkerText}>YOU</Text>
                      </View>
                    )}
                  </View>
                </Marker>
              ) : null}
              {hasRoute ? (
                <Polyline coordinates={routeCoords} strokeColor="#D7263D" strokeWidth={3} />
              ) : null}
            </MapView>

            <View style={styles.cctvCarousel}>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                snapToInterval={carouselWidth}
                decelerationRate="fast"
                contentContainerStyle={styles.cctvCarouselContent}
              >
                {cctvItems.map((uri, idx) => (
                  <Pressable
                    key={`cctv-${idx}`}
                    style={[styles.cctvSlide, { width: carouselWidth }]}
                    onPress={() => onOpenCctvModal(idx)}
                  >
                    {uri ? (
                      <Image source={{ uri }} style={styles.cctvSlideImage} />
                    ) : (
                      <View style={styles.cctvPlaceholder}>
                        <Text style={styles.cctvPlaceholderText}>{`CCTV ${idx + 1}`}</Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.cctvHintText}>Swipe for more CCTV images</Text>
            </View>

            <Text style={styles.assessmentTitle}>AI Assessment Report</Text>
            <View style={styles.assessmentBox}>
              <Text style={styles.assessmentText}>{incident.ai_assessment?.trim() || "No AI assessment available."}</Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.dispatchFloatingArea}>
          <Pressable
            style={styles.dispatchBtnWrap}
            onPress={() => router.push(`/sso/assign-officer?incidentId=${incident.incident_id}`)}
          >
            <LinearGradient
              colors={["#F00707", "#680002"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.dispatchBtn}
            >
              <BellRing size={30} color="#FFFFFF" strokeWidth={2.8} />
              <Text style={styles.dispatchBtnText}>Dispatch Officers Now</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>

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
            region={mapRegion ?? incidentRegion}
            onRegionChangeComplete={(region) => {
              if (mapRegionAdjustingRef.current) {
                mapRegionAdjustingRef.current = false;
                return;
              }
              setMapRegion(region);
            }}
          >
            {incident.latitude && incident.longitude ? (
              <Marker coordinate={{ latitude: incident.latitude, longitude: incident.longitude }} title="Incident" />
            ) : null}
            {currentCoords ? (
              <Marker coordinate={currentCoords} title="You" anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.userMarker}>
                  {currentUserAvatarUrl ? (
                    <Image source={{ uri: currentUserAvatarUrl }} style={styles.userMarkerImage} />
                  ) : (
                    <View style={styles.userMarkerFallback}>
                      <Text style={styles.userMarkerText}>YOU</Text>
                    </View>
                  )}
                </View>
              </Marker>
            ) : null}
            {hasRoute ? (
              <Polyline coordinates={routeCoords} strokeColor="#D7263D" strokeWidth={3} />
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

      <CctvCarouselModal
        visible={showCctvModal}
        images={cctvItems}
        initialIndex={activeCctvIndex}
        onClose={() => setShowCctvModal(false)}
      />
    </SafeAreaView>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistanceText(distanceMeters: number | null) {
  if (distanceMeters === null) return "Location distance unavailable";
  if (distanceMeters > 1000) {
    return `Location ${formatKm(distanceMeters)}km away`;
  }
  return `Location ${Math.round(distanceMeters)}m away`;
}

function formatKm(distanceMeters: number) {
  const km = distanceMeters / 1000;
  return km.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0E2D52" },
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
    paddingHorizontal: 11,
    paddingTop: 40,
    paddingBottom: 14,
    backgroundColor: "#0E2D52",
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
    fontSize: 24,
    lineHeight: 22,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  bodyPanel: {
    flex: 1,
    backgroundColor: "#F6F6F7",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: 2,
    overflow: "hidden",
  },
  leftRail: {
    position: "absolute",
    left: 8,
    top: 16,
    bottom: 112,
    width: 7,
    borderRadius: 14,
    backgroundColor: "#5074A6",
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 172,
  },
  card: {
    backgroundColor: "transparent",
  },
  incidentTitle: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "700",
    color: "#0E2D52",
    textTransform: "uppercase",
  },
  unitText: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 22,
    fontWeight: "700",
    color: "#0062FF",
    marginBottom: 6,
  },
  map: {
    height: 129,
    borderRadius: 0,
    overflow: "hidden",
  },
  mapInfoRow: {
    marginTop: 6,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  mapHintText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#274C77",
  },
  mapDistanceText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },
  userMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  userMarkerImage: {
    width: "100%",
    height: "100%",
  },
  userMarkerFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
  },
  userMarkerText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  cctvCarousel: {
    marginTop: 4,
  },
  cctvCarouselContent: {
    gap: 0,
  },
  cctvSlide: {
    height: 150,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#D7DEE8",
  },
  cctvSlideImage: {
    width: "100%",
    height: "100%",
  },
  cctvPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#D7DEE8",
    alignItems: "center",
    justifyContent: "center",
  },
  cctvPlaceholderText: {
    color: "#5B6472",
    fontWeight: "700",
    fontSize: 12,
  },
  cctvHintText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
  },
  cctvModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(5, 16, 30, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  cctvModalImage: {
    width: "100%",
    height: "75%",
    borderRadius: 12,
    backgroundColor: "#0B1F3A",
  },
  cctvModalClose: {
    position: "absolute",
    top: 40,
    right: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  cctvModalCloseText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  assessmentTitle: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
    color: "#0E2D52",
  },
  assessmentBox: {
    marginTop: 0,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#5B9AC2",
    backgroundColor: "#E9F2F5",
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 139,
  },
  assessmentText: {
    color: "#000000",
    fontSize: 16,
    lineHeight: 18,
  },
  dispatchFloatingArea: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 18,
    alignItems: "center",
  },
  dispatchBtnWrap: {
    alignSelf: "center",
    borderRadius: 111,
    shadowColor: "#FF0202",
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 15.7,
    elevation: 10,
  },
  dispatchBtn: {
    height: 78,
    width: 322,
    borderRadius: 111,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  dispatchBtnText: {
    color: "#FFFFFF",
    fontSize: 20,
    lineHeight: 22,
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
