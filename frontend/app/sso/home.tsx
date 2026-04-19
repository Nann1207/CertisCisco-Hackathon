import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text as RNText,
  Image,
  ImageBackground,
  Pressable,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
  Alert,
  Modal,
} from "react-native";
import Text from "../../components/TranslatedText";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import ServicesModal from "./components/services";
import SupervisorIncidentAlertModal from "./components/SupervisorIncidentAlertModal";

const DISPLAY_TIME_ZONE = "Asia/Singapore";
const AVATAR_BUCKET = "profile-photos";
const USE_SIGNED_URL = true;

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
  clockin_time: string | null;
  clockout_time: string | null;
  completion_status: boolean | null;
  location: string | null;
  address: string | null;
  supervisor_id: string | null;
};

type UpcomingShift = {
  id: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  clockin_time: string | null;
  clockout_time: string | null;
  completion_status: boolean | null;
  location: string | null;
  address: string | null;
  supervisor_id: string | null;
};

type ActiveIncidentRow = {
  incident_id: string;
  active_status: boolean | null;
};

export default function Home() {
  const router = useRouter();
  const { clockedInShiftId, clockedInAt } = useLocalSearchParams<{
    clockedInShiftId?: string;
    clockedInAt?: string;
  }>();
  const { width } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [todayShifts, setTodayShifts] = useState<Shift[]>([]);
  const [todayIncidentSummary, setTodayIncidentSummary] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingShift[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [debugEmptyReason, setDebugEmptyReason] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [activeClockedInShiftId, setActiveClockedInShiftId] = useState<string | null>(null);
  const [isSavingShiftAction, setIsSavingShiftAction] = useState(false);
  const [showEarlyClockOutModal, setShowEarlyClockOutModal] = useState(false);
  const [earlyClockOutShiftId, setEarlyClockOutShiftId] = useState<string | null>(null);
  const [earlyClockOutFromText, setEarlyClockOutFromText] = useState<string>("");
  const [showServices, setShowServices] = useState(false);

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const calendarIconSize = Math.round(clamp(width * 0.11, 34, 45));
  const calendarDateFontSize = Math.round(clamp(width * 0.045, 14, 17));
  const calendarLocationFontSize = Math.round(clamp(width * 0.04, 13, 16));
  const horizontalPadding = Math.round(clamp(width * 0.04, 12, 20));
  const scheduleTitleSize = Math.round(clamp(width * 0.044, 14, 17));
  const scheduleLinkSize = Math.round(clamp(width * 0.036, 12, 14));

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!clockedInShiftId || !clockedInAt) return;

    const parsed = new Date(clockedInAt);
    if (!Number.isFinite(parsed.getTime())) return;

    setActiveClockedInShiftId(clockedInShiftId);
    setTodayShifts((prev) =>
      prev.map((shift) =>
        shift.id === clockedInShiftId
          ? { ...shift, clockin_time: clockedInAt, clockout_time: null, completion_status: false }
          : shift
      )
    );
  }, [clockedInAt, clockedInShiftId]);

  useEffect(() => {
    if (activeClockedInShiftId) return;

    const dbActiveShift = todayShifts.find((shift) => shift.clockin_time && !shift.clockout_time);
    if (dbActiveShift) {
      setActiveClockedInShiftId(dbActiveShift.id);
    }
  }, [activeClockedInShiftId, todayShifts]);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [profile?.avatar_url]);

  useEffect(() => {
    let alive = true;

    const getAvatarUrlFromFolder = async (userId: string) => {
      const folder = `employees/${userId}`;
      const { data: files, error: listError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .list(folder, { limit: 10, sortBy: { column: "name", order: "asc" } });

      if (listError || !files || files.length === 0) return null;

      const file = files.find((item) => item.name && !item.name.endsWith("/")) ?? files[0];
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

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      setDebugEmptyReason(null);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (userId) {
        setAuthUserId(userId);
      }

      if (sessionError || !userId) {
        if (alive) setLoadError("Unable to load user session.");
        if (alive) setLoading(false);
        return;
      }

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
        avatarUrl = await getAvatarUrlFromFolder(userId);
      }

      const now = new Date();
      const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
        now.getDate()
      ).padStart(2, "0")}`;

      const { data: todayShiftsRaw, error: todayShiftError } = await supabase
        .from("shifts")
        .select("id:shift_id, shift_date, shift_start, shift_end, clockin_time, clockout_time, completion_status, location, address, supervisor_id")
        .eq("supervisor_id", userId)
        .eq("shift_date", todayISO)
        .order("shift_start", { ascending: true });

      const { data: upcomingShiftsRaw, error: upcomingError } = await supabase
        .from("shifts")
        .select("id:shift_id, shift_date, shift_start, shift_end, clockin_time, clockout_time, completion_status, location, address, supervisor_id")
        .eq("supervisor_id", userId)
        .gte("shift_date", todayISO)
        .order("shift_date", { ascending: true })
        .order("shift_start", { ascending: true })
        .limit(5);

      const { data: activeIncidentsRaw, error: activeIncidentError } = await supabase
        .from("incidents")
        .select("incident_id, active_status")
        .eq("supervisor_id", userId)
        .eq("active_status", true)
        .order("created_at", { ascending: false })
        .limit(50);

      const upcomingShifts: UpcomingShift[] = (upcomingShiftsRaw ?? [])
        .filter((shiftItem: any) => !shiftItem.completion_status)
        .map((shiftItem: any) => ({
          id: shiftItem.id,
          shift_date: shiftItem.shift_date,
          shift_start: shiftItem.shift_start,
          shift_end: shiftItem.shift_end,
          clockin_time: shiftItem.clockin_time ?? null,
          clockout_time: shiftItem.clockout_time ?? null,
          completion_status: shiftItem.completion_status ?? null,
          location: shiftItem.location ?? null,
          address: shiftItem.address ?? null,
          supervisor_id: shiftItem.supervisor_id ?? null,
        }));

      const todayShiftData: Shift[] = (todayShiftsRaw ?? [])
        .filter((shiftItem: any) => !shiftItem.completion_status)
        .map((shiftItem: any) => ({
          id: shiftItem.id,
          shift_date: shiftItem.shift_date,
          shift_start: shiftItem.shift_start,
          shift_end: shiftItem.shift_end,
          clockin_time: shiftItem.clockin_time ?? null,
          clockout_time: shiftItem.clockout_time ?? null,
          completion_status: shiftItem.completion_status ?? null,
          location: shiftItem.location ?? null,
          address: shiftItem.address ?? null,
          supervisor_id: shiftItem.supervisor_id ?? null,
        }));

      if (todayShiftError || upcomingError || activeIncidentError) {
        setLoadError("Unable to load shifts right now.");
      }

      if (!upcomingError && (upcomingShiftsRaw?.length ?? 0) === 0) {
        const { data: visibleShifts, error: visibleError } = await supabase
          .from("shifts")
          .select("shift_id, supervisor_id, shift_date")
          .gte("shift_date", todayISO)
          .limit(20);

        if (!visibleError) {
          const visibleCount = visibleShifts?.length ?? 0;
          const hasMatchingSupervisor = (visibleShifts ?? []).some((item: any) => item.supervisor_id === userId);

          if (visibleCount === 0) {
            setDebugEmptyReason(
              `No shifts are visible for this session. Auth user: ${userId}. This usually means RLS policy is blocking select on shifts.`
            );
          } else if (!hasMatchingSupervisor) {
            setDebugEmptyReason(
              `Shifts are visible, but none match supervisor_id = ${userId}. Check shifts.supervisor_id values for this user.`
            );
          }
        }
      }

      const activeIncidents = ((activeIncidentsRaw as ActiveIncidentRow[] | null) ?? []).filter(
        (incident) => Boolean(incident.incident_id)
      );
      const incidentText =
        activeIncidents.length > 0
          ? `${activeIncidents.length} active incident${activeIncidents.length > 1 ? "s" : ""} require assignment`
          : todayShiftData.length > 0
            ? "No incidents for today"
            : null;

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

      setTodayShifts(todayShiftData);
      setUpcoming(upcomingShifts);
      setTodayIncidentSummary(incidentText);
      setLoading(false);
    };

    void load();

    return () => {
      alive = false;
    };
  }, []);

  const name = profile?.first_name || "Officer";

  const avatarSource =
    profile?.avatar_url && !avatarLoadFailed
      ? { uri: profile.avatar_url }
      : require("../../assets/fortis-logo.png");

  const todayShift = useMemo(() => {
    return getDisplayShiftForToday(todayShifts, currentTime, activeClockedInShiftId);
  }, [activeClockedInShiftId, currentTime, todayShifts]);

  const isClockedInForTodayShift = Boolean(
    todayShift && activeClockedInShiftId && todayShift.id === activeClockedInShiftId
  );

  const canClockOut = Boolean(
    isClockedInForTodayShift && isClockOutWindowOpen(currentTime, todayShift?.shift_end)
  );

  const timelineProgress = getTimelineProgress(
    currentTime,
    todayShift?.shift_start,
    todayShift?.shift_end
  );

  const showElapsedTimeline = isClockedInForTodayShift && timelineProgress !== null;
  const normalizedProgress = showElapsedTimeline ? Math.max(0, Math.min(1, timelineProgress)) : 0;
  const elapsedTrackPercent = normalizedProgress * 100;
  const hasReachedShiftEnd = normalizedProgress >= 1;

  const completeClockOut = async (shiftToClockOut: Shift) => {
    const clockedOutAt = new Date().toISOString();
    setIsSavingShiftAction(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    if (!userId) {
      setIsSavingShiftAction(false);
      Alert.alert("Clock out failed", "No active login session. Please sign in again.");
      return;
    }

    const firstTry = await supabase
      .from("shifts")
      .update({ clockout_time: clockedOutAt, completion_status: true })
      .eq("shift_id", shiftToClockOut.id)
      .eq("supervisor_id", userId);

    if (firstTry.error) {
      setIsSavingShiftAction(false);
      const detail = firstTry.error.message ? `\n\nDetails: ${firstTry.error.message}` : "";
      Alert.alert("Clock out failed", `Unable to save clock-out time. Please try again.${detail}`);
      return;
    }

    const { data: verifyRow, error: verifyError } = await supabase
      .from("shifts")
      .select("clockout_time")
      .eq("shift_id", shiftToClockOut.id)
      .eq("supervisor_id", userId)
      .maybeSingle();

    if (verifyError || !verifyRow?.clockout_time) {
      setIsSavingShiftAction(false);
      Alert.alert(
        "Clock out not persisted",
        "Clock-out was not written to database. Check your shifts UPDATE RLS policy for authenticated users on this row."
      );
      return;
    }

    setTodayShifts((prev) =>
      prev.map((shift) =>
        shift.id === shiftToClockOut.id
          ? { ...shift, clockout_time: clockedOutAt, completion_status: true }
          : shift
      )
    );
    setActiveClockedInShiftId(null);
    setIsSavingShiftAction(false);
    router.push({
      pathname: "/sso/reports",
      params: {
        shiftId: shiftToClockOut.id,
      },
    });
  };

  const handleShiftButtonPress = async () => {
    if (!todayShift || isSavingShiftAction) return;

    if (isClockedInForTodayShift) {
      if (!canClockOut) {
        const earliestClockOut = getClockOutStartTime(todayShift.shift_end);
        setEarlyClockOutShiftId(todayShift.id);
        setEarlyClockOutFromText(formatTime(earliestClockOut.toISOString()));
        setShowEarlyClockOutModal(true);
        return;
      }

      await completeClockOut(todayShift);
      return;
    }

    router.push({
      pathname: "/sso/clock-in",
      params: { shiftData: JSON.stringify(todayShift) },
    });
  };

  const todayDateText = (todayShift ? new Date(todayShift.shift_date) : new Date()).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  });

  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ImageBackground
        source={require("../securityofficer/assets/header.png")}
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
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <Text style={styles.hiText}>Hi </Text>
                <RNText style={styles.hiText}>{name}!</RNText>
              </View>
              <Text style={styles.welcomeText}>Welcome Back</Text>
            </View>
          </View>

          <View style={styles.headerIcons}>
            <Pressable onPress={() => router.push("/sso/translate")}>
              <Languages color="#fff" size={22} />
            </Pressable>
            <Pressable onPress={() => router.push("/sso/notifications")}>
              <Bell color="#fff" size={22} />
            </Pressable>
            <Pressable onPress={() => router.push("/sso/settings")}>
              <Settings color="#fff" size={22} />
            </Pressable>
          </View>
        </View>

        <View style={styles.quickRow}>
          <QuickAction label="ID Card" Icon={CreditCard} onPress={() => router.push("/sso/id-card")} />
          <QuickAction label="Incidents" Icon={ShieldAlert} onPress={() => router.push("/sso/incidents")} />
          <QuickAction label="Reports" Icon={FileText} onPress={() => router.push("/sso/reports")} />
          <QuickAction label="All Services" Icon={Grid3X3} onPress={() => setShowServices(true)} />
        </View>
      </ImageBackground>

      {todayShift ? (
        <View style={[styles.todayShiftCard, { marginHorizontal: horizontalPadding }]}>
          <View style={styles.todayInfoBlock}>
            <View style={styles.todayInfoIconWrap}>
              <Ionicons name="calendar-outline" size={calendarIconSize} color="#F1A579" />
            </View>
            <View style={styles.todayInfoTextCol}>
              <Text style={[styles.cardTitle, { fontSize: calendarDateFontSize }]}>{todayDateText}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
                <Text style={[styles.todayShiftLocation, { fontSize: calendarLocationFontSize }]}>Location: </Text>
                <RNText style={[styles.todayShiftLocation, { fontSize: calendarLocationFontSize }]}>
                  {todayShift.location ?? "-"}
                </RNText>
              </View>
            </View>
            {isClockedInForTodayShift ? (
              <View style={styles.onShiftPill}>
                <View style={styles.onShiftDot} />
                <Text style={styles.onShiftText}>ON SHIFT</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.timelineWrap}>
            <View style={styles.timelineRow}>
              <View style={styles.timelineEdgeLabel}>
                <Text style={styles.timelineCaption}>Start time</Text>
                <Text style={styles.timelineValue}>{formatTime(todayShift.shift_start)}</Text>
              </View>

              <View style={styles.timelineCenter}>
                <Text style={[styles.timelineNow, showElapsedTimeline ? styles.timelineNowActive : null]}>
                  {formatTime(currentTime.toISOString())}
                </Text>
                <View style={styles.timelineTrack}>
                  <View style={[styles.timelineDot, showElapsedTimeline ? styles.timelineDotActive : null]} />
                  <View style={styles.timelineBarWrap}>
                    <View style={styles.timelineBar} />
                    {showElapsedTimeline ? (
                      <View style={[styles.timelineBarElapsed, { width: `${elapsedTrackPercent}%` }]} />
                    ) : null}
                  </View>
                  <View style={[styles.timelineDot, hasReachedShiftEnd ? styles.timelineDotActive : null]} />
                </View>
              </View>

              <View style={styles.timelineEdgeLabel}>
                <Text style={styles.timelineCaption}>End time</Text>
                <Text style={styles.timelineValue}>{formatTime(todayShift.shift_end)}</Text>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 14 }}>
            <Pressable
              style={styles.clockInButton}
              onPress={() => {
                void handleShiftButtonPress();
              }}
            >
              <Text style={styles.clockInButtonText}>
                {isSavingShiftAction ? "Saving..." : isClockedInForTodayShift ? "CLOCK OUT" : "CLOCK IN"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/sso/shift-details",
                  params: { shiftData: JSON.stringify(todayShift) },
                })
              }
            >
              <Text style={{ color: "#9B2C2C", fontWeight: "700", fontSize: 14 , alignContent: "Left"}}>Shift Details</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[styles.card, { marginHorizontal: horizontalPadding }]}>
          <Text style={styles.cardTitle}>{todayDateText}</Text>
          <Text style={styles.cardSubtitle}>No scheduled shift today</Text>
        </View>
      )}

      {todayShift && todayIncidentSummary ? (
        <>
          <View style={[styles.incidentsHeader, { marginHorizontal: horizontalPadding }]}>
            <Text style={[styles.sectionTitle, { fontSize: scheduleTitleSize }]}>Incidents</Text>
          </View>

          <Pressable
            style={[styles.card, styles.incidentCard, { marginHorizontal: horizontalPadding }]}
            onPress={() => router.push("/sso/incidents")}
          >
            <Text style={[styles.cardSubtitle, { color: "#7C1515", marginTop: 0 }]}>
              {todayIncidentSummary}
            </Text>
          </Pressable>
        </>
      ) : null}

      <View style={[styles.scheduleHeader, { marginHorizontal: horizontalPadding }]}>
        <Text style={[styles.sectionTitle, { fontSize: scheduleTitleSize }]}>Upcoming Schedule</Text>
        <Pressable onPress={() => router.push("/sso/upcoming-shift-details")}>
          <Text style={[styles.viewAll, { fontSize: scheduleLinkSize }]}>View all &gt;</Text>
        </Pressable>
      </View>

      <FlatList
        data={upcoming}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 12, paddingHorizontal: horizontalPadding, paddingBottom: 20 }}
        ListEmptyComponent={
          <Text style={{ paddingHorizontal: horizontalPadding, color: "#6B7280", fontWeight: "600" }}>
            {loadError ?? debugEmptyReason ?? "No upcoming shifts found."}
          </Text>
        }
        renderItem={({ item }) => {
          const dateString = new Date(item.shift_date).toLocaleDateString("en-GB", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
            timeZone: DISPLAY_TIME_ZONE,
          });

          return (
            <Pressable
              style={styles.shiftCard}
              onPress={() =>
                router.push({
                  pathname: "/sso/shift-details",
                  params: { shiftData: JSON.stringify(item) },
                })
              }
            >
              <View>
                <Text style={styles.shiftDate}>{dateString}</Text>
                <Text style={styles.shiftTime}>{formatTimeRange(item.shift_start, item.shift_end)}</Text>
              </View>
              <Text style={styles.viewArrow}>&gt;</Text>
            </Pressable>
          );
        }}
      />

      <Modal
        visible={showEarlyClockOutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEarlyClockOutModal(false)}
      >
        <View style={styles.earlyModalBackdrop}>
          <View style={styles.earlyModalCard}>
            <Text style={styles.earlyModalTitle}>Clock Out Early?</Text>
            <Text style={styles.earlyModalText}>You are clocking out before the allowed time.</Text>
            <Text style={styles.earlyModalSubText}>
              Regular clock-out starts from {earlyClockOutFromText}.
            </Text>

            <View style={styles.earlyModalActions}>
              <Pressable
                style={styles.earlyModalCancelBtn}
                onPress={() => {
                  setShowEarlyClockOutModal(false);
                  setEarlyClockOutShiftId(null);
                }}
              >
                <Text style={styles.earlyModalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={styles.earlyModalConfirmBtn}
                onPress={() => {
                  setShowEarlyClockOutModal(false);
                  const pendingId = earlyClockOutShiftId;
                  setEarlyClockOutShiftId(null);
                  const targetShift = todayShifts.find((shift) => shift.id === pendingId);
                  if (targetShift) {
                    void completeClockOut(targetShift);
                  }
                }}
              >
                <Text style={styles.earlyModalConfirmText}>Yes, clock out early</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ServicesModal visible={showServices} onClose={() => setShowServices(false)} />
      <SupervisorIncidentAlertModal supervisorId={authUserId} />
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
  const opts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  };
  return `${new Date(startISO).toLocaleTimeString([], opts)} - ${new Date(endISO).toLocaleTimeString([], opts)}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  });
}

