import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";
import * as Location from "expo-location";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BellRing, ChevronLeft, ClipboardPen, Maximize2, Minimize2, PhoneCall, Settings2, MapPinned } from "lucide-react-native";
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

const AI_SUMMARY_FONT_SIZE_PREFIX = "ai_summary_font_size";

function getAssignmentId(row: AssignmentRow, fallbackSuffix: string) {
  return typeof row.assignment_id === "string" ? row.assignment_id : `${row.officer_id ?? "officer"}-${fallbackSuffix}`;
}

function hasRequestedBackup(row: AssignmentRow) {
  const dynamic = row as Record<string, unknown>;
  const rawRequested =
    dynamic.backup_requested ??
    dynamic.request_backup ??
    dynamic.backup_request ??
    dynamic.request_additional_officers ??
    dynamic.needs_backup;

  const normalizedRequested =
    rawRequested === true ||
    rawRequested === 1 ||
    rawRequested === "1" ||
    String(rawRequested ?? "").trim().toLowerCase() === "true";

  const hasBackupAmount =
    dynamic.backup_amount !== null &&
    dynamic.backup_amount !== undefined &&
    String(dynamic.backup_amount).trim().length > 0 &&
    Number.parseInt(String(dynamic.backup_amount), 10) > 0;

  return normalizedRequested || hasBackupAmount;
}

function toBackupRequestDetails(row: AssignmentRow, fallbackSuffix: string): BackupRequestDetails {
  const dynamic = row as Record<string, unknown>;
  const countRaw =
    dynamic.backup_amount ??
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

  return {
    assignmentId: getAssignmentId(row, fallbackSuffix),
    requesterName: (typeof row.officer_name === "string" ? row.officer_name : "") || "Assigned Officer",
    requestedCount,
    reason: String(reasonRaw ?? "").trim(),
  };
}

