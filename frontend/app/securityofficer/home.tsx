import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  ImageBackground,
  Pressable,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import {
  Settings,
  Languages,
  Bell,
  CreditCard,
  FileText,
  ShieldAlert,
  Grid3X3,
} from "lucide-react-native";
import { Ionicons } from "@expo/vector-icons";

import { styles } from "../../styles/securityofficer/home.styles";

const DISPLAY_TIME_ZONE = "Asia/Singapore";

type Profile = {
  id: string;
  emp_id: string;
  first_name: string;
  avatar_url: string | null;
};

type Shift = {
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

type UpcomingShift = {
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

export default function Home() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [todayShift, setTodayShift] = useState<Shift | null>(null);
  const [todayIncidentSummary, setTodayIncidentSummary] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingShift[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [debugEmptyReason, setDebugEmptyReason] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  const AVATAR_BUCKET = "profile-photos";

  const USE_SIGNED_URL = true;

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [profile?.avatar_url]);

  useEffect(() => {
    let alive = true;

    const getAvatarUrlFromFolder = async (userId: string) => {
      // Folder: employees/<authUserId>/
      const folder = `employees/${userId}`;

      const { data: files, error: listError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .list(folder, { limit: 10, sortBy: { column: "name", order: "asc" } });

      if (listError || !files || files.length === 0) return null;

      // pick the first real file (ignore folder placeholders if any)
      const file = files.find((f) => f.name && !f.name.endsWith("/")) ?? files[0];
      if (!file?.name) return null;

      const fullPath = `${folder}/${file.name}`;

      if (USE_SIGNED_URL) {
        const { data, error } = await supabase.storage
          .from(AVATAR_BUCKET)
          .createSignedUrl(fullPath, 60 * 60); // 1 hour
        if (error) return null;
        return data?.signedUrl ?? null;
      }

      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(fullPath);
      return data.publicUrl ?? null;
    };

    const getAvatarUrlFromPath = async (rawPath: string) => {
      const trimmed = rawPath.trim();

      // If DB already stores a full URL, use it directly.
      if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
      }

      // Accept both "employees/<id>/<file>" and "/employees/<id>/<file>".
      let path = trimmed.replace(/^\/+/, "");
      // If bucket name is stored in DB path, strip it.
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

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      setDebugEmptyReason(null);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      if (sessionError || !userId) {
        if (alive) setLoadError("Unable to load user session.");
        if (alive) setLoading(false);
        return;
      }

      // 1) Employee profile
      const { data: prof, error: profError } = await supabase
        .from("employees")
        .select("id, emp_id, first_name, profile_photo_path")
        .eq("id", userId)
        .maybeSingle();

      let avatarUrl: string | null = null;
      if (prof?.profile_photo_path) {
        avatarUrl = await getAvatarUrlFromPath(prof.profile_photo_path);
      }
      if (!avatarUrl) {
        // Fallback: list /employees/<authUserId>/ and use first file.
        avatarUrl = await getAvatarUrlFromFolder(userId);
      }

      const now = new Date();
      const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
        now.getDate()
      ).padStart(2, "0")}`;

      // 2) Today shift
      const { data: shift, error: todayShiftError } = await supabase
        .from("shifts")
        .select("id:shift_id, shift_date, shift_start, shift_end, location, address, supervisor_id")
        .eq("officer_id", userId)
        .eq("shift_date", todayISO)
        .order("shift_start", { ascending: true })
        .limit(1)
        .maybeSingle();

      // 3) Upcoming schedule (next 5)
      const { data: upcomingShiftsRaw, error: upcomingError } = await supabase
        .from("shifts")
        .select(`
          id:shift_id,
          shift_date,
          shift_start,
          shift_end,
          location,
          address,
          supervisor_id
        `)
        .eq("officer_id", userId)
        .gte("shift_date", todayISO)
        .order("shift_date", { ascending: true })
        .order("shift_start", { ascending: true })
        .limit(5);

      const supervisorIds = Array.from(
        new Set(
          [
            ...(upcomingShiftsRaw ?? []).map((s: any) => s.supervisor_id),
            shift?.supervisor_id,
          ].filter(Boolean)
        )
      ) as string[];

      let supervisorMap = new Map<string, { first_name: string; last_name: string }>();
      if (supervisorIds.length > 0) {
        const { data: supervisors, error: supervisorsError } = await supabase
          .from("employees")
          .select("id, first_name, last_name")
          .in("id", supervisorIds);

        if (!supervisorsError && supervisors) {
          supervisorMap = new Map(
            supervisors.map((s) => [s.id, { first_name: s.first_name, last_name: s.last_name }])
          );
        }
      }

      const upcomingShifts: UpcomingShift[] = (upcomingShiftsRaw ?? []).map((shiftItem: any) => {
        const supervisor = shiftItem.supervisor_id
          ? supervisorMap.get(shiftItem.supervisor_id) ?? null
          : null;

        return {
          id: shiftItem.id,
          shift_date: shiftItem.shift_date,
          shift_start: shiftItem.shift_start,
          shift_end: shiftItem.shift_end,
          location: shiftItem.location ?? null,
          address: shiftItem.address ?? null,
          supervisor_id: shiftItem.supervisor_id ?? null,
          supervisor,
        };
      });

      const todayShiftData: Shift | null = shift
        ? {
            id: shift.id,
            shift_date: shift.shift_date,
            shift_start: shift.shift_start,
            shift_end: shift.shift_end,
            location: shift.location ?? null,
            address: shift.address ?? null,
            supervisor_id: shift.supervisor_id ?? null,
            supervisor: shift.supervisor_id ? supervisorMap.get(shift.supervisor_id) ?? null : null,
          }
        : null;

      if (todayShiftError || upcomingError) {
        setLoadError("Unable to load shifts right now.");
      }

      if (!upcomingError && (upcomingShiftsRaw?.length ?? 0) === 0) {
        const { data: visibleShifts, error: visibleError } = await supabase
          .from("shifts")
          .select("shift_id, officer_id, shift_date")
          .gte("shift_date", todayISO)
          .limit(20);

        if (!visibleError) {
          const visibleCount = visibleShifts?.length ?? 0;
          const hasMatchingOfficer =
            (visibleShifts ?? []).some((s: any) => s.officer_id === userId);

          if (visibleCount === 0) {
            setDebugEmptyReason(
              `No shifts are visible for this session. Auth user: ${userId}. This usually means RLS policy is blocking select on shifts.`
            );
          } else if (!hasMatchingOfficer) {
            setDebugEmptyReason(
              `Shifts are visible, but none match officer_id = ${userId}. Check shifts.officer_id values for this user.`
            );
          }
        }
      }

      // 4) Incidents: STRICT rule = no shift => no incidents section
      // Since incidents table is not ready yet, keep it simple:
      const incidentText = todayShiftData?.id ? "No incidents for today" : null;

      if (!alive) return;

      if (!profError && prof) {
        setProfile({
          id: prof.id,
          emp_id: prof.emp_id,
          first_name: prof.first_name,
          avatar_url: avatarUrl,
        });
      } else {
        setProfile(null);
      }

      setTodayShift(todayShiftData);
      setUpcoming(upcomingShifts ?? []);
      setTodayIncidentSummary(incidentText);
      setLoading(false);
    };

    load();

    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const name = profile?.first_name || "Officer";

  const avatarSource =
    profile?.avatar_url && !avatarLoadFailed
      ? { uri: profile.avatar_url }
      : require("../../assets/fortis-logo.png");
  const todayDateText = todayShift
    ? new Date(todayShift.shift_date).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: DISPLAY_TIME_ZONE,
      })
    : new Date().toLocaleDateString("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: DISPLAY_TIME_ZONE,
      });

  return (
    <View style={styles.root}>
      <ImageBackground
        source={require("./assets/header.png")}
        style={styles.header}
        imageStyle={styles.headerImage}
      >
        <View style={styles.headerTopRow}>
          <View style={styles.profileRow}>
            <Image
              source={avatarSource}
              style={styles.avatar}
              onError={() => setAvatarLoadFailed(true)}
            />
            <View>
              <Text style={styles.hiText}>Hi {name}!</Text>
              <Text style={styles.welcomeText}>Welcome Back</Text>
            </View>
          </View>

          <View style={styles.headerIcons}>
            <Pressable onPress={() => router.push("/securityofficer/translate")}>
              <Languages color="#fff" size={22} />
            </Pressable>
            <Pressable onPress={() => router.push("/securityofficer/notifications")}>
              <Bell color="#fff" size={22} />
            </Pressable>
            <Pressable onPress={() => router.push("/securityofficer/settings")}>
              <Settings color="#fff" size={22} />
            </Pressable>
          </View>
        </View>

        <View style={styles.quickRow}>
          <QuickAction label="ID Card" Icon={CreditCard} onPress={() => router.push("/securityofficer/id-card")} />
          <QuickAction label="Incidents" Icon={ShieldAlert} onPress={() => router.push("/securityofficer/incidents")} />
          <QuickAction label="Reports" Icon={FileText} onPress={() => router.push("/securityofficer/reports")} />
          <QuickAction label="All Services" Icon={Grid3X3} onPress={() => router.push("/securityofficer/services")} />
        </View>
      </ImageBackground>

      {todayShift ? (
        <View style={styles.todayShiftCard}>
          <View style={styles.todayInfoBlock}>
            <View style={styles.todayInfoIconWrap}>
              <Ionicons name="calendar-outline" size={45} color="#F1A579" />
            </View>
            <View style={styles.todayInfoTextCol}>
              <Text style={styles.cardTitle}>{todayDateText}</Text>
              <Text style={styles.todayShiftLocation}>Location: {todayShift.location ?? "-"}</Text>
            </View>
          </View>

          <View style={styles.timelineWrap}>
            <View style={styles.timelineRow}>
              <View style={styles.timelineEdgeLabel}>
                <Text style={styles.timelineCaption}>Start time</Text>
                <Text style={styles.timelineValue}>{formatTime(todayShift.shift_start)}</Text>
              </View>

              <View style={styles.timelineCenter}>
                <Text style={styles.timelineNow}>{formatTime(currentTime.toISOString())}</Text>
                <View style={styles.timelineTrack}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineBar} />
                  <View style={styles.timelineDot} />
                </View>
              </View>

              <View style={styles.timelineEdgeLabel}>
                <Text style={styles.timelineCaption}>End time</Text>
                <Text style={styles.timelineValue}>{formatTime(todayShift.shift_end)}</Text>
              </View>
            </View>
          </View>

          <Pressable
            style={styles.clockInButton}
            onPress={() =>
              router.push({
                pathname: "/securityofficer/clock-in",
                params: { shiftData: JSON.stringify(todayShift) },
              })
            }
          >
            <Text style={styles.clockInButtonText}>CLOCK IN</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{todayDateText}</Text>
          <Text style={styles.cardSubtitle}>No scheduled shift today</Text>
        </View>
      )}

      {todayIncidentSummary && (
        <>
          <View style={styles.incidentsHeader}>
            <Text style={styles.sectionTitle}>Incidents</Text>
          </View>

          <Pressable
            style={[styles.card, styles.incidentCard]}
            onPress={() => router.push("/securityofficer/incidents")}
          >
            <Text style={[styles.cardSubtitle, { color: "#7C1515", marginTop: 0 }]}>
              {todayIncidentSummary}
            </Text>
          </Pressable>
        </>
      )}

      <View style={styles.scheduleHeader}>
        <Text style={styles.sectionTitle}>Upcoming Schedule</Text>
        <Pressable onPress={() => router.push("/securityofficer/schedule")}> 
          <Text style={styles.viewAll}>View all &gt;</Text>
        </Pressable>
      </View>

      <FlatList
        data={upcoming}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: 20 }}
        ListEmptyComponent={
          <Text style={{ paddingHorizontal: 16, color: "#6B7280", fontWeight: "600" }}>
            {loadError ?? debugEmptyReason ?? "No upcoming shifts found."}
          </Text>
        }
        renderItem={({ item }) => {
          const dateObj = new Date(item.shift_date);
          const dateString = dateObj.toLocaleDateString("en-GB", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
            timeZone: DISPLAY_TIME_ZONE,
          });

          return (
            <Pressable 
              style={styles.shiftCard} // Add shadow and background color in styles
              onPress={() => router.push({
                pathname: "/securityofficer/shift-details",
                params: { shiftData: JSON.stringify(item) }
              })}
            >
              <View>
                <Text style={styles.shiftDate}>{dateString}</Text>
                <Text style={styles.shiftTime}>
                  {formatTimeRange(item.shift_start, item.shift_end)}
                </Text>
              </View>
              <Text style={styles.viewArrow}>&gt;</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function QuickAction({ label, Icon, onPress }: any) {
  return (
    <Pressable style={styles.quickAction} onPress={onPress}>
      <View style={styles.quickIcon}>
        <Icon color="#fff" size={22} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function formatTimeRange(startISO: string, endISO: string) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const opts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  };
  return `${start.toLocaleTimeString([], opts)} - ${end.toLocaleTimeString([], opts)}`;
}

function formatTime(iso: string) {
  const date = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  };
  return date.toLocaleTimeString([], opts);
}
