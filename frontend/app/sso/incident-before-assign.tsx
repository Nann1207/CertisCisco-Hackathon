import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { BellRing, ChevronLeft, Maximize2, Minimize2, Settings2, MapPinned } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { resolveIncidentFrameUrls } from "../../lib/incidentFrames";
import { getProfilePhotoUrlFromFolder, getProfilePhotoUrlFromPath } from "../../lib/profilePhotos";
import { supabase } from "../../lib/supabase";
import AiSummaryModal from "../securityofficer/components/AiSummaryModal";
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

const AI_SUMMARY_FONT_SIZE_PREFIX = "ai_summary_font_size";

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
  const [modalMapKey, setModalMapKey] = useState(0);
  const previewMapRef = useRef<MapView | null>(null);
  const modalMapRef = useRef<MapView | null>(null);
  const [cctvUris, setCctvUris] = useState<Array<string | null>>([]);
  const [showCctvModal, setShowCctvModal] = useState(false);
  const [activeCctvIndex, setActiveCctvIndex] = useState(0);
  const [showAiSummaryModal, setShowAiSummaryModal] = useState(false);
  const [aiSummaryFontSize, setAiSummaryFontSize] = useState(16);
  const [isAssessmentExpanded, setIsAssessmentExpanded] = useState(true);
  const [routeCoords, setRouteCoords] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [currentUserAvatarUrl, setCurrentUserAvatarUrl] = useState<string | null>(null);
  const previewMapRegionRef = useRef<Region | null>(null);
  const modalMapRegionRef = useRef<Region | null>(null);
  const mapRegionAdjustingRef = useRef(false);
  const hasFitInitialPreviewMapRef = useRef(false);

  const aiSummaryStorageKey = useMemo(() => {
    if (!currentUserId) return null;
    return `${AI_SUMMARY_FONT_SIZE_PREFIX}:${currentUserId}`;
  }, [currentUserId]);

  useEffect(() => {
    let alive = true;

    const loadFontSize = async () => {
      if (!aiSummaryStorageKey) return;
      const stored = await AsyncStorage.getItem(aiSummaryStorageKey);
      if (!alive || !stored) return;
      const parsed = Number.parseFloat(stored);
      if (Number.isFinite(parsed)) {
        setAiSummaryFontSize(Math.min(20, Math.max(13, parsed)));
      }
    };

    void loadFontSize();
    return () => {
      alive = false;
    };
  }, [aiSummaryStorageKey]);

  useEffect(() => {
    if (!aiSummaryStorageKey) return;
    void AsyncStorage.setItem(aiSummaryStorageKey, String(aiSummaryFontSize));
  }, [aiSummaryFontSize, aiSummaryStorageKey]);

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

  const defaultMapRegion = useMemo(
    () =>
      getRegionForPoints(
        currentCoords,
        incident?.latitude && incident?.longitude
          ? { latitude: incident.latitude, longitude: incident.longitude }
          : null,
        incidentRegion
      ),
    [currentCoords, incident?.latitude, incident?.longitude, incidentRegion]
  );

  useEffect(() => {
    if (!mapRegion) {
      setMapRegion(defaultMapRegion);
    }
  }, [defaultMapRegion, mapRegion]);

  const fitInitialPreviewMap = useCallback(() => {
    if (hasFitInitialPreviewMapRef.current || !currentCoords || !incident?.latitude || !incident?.longitude) return;
    if (!previewMapRef.current) return;

    hasFitInitialPreviewMapRef.current = true;
    previewMapRef.current?.fitToCoordinates(
      [currentCoords, { latitude: incident.latitude, longitude: incident.longitude }],
      {
        edgePadding: { top: 44, right: 44, bottom: 44, left: 44 },
        animated: false,
      }
    );
  }, [currentCoords, incident?.latitude, incident?.longitude]);

  useEffect(() => {
    fitInitialPreviewMap();
  }, [fitInitialPreviewMap]);

  const cctvItems = useMemo(
    () => (cctvUris.length ? cctvUris : [null, null, null, null]),
    [cctvUris]
  );

  const mapDistanceLabel = formatDistanceText(distanceMeters);
  const hasRoute = routeCoords.length >= 2;
  const carouselWidth = Math.min(Dimensions.get("window").width - 44, 420);
  const assessmentLineHeight = Math.round(aiSummaryFontSize * 1.35);
  const minimizedAssessmentHeight = assessmentLineHeight * 10 + 20;

  const incidentTitle = useMemo(() => {
    const category = (incident?.incident_category ?? "Incident").toString();
    const locationName = (incident?.location_name ?? incident?.location_description ?? "Unknown Location").toString();
    return `${category} AT ${locationName}`;
  }, [incident?.incident_category, incident?.location_description, incident?.location_name]);

  const onOpenMapModal = () => {
    const nextRegion = previewMapRegionRef.current ?? mapRegion ?? defaultMapRegion;
    modalMapRegionRef.current = nextRegion;
    setMapRegion(nextRegion);
    setModalMapKey((prev) => prev + 1);
    setShowMapModal(true);
  };

  const onCloseMapModal = () => {
    const nextRegion = modalMapRegionRef.current ?? mapRegion ?? defaultMapRegion;
    previewMapRegionRef.current = nextRegion;
    previewMapRef.current?.animateToRegion(nextRegion, 120);
    setMapRegion(nextRegion);
    setShowMapModal(false);
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
      modalMapRegionRef.current = next;
      modalMapRef.current?.animateToRegion(next, 180);
      return next;
    });
  };

  const onRecenterModalMap = () => {
    setMapRegion(incidentRegion);
    modalMapRegionRef.current = incidentRegion;
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
        <Pressable style={styles.iconBtn} onPress={() => setShowAiSummaryModal(true)}>
          <Settings2 size={20} color="#FFFFFF" />
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
              <View style={styles.mapDistanceWrap}>{mapDistanceLabel}</View>
            </View>
            <MapView
              ref={previewMapRef}
              style={styles.map}
              initialRegion={defaultMapRegion}
              onPress={onOpenMapModal}
              onMapReady={fitInitialPreviewMap}
              onRegionChangeComplete={(region) => {
                previewMapRegionRef.current = region;
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
              <Text style={styles.cctvHintText} pointerEvents="none">Tap to zoom / Swipe for more CCTV images</Text>
            </View>

            <View style={styles.assessmentHeaderRow}>
              <Text style={[styles.assessmentTitle, styles.assessmentHeaderTitle]}>AI Assessment Report</Text>
              <Pressable
                style={styles.assessmentToggleBtn}
                onPress={() => setIsAssessmentExpanded((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={isAssessmentExpanded ? "Minimize AI Assessment Report" : "Expand AI Assessment Report"}
              >
                {isAssessmentExpanded ? (
                  <Minimize2 size={16} color="#0E2D52" />
                ) : (
                  <Maximize2 size={16} color="#0E2D52" />
                )}
                <Text style={styles.assessmentToggleText}>{isAssessmentExpanded ? "Minimize" : "Expand"}</Text>
              </Pressable>
            </View>
            {isAssessmentExpanded ? (
              <View style={styles.assessmentBox}>
                <Text style={[styles.assessmentText, { fontSize: aiSummaryFontSize, lineHeight: assessmentLineHeight }]}>
                  {incident.ai_assessment?.trim() || "No AI assessment available."}
                </Text>
              </View>
            ) : (
              <View style={[styles.assessmentBox, styles.assessmentBoxMinimized, { height: minimizedAssessmentHeight }]}>
                <ScrollView
                  style={styles.assessmentScroll}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  persistentScrollbar
                >
                  <Text style={[styles.assessmentText, { fontSize: aiSummaryFontSize, lineHeight: assessmentLineHeight }]}>
                    {incident.ai_assessment?.trim() || "No AI assessment available."}
                  </Text>
                </ScrollView>
                <LinearGradient
                  pointerEvents="none"
                  colors={["rgba(233,242,245,0)", "rgba(233,242,245,0.4)"]}
                  style={styles.assessmentBottomFade}
                />
              </View>
            )}
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

      <Modal
        visible={showMapModal}
        transparent
        animationType="fade"
        onRequestClose={onCloseMapModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.mapModalCard}>
            <Text style={styles.mapModalTitle}>Navigate to Incident</Text>
            <Text style={styles.mapModalSubtitle}>Use +/- to zoom and orient before moving.</Text>

            <View style={styles.mapModalFrame}>
              <MapView
                key={`incident-before-modal-map-${modalMapKey}`}
                ref={modalMapRef}
                style={styles.mapModalMap}
                initialRegion={mapRegion ?? defaultMapRegion}
                onRegionChangeComplete={(region) => {
                  if (mapRegionAdjustingRef.current) {
                    mapRegionAdjustingRef.current = false;
                    return;
                  }
                  modalMapRegionRef.current = region;
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

              <View style={styles.zoomControls}>
                <Pressable style={styles.zoomBtn} onPress={() => onZoomModalMap("in")}>
                  <Text style={styles.zoomBtnText}>+</Text>
                </Pressable>
                <Pressable style={styles.zoomBtn} onPress={() => onZoomModalMap("out")}>
                  <Text style={styles.zoomBtnText}>-</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.mapModalActions}>
              <Pressable style={[styles.mapModalBtn, styles.mapModalBtnPrimary]} onPress={onRecenterModalMap}>
                <Text style={styles.mapModalBtnPrimaryText}>Recenter Map</Text>
              </Pressable>
              <Pressable
                style={[styles.mapModalBtn, styles.mapModalBtnSecondary]}
                onPress={onCloseMapModal}
              >
                <Text style={styles.mapModalBtnSecondaryText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <CctvCarouselModal
        visible={showCctvModal}
        images={cctvItems}
        initialIndex={activeCctvIndex}
        onClose={() => setShowCctvModal(false)}
      />
      <AiSummaryModal
        visible={showAiSummaryModal}
        fontSize={aiSummaryFontSize}
        onChangeFontSize={setAiSummaryFontSize}
        onClose={() => setShowAiSummaryModal(false)}
      />
    </SafeAreaView>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getRegionForPoints(
  first: { latitude: number; longitude: number } | null,
  second: { latitude: number; longitude: number } | null,
  fallback: Region
): Region {
  if (!first || !second) return fallback;

  const minLat = Math.min(first.latitude, second.latitude);
  const maxLat = Math.max(first.latitude, second.latitude);
  const minLng = Math.min(first.longitude, second.longitude);
  const maxLng = Math.max(first.longitude, second.longitude);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.6, 0.005),
    longitudeDelta: Math.max((maxLng - minLng) * 1.6, 0.005),
  };
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
  if (distanceMeters === null) {
      return (
    <View style={styles.mapDistanceInner}>
      <MapPinned size={16} color="#b90a0a"/>
      <Text style={styles.mapDistanceText}>Location distance unavailable</Text>
    </View>
    );
  }

  const distanceValue = distanceMeters > 1000 
    ? `${formatKm(distanceMeters)}km` 
    : `${Math.round(distanceMeters)}m`;
  const distanceValueStyle = distanceMeters < 100 ? styles.mapDistanceValueNear : styles.mapDistanceValueFar;

  return (
    <View style={styles.mapDistanceInner}>
      <MapPinned size={16} color="#b90a0a"/>
      <Text style={styles.mapDistanceText}>Location</Text>
      <Text style={[styles.mapDistanceText, distanceValueStyle]}>{distanceValue}</Text>
      <Text style={styles.mapDistanceText}>away</Text>
    </View>
  );
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
    paddingHorizontal: 16,
    paddingTop: 44,
    paddingBottom: 12,
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
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
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
    bottom: 16,
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
  mapDistanceValueFar: {
    color: "#c51010",
    fontWeight: "900",
  },
  mapDistanceValueNear: {
    color: "#046427",
    fontWeight: "900",
  },
  mapDistanceWrap: {
    flexShrink: 0,
  },
  mapDistanceInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
    position: "relative",
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
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.62)",
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    zIndex: 2,
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
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
    color: "#0E2D52",
  },
  assessmentHeaderRow: {
    marginTop: 12,
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  assessmentHeaderTitle: {
    flex: 1,
  },
  assessmentToggleBtn: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#AFC9DA",
    backgroundColor: "#F7FBFD",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  assessmentToggleText: {
    fontSize: 12,
    lineHeight: 16,
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
  assessmentBoxMinimized: {
    overflow: "hidden",
    position: "relative",
  },
  assessmentScroll: {
    flex: 1,
  },
  assessmentBottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 36,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(5,16,30,0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  mapModalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: "#F8FAFD",
    borderWidth: 2,
    borderColor: "#CBD9EA",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  mapModalTitle: {
    marginTop: 40,
    fontSize: 24,
    fontWeight: "900",
    color: "#163A67",
    textAlign: "center",
  },
  mapModalSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: "#47678A",
    textAlign: "center",
  },
  mapModalFrame: {
    marginTop: 10,
    height: 400,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#C7D2E0",
  },
  mapModalMap: {
    flex: 1,
  },
  zoomControls: {
    position: "absolute",
    right: 10,
    top: 10,
    gap: 8,
  },
  zoomBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#B7C7DB",
  },
  zoomBtnText: {
    fontSize: 24,
    lineHeight: 26,
    fontWeight: "900",
    color: "#173E6B",
  },
  mapModalActions: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
  },
  mapModalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  mapModalBtnPrimary: {
    backgroundColor: "#0E2D52",
  },
  mapModalBtnSecondary: {
    backgroundColor: "#E2E8F0",
  },
  mapModalBtnPrimaryText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  mapModalBtnSecondaryText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#334155",
  },
});
