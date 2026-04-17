import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Image, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Clock3 } from "lucide-react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";

const DISPLAY_TIME_ZONE = "Asia/Singapore";
const AVATAR_BUCKET = "profile-photos";
const USE_SIGNED_URL = true;

type ShiftData = {
  id: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  location: string | null;
  address: string | null;
  supervisor_id: string | null;
  supervisor: {
    first_name: string;
    last_name: string;
  } | null;
};

type Coords = {
  latitude: number;
  longitude: number;
};

export default function ClockInScreen() {
  const router = useRouter();
  const { shiftData } = useLocalSearchParams();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [profileName, setProfileName] = useState("Security Officer");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [resolvedSupervisorName, setResolvedSupervisorName] = useState("-");

  const isGpsConnected = Boolean(coords) && !locationError;

  const shift = useMemo(() => parseShiftData(shiftData), [shiftData]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;

    const loadLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (alive) {
          setLocationError("Location permission is required to display the map.");
        }
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      if (!alive) return;

      setCoords({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setLocationError(null);
    };

    loadLocation();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const loadSupervisor = async () => {
      try {
        const fromPayload = formatSupervisor(shift?.supervisor);
        if (fromPayload !== "-") {
          if (alive) setResolvedSupervisorName(fromPayload);
          return;
        }

        if (!shift?.supervisor_id) {
          if (alive) setResolvedSupervisorName("-");
          return;
        }

        const { data, error } = await supabase.rpc("get_my_supervisor_name", {
          p_supervisor_id: shift.supervisor_id,
        });

        if (!alive) return;

        const row = Array.isArray(data) ? data[0] : null;

        if (error || !row) {
          setResolvedSupervisorName("-");
          return;
        }

        const fullName = `${(row.first_name ?? "").trim()} ${(row.last_name ?? "").trim()}`.trim();
        setResolvedSupervisorName(fullName || "-");
      } catch {
        if (alive) {
          setResolvedSupervisorName("-");
        }
      }
    };

    loadSupervisor();

    return () => {
      alive = false;
    };
  }, [shift]);

  useEffect(() => {
    let alive = true;

    const getAvatarUrlFromFolder = async (userId: string) => {
      const folder = `employees/${userId}`;

      const { data: files, error: listError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .list(folder, { limit: 10, sortBy: { column: "name", order: "asc" } });

      if (listError || !files || files.length === 0) return null;

      const file = files.find((f) => f.name && !f.name.endsWith("/")) ?? files[0];
      if (!file?.name) return null;

      const fullPath = `${folder}/${file.name}`;

      if (USE_SIGNED_URL) {
        const { data, error } = await supabase.storage
          .from(AVATAR_BUCKET)
          .createSignedUrl(fullPath, 60 * 60);
        if (error) return null;
        return data?.signedUrl ?? null;
      }

      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(fullPath);
      return data.publicUrl ?? null;
    };

    const getAvatarUrlFromPath = async (rawPath: string) => {
      const trimmed = rawPath.trim();
      if (/^https?:\/\//i.test(trimmed)) return trimmed;

      let path = trimmed.replace(/^\/+/, "");
      if (path.startsWith(`${AVATAR_BUCKET}/`)) {
        path = path.slice(AVATAR_BUCKET.length + 1);
      }
      if (!path) return null;

      if (USE_SIGNED_URL) {
        const { data, error } = await supabase.storage
          .from(AVATAR_BUCKET)
          .createSignedUrl(path, 60 * 60);
        if (error) return null;
        return data?.signedUrl ?? null;
      }

      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      return data.publicUrl ?? null;
    };

    const loadProfile = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) return;

      const { data: prof } = await supabase
        .from("employees")
        .select("first_name, last_name, profile_photo_path")
        .eq("id", userId)
        .maybeSingle();

      if (!alive || !prof) return;

      const fullName = `${(prof.first_name ?? "").trim()} ${(prof.last_name ?? "").trim()}`.trim();
      setProfileName(fullName || "Security Officer");

      let url: string | null = null;
      if (prof.profile_photo_path) {
        url = await getAvatarUrlFromPath(prof.profile_photo_path);
      }
      if (!url) {
        url = await getAvatarUrlFromFolder(userId);
      }
      if (!alive) return;

      setAvatarUrl(url);
    };

    loadProfile();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={24} color="#ffffff" />
        </Pressable>
        <Text style={styles.headerTitle}>Clock In</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

      <View style={styles.mapContainer}>
        {coords ? (
          <MapView
            style={StyleSheet.absoluteFill}
            initialRegion={{
              latitude: coords.latitude,
              longitude: coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            region={{
              latitude: coords.latitude,
              longitude: coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            showsUserLocation
          >
            <Marker coordinate={coords} title="You are here" />
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}>{locationError ?? "Getting current GPS location..."}</Text>
          </View>
        )}

        <View style={styles.avatarWrap}>
          <Image
            source={
              avatarUrl && !avatarLoadFailed
                ? { uri: avatarUrl }
                : require("../../assets/fortis-logo.png")
            }
            onError={() => setAvatarLoadFailed(true)}
            style={styles.avatar}
          />
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.nameTitle}>{profileName}</Text>
        <Text style={styles.shiftDate}>{formatDate(shift?.shift_date)}</Text>

        <View style={styles.locationCard}>
          <View style={styles.locationLeft}>
            <Ionicons name="location-outline" size={24} color="#F1A579" />
            <View>
              <Text style={styles.infoLabel}>Location</Text>
              <Text style={styles.locationValue}>{shift?.location ?? "-"}</Text>
              <Text style={styles.infoSub}>{shift?.address ?? "-"}</Text>
            </View>
          </View>

          {isGpsConnected && (
            <View style={styles.gpsPill}>
              <Ionicons name="checkmark" size={14} color="#22C55E" />
              <Text style={styles.gpsText}>GPS</Text>
            </View>
          )}
        </View>

        <View style={styles.infoCard}> 
          <Text style={styles.infoLabel}>Shift Time</Text>
          <Text style={styles.shiftValue}>
            {shift ? `${formatShiftTime(shift.shift_start)} - ${formatShiftTime(shift.shift_end)}` : "-"}
          </Text>

          <View style={styles.infoDivider} />

          <Text style={styles.infoLabelSmall}>Supervisor</Text>
          <Text style={styles.supervisorValue}>{resolvedSupervisorName}</Text>
        </View>

        <Text style={styles.currentLabel}>START TIME</Text>
        <Text style={styles.currentTime}>{formatClockTime(currentTime.toISOString())}</Text>

        <Pressable style={styles.clockInButton}>
          <Clock3 size={18} color="#fff" />
          <Text style={styles.clockInText}>Clock In</Text>
        </Pressable>
      </View>
      </ScrollView>
    </View>
  );
}

function parseShiftData(raw: string | string[] | undefined): ShiftData | null {
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;

  try {
    return JSON.parse(value) as ShiftData;
  } catch {
    return null;
  }
}

function formatDate(isoDate: string | undefined) {
  if (!isoDate) return "-";
  return new Date(isoDate).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  });
}

function formatTime(iso: string | undefined) {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: DISPLAY_TIME_ZONE,
  });
}