export default function SsoIncidentAfterAssignPage() {
  const router = useRouter();
  const { incidentId } = useLocalSearchParams<{ incidentId?: string }>();
  const { width } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [incident, setIncident] = useState<IncidentRow | null>(null);
  const [assignedOfficers, setAssignedOfficers] = useState<AssignedOfficer[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);

  const [showMapModal, setShowMapModal] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const [modalMapKey, setModalMapKey] = useState(0);
  const previewMapRef = useRef<MapView | null>(null);
  const modalMapRef = useRef<MapView | null>(null);

  const [showBackupRequestModal, setShowBackupRequestModal] = useState(false);
  const [backupAttentionActive, setBackupAttentionActive] = useState(false);
  const [acknowledgedBackupRequestIds, setAcknowledgedBackupRequestIds] = useState<Set<string>>(new Set());
  const [backupRequestDetails, setBackupRequestDetails] = useState<BackupRequestDetails | null>(null);
  const [cctvUris, setCctvUris] = useState<Array<string | null>>([]);
  const [showCctvModal, setShowCctvModal] = useState(false);
  const [activeCctvIndex, setActiveCctvIndex] = useState(0);
  const [showAiSummaryModal, setShowAiSummaryModal] = useState(false);
  const [aiSummaryFontSize, setAiSummaryFontSize] = useState(16);
  const [isAssessmentExpanded, setIsAssessmentExpanded] = useState(true);
  const [routeCoords, setRouteCoords] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [currentUserAvatarUrl, setCurrentUserAvatarUrl] = useState<string | null>(null);

  const addBackupPulse = useRef(new Animated.Value(0)).current;
  const addBackupRotate = useRef(new Animated.Value(0)).current;
  const channelNonceRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const acknowledgedBackupRequestIdsRef = useRef<Set<string>>(new Set());
  const previewMapRegionRef = useRef<Region | null>(null);
  const modalMapRegionRef = useRef<Region | null>(null);
  const mapRegionAdjustingRef = useRef(false);
  const hasFitInitialPreviewMapRef = useRef(false);

  useEffect(() => {
    acknowledgedBackupRequestIdsRef.current = acknowledgedBackupRequestIds;
  }, [acknowledgedBackupRequestIds]);

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
    if (!backupAttentionActive) {
      addBackupPulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(addBackupPulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(addBackupPulse, {
          toValue: 0,
          duration: 900,
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
    let cancelled = false;

    const spin = () => {
      addBackupRotate.setValue(0);

      Animated.timing(addBackupRotate, {
        toValue: 1,
        duration: 3600,
        useNativeDriver: true,
        isInteraction: false,
      }).start(({ finished }) => {
        if (!finished || cancelled) return;
        spin();
      });
    };

    spin();
    return () => {
      cancelled = true;
      addBackupRotate.stopAnimation();
    };
  }, [addBackupRotate, backupAttentionActive, showBackupRequestModal]);

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

      setCurrentUserId(userId);

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
        acknowledgedBackupRequestIdsRef.current,
        setAssignedOfficers,
        setShowBackupRequestModal,
        setBackupAttentionActive,
        setBackupRequestDetails
      );
      if (alive) setLoading(false);
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
    if (!incidentId) return;

    void refreshAssignedOfficers(
      incidentId,
      acknowledgedBackupRequestIds,
      setAssignedOfficers,
      setShowBackupRequestModal,
      setBackupAttentionActive,
      setBackupRequestDetails
    );
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
            acknowledgedBackupRequestIdsRef.current,
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
        console.warn("[sso-incident-after] walking route failed:", error);
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
  const carouselWidth = Math.min(Dimensions.get("window").width - 36, 420);

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
  const addBackupGlowScale = addBackupPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.03],
  });
  const addBackupGlowOpacity = addBackupPulse.interpolate({
    inputRange: [0, 0.15, 0.85, 1],
    outputRange: [0.35, 0.95, 0.95, 0.35],
  });
  const addBackupBorderRotate = addBackupRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const assignedGridGap = 18;
  const assignedGridHorizontalPadding = 36;
  const assignedOfficerWidth = Math.floor(
    Math.max(88, Math.min(112, (width - assignedGridHorizontalPadding - assignedGridGap * 2) / 3))
  );
  const assessmentLineHeight = Math.round(aiSummaryFontSize * 1.35);
  const minimizedAssessmentHeight = assessmentLineHeight * 10 + 24;

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

  const onOpenAddBackup = () => {
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
          <Pressable style={styles.iconBtn} onPress={() => setShowAiSummaryModal(true)}>
            <Settings2 size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View style={styles.bodyPanel}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.incidentTitle}>{incidentTitle}</Text>
          <Text style={styles.unitText}>{locationLabel}</Text>

          <View style={styles.mapInfoRow}>
            <Text style={styles.mapHintText}>Tap map to open navigation view</Text>
            <View style={styles.mapDistanceWrap}>{mapDistanceLabel}</View>
          </View>
          <Pressable style={styles.mapCard} onPress={onOpenMapModal}>
            <MapView
              ref={previewMapRef}
              style={styles.map}
              initialRegion={defaultMapRegion}
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
          </Pressable>

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

          <View style={styles.actionRowTop}>
            <Animated.View style={[styles.addBackupAttentionWrap, backupAttentionActive ? { transform: [{ scale: addBackupScale }] } : null]}>
              {backupAttentionActive ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.addBackupGlowRing,
                    {
                      opacity: addBackupGlowOpacity,
                      transform: [{ scale: addBackupGlowScale }],
                    },
                  ]}
                >
                  <Animated.View
                    style={[
                      styles.addBackupGlowSweep,
                      {
                        transform: [{ rotate: addBackupBorderRotate }],
                      },
                    ]}
                  >
                    <LinearGradient
                      colors={[
                        "rgba(255,255,255,0)",
                        "rgba(255,255,255,0.4)",
                        "#431068",
                        "#e23500",
                        "#5e24fc",
                        "rgba(255,255,255,0.25)",
                        "rgba(255,255,255,0)",
                      ]}
                      locations={[0, 0.1, 0.34, 0.6, 0.85, 0.94, 1]}
                      start={{ x: 0.5, y: 0 }}
                      end={{ x: 0.5, y: 1 }}
                      style={styles.addBackupGlowSweepGradient}
                    />
                  </Animated.View>
                  <View style={styles.addBackupGlowMaskFill} />
                </Animated.View>
              ) : null}
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

          <View style={styles.assessmentHeaderRow}>
            <Text style={[styles.sectionLabel, styles.assessmentHeaderTitle]}>AI Assessment Report</Text>
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

          <Text style={styles.sectionLabel}>Assigned Officers</Text>
          <View style={styles.assignedStrip}>
            {assignedOfficers.length > 0 ? (
              assignedOfficers.map((officer) => (
                <View
                  key={officer.assignmentId}
                  style={[styles.assignedOfficerItem, { width: assignedOfficerWidth }]}
                >
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

            {assignedOfficers.length === 0 ? (
              <Pressable style={styles.reportBtn} onPress={() => router.push(`/sso/assign-officer?incidentId=${incidentId}`)}>
                <BellRing size={19} color="#FFFFFF" />
                <Text style={styles.reportBtnText}>Dispatch Officers</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.reportBtn} onPress={() => { void onSubmitIncidentReport(); }}>
                <ClipboardPen size={19} color="#FFFFFF" />
                <Text style={styles.reportBtnText}>Incident Report</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </View>

      <Modal
        visible={showBackupRequestModal}
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
              {backupRequestDetails?.reason || "Your officers requested additional backup support."}
            </Text>
            <Text style={styles.requestNameText}>
              {(backupRequestDetails?.requesterName || "Assigned Officer")} request{" "}
              {backupRequestDetails?.requestedCount ?? 1} officer(s) for backup
            </Text>
            <Text style={styles.requestAttentionText}>Please attend to request immediately</Text>
            <View style={styles.requestAlertRule} />

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
              <LinearGradient
                colors={["#0E2D52", "#09213D"]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.requestAcknowledgeBtnGradient}
              >
                <Text style={styles.requestAcknowledgeText}>I ACKNOWLEDGE THIS REQUEST</Text>
              </LinearGradient>
            </Pressable>
          </LinearGradient>
        </View>
      </Modal>

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
                key={`incident-after-modal-map-${modalMapKey}`}
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

  const requestedRows = rows
    .map((row, index) => {
      if (!hasRequestedBackup(row)) return null;

      return { row, assignmentId: getAssignmentId(row, String(index)) };
    })
    .filter((item): item is { row: AssignmentRow; assignmentId: string } => Boolean(item));

  const pendingRequest = requestedRows.find(({ assignmentId }) => !acknowledgedRequestIds.has(assignmentId));

  if (pendingRequest) {
    const { row: pendingRow } = pendingRequest;
    setBackupRequestDetails(toBackupRequestDetails(pendingRow, "request"));
    setShowBackupRequestModal(false);
    setBackupAttentionActive(true);
    return;
  }

  const acknowledgedRequest = requestedRows.find(({ assignmentId }) => acknowledgedRequestIds.has(assignmentId));

  if (acknowledgedRequest) {
    const { row: activeRow } = acknowledgedRequest;
    setBackupRequestDetails(toBackupRequestDetails(activeRow, "acknowledged"));
    setShowBackupRequestModal(false);
    setBackupAttentionActive(true);
    return;
  }

  setShowBackupRequestModal(false);
  setBackupRequestDetails(null);
  setBackupAttentionActive(false);
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
    paddingHorizontal: 16,
    paddingTop: 44,
    paddingBottom: 12,
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
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
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
  mapInfoRow: {
    marginTop: 10,
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
    width: 36,
    height: 36,
    borderRadius: 18,
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
    fontSize: 10,
    fontWeight: "800",
  },
  cctvCarousel: {
    marginTop: 8,
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
  actionRowTop: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  addBackupAttentionWrap: {
    position: "relative",
  },
  addBackupGlowRing: {
    position: "absolute",
    top: -3,
    bottom: -3,
    left: -3,
    right: -3,
    borderRadius: 999,
    backgroundColor: "rgba(70, 15, 122, 0.18)",
    overflow: "hidden",
    shadowColor: "#A855F7",
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  addBackupGlowSweep: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 148,
    height: 148,
    marginLeft: -74,
    marginTop: -74,
    alignItems: "center",
  },
  addBackupGlowSweepGradient: {
    width: 34,
    height: 84,
    borderRadius: 999,
  },
  addBackupGlowMaskFill: {
    position: "absolute",
    top: 1,
    right: 1,
    bottom: 1,
    left: 1,
    borderRadius: 999,
    backgroundColor: "#ffa15e",
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
    fontSize: 14,
    fontWeight: "700",
  },
  actionChipBlue: {
    backgroundColor: "#EEF7FF",
    borderColor: "rgba(160,176,192,0.4)",
  },
  actionChipBlueText: {
    color: "#5A6E85",
    fontSize: 14,
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
  assessmentHeaderRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  assessmentHeaderTitle: {
    marginTop: 0,
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
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#5B9AC2",
    backgroundColor: "#E9F2F5",
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 78,
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
    fontWeight: "400",
  },
  assignedStrip: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 18,
    rowGap: 18,
    minHeight: 86,
    justifyContent: "flex-start",
  },
  assignedOfficerItem: {
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
    lineHeight: 18,
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
    fontSize: 18,
    fontWeight: "700",
  },
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