function getTimelineProgress(now: Date, shiftStart?: string, shiftEnd?: string) {
  if (!shiftStart || !shiftEnd) return null;

  const startMs = new Date(shiftStart).getTime();
  const endMs = new Date(shiftEnd).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;

  const nowMs = now.getTime();
  if (nowMs <= startMs) return 0;
  if (nowMs >= endMs) return 1;

  return (nowMs - startMs) / (endMs - startMs);
}

function getClockOutStartTime(shiftEnd: string) {
  return new Date(new Date(shiftEnd).getTime() - 5 * 60 * 1000);
}

function isClockOutWindowOpen(now: Date, shiftEnd?: string) {
  if (!shiftEnd) return false;
  const endMs = new Date(shiftEnd).getTime();
  if (!Number.isFinite(endMs)) return false;

  return now.getTime() >= endMs - 5 * 60 * 1000;
}

function getDisplayShiftForToday(todayShifts: Shift[], now: Date, activeClockedInShiftId: string | null) {
  if (todayShifts.length === 0) return null;

  const sorted = [...todayShifts].sort(
    (a, b) => new Date(a.shift_start).getTime() - new Date(b.shift_start).getTime()
  );

  if (activeClockedInShiftId) {
    const activeShift = sorted.find((shift) => shift.id === activeClockedInShiftId);
    if (activeShift && !activeShift.clockout_time && !activeShift.completion_status) {
      return activeShift;
    }
  }

  const dbActiveShift = sorted.find(
    (shift) => shift.clockin_time && !shift.clockout_time && !shift.completion_status
  );
  if (dbActiveShift) return dbActiveShift;

  const nowMs = now.getTime();
  return (
    sorted.find((shift) => {
      if (shift.clockout_time || shift.completion_status) return false;
      const shiftEndMs = new Date(shift.shift_end).getTime();
      return Number.isFinite(shiftEndMs) && shiftEndMs > nowMs;
    }) ?? null
  );
}