function formatShiftTime(iso: string | undefined) {
  return formatTime(iso).toLowerCase();
}

function formatClockTime(iso: string | undefined) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: DISPLAY_TIME_ZONE,
  });
}

function formatSupervisor(supervisor: ShiftData["supervisor"] | undefined) {
  if (!supervisor) return "-";
  return `${supervisor.first_name} ${supervisor.last_name}`.trim() || "-";
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F3F4F6" },
  scrollContent: { paddingBottom: 28 },
  header: {
    backgroundColor: "#0E2D52",
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "700" },
  mapContainer: {
    height: 270,
    backgroundColor: "#D1D5DB",
    position: "relative",
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  mapPlaceholderText: { color: "#374151", textAlign: "center", fontWeight: "600" },
  avatarWrap: {
    position: "absolute",
    bottom: -20,
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "#fff",
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  content: { paddingHorizontal: 16, paddingTop: 28 },
  nameTitle: {
    textAlign: "center",
    color: "#0E2D52",
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 28,
  },
  shiftDate: {
    textAlign: "center",
    marginTop: -2,
    color: "#6B7280",
    fontWeight: "500",
    fontSize: 16,
    marginBottom: 12,
  },
  locationCard: {
    backgroundColor: "#DDE2E9",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  locationLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  locationValue: { color: "#163A63", fontSize: 20, fontWeight: "700", marginTop: 0 },
  gpsPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F9EE",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 2,
  },
  gpsText: { color: "#22C55E", fontWeight: "800", fontSize: 16 },
  infoCard: {
    backgroundColor: "#DDE2E9",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  infoLabel: { color: "#93A1B5", fontWeight: "700", textTransform: "uppercase" },
  infoLabelSmall: { color: "#93A1B5", fontWeight: "700", marginTop: 10, textTransform: "uppercase" },
  infoSub: { color: "#8A95A5", marginTop: 2, fontWeight: "600", fontSize: 13 },
  shiftValue: { color: "#163A63", fontSize: 18, fontWeight: "700", marginTop: 2 },
  infoDivider: { height: 1, backgroundColor: "#C5CBD6", marginTop: 10, marginBottom: 10 },
  supervisorValue: { color: "#163A63", fontSize: 18, fontWeight: "700", marginTop: 2 },
  currentLabel: {
    textAlign: "center",
    color: "#A3B1C2",
    fontWeight: "700",
    letterSpacing: 2,
    marginTop: 12,
  },
  currentTime: {
    textAlign: "center",
    color: "#0E2D52",
    fontWeight: "800",
    fontSize: 52,
    letterSpacing: 2,
    marginBottom: 12,
  },
  clockInButton: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0E2D52",
    borderRadius: 16,
    paddingHorizontal: 42,
    paddingVertical: 13,
    minWidth: 260,
    justifyContent: "center",
  },
  clockInText: { color: "#fff", fontWeight: "700", fontSize: 20 },
});
