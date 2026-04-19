import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";
import { resolveProfilePhotoUrl } from "../../lib/profilePhotos";

const DISPLAY_TIME_ZONE = "Asia/Singapore";

type ShiftPayload = {
  id: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  location: string | null;
  address: string | null;
  supervisor_id: string | null;
};

type TeamOfficer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  profile_photo_path: string | null;
  avatarUrl: string | null;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  clockin_time: string | null;
  clockout_time: string | null;
  completion_status: boolean | null;
  hasActiveAssignment: boolean;
};

export default function SsoShiftDetailsScreen() {
  const router = useRouter();
  const { shiftData } = useLocalSearchParams<{ shiftData?: string }>();
  const initialShift = useMemo(() => parseShiftData(shiftData), [shiftData]);
  const [loading, setLoading] = useState(true);
  const [shift, setShift] = useState<ShiftPayload | null>(initialShift);
  const [team, setTeam] = useState<TeamOfficer[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setErrorText(null);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      if (!userId) {
        if (alive) {
          setErrorText(sessionError?.message ?? "Unable to load user session.");
          setLoading(false);
        }
        return;
      }

      let activeShift = initialShift;
      if (!activeShift) {
        const todayISO = new Date().toISOString().slice(0, 10);
        const { data: shiftRow, error: shiftError } = await supabase
          .from("shifts")
          .select("id:shift_id, shift_date, shift_start, shift_end, location, address, supervisor_id")
          .eq("supervisor_id", userId)
          .gte("shift_date", todayISO)
          .order("shift_date", { ascending: true })
          .order("shift_start", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (shiftError || !shiftRow) {
          if (alive) {
            setErrorText(shiftError?.message ?? "No shift details found.");
            setLoading(false);
          }
          return;
        }

        activeShift = shiftRow as ShiftPayload;
      }

      const { data: rows, error: rowsError } = await supabase
        .from("shifts")
        .select(`
          officer_id,
          shift_date,
          shift_start,
          shift_end,
          clockin_time,
          clockout_time,
          completion_status,
          employees!shifts_officer_id_fkey(id, first_name, last_name, role, profile_photo_path)
        `)
        .eq("supervisor_id", activeShift.supervisor_id ?? userId)
        .eq("shift_date", activeShift.shift_date)
        .eq("shift_start", activeShift.shift_start)
        .eq("shift_end", activeShift.shift_end)
        .order("shift_start", { ascending: true });

      if (rowsError) {
        if (alive) {
          setErrorText(rowsError.message);
          setLoading(false);
        }
        return;
      }

      const mappedTeam = await Promise.all(
        ((rows ?? []) as any[]).map(async (row) => {
          const employee = Array.isArray(row.employees) ? row.employees[0] : row.employees;
          const avatarUrl = employee ? await resolveProfilePhotoUrl(employee) : null;

          return {
            id: employee?.id ?? row.officer_id,
            first_name: employee?.first_name ?? null,
            last_name: employee?.last_name ?? null,
            role: employee?.role ?? "Security Officer",
            profile_photo_path: employee?.profile_photo_path ?? null,
            avatarUrl,
            shift_date: row.shift_date,
            shift_start: row.shift_start,
            shift_end: row.shift_end,
            clockin_time: row.clockin_time ?? null,
            clockout_time: row.clockout_time ?? null,
            completion_status: row.completion_status ?? null,
            hasActiveAssignment: false,
          } satisfies TeamOfficer;
        })
      );

      const officerIds = Array.from(new Set(mappedTeam.map((member) => member.id).filter(Boolean)));
      let busyOfficerIds = new Set<string>();

      if (officerIds.length > 0) {
        const { data: activeAssignments } = await supabase
          .from("incident_assignments")
          .select("officer_id")
          .in("officer_id", officerIds)
          .eq("active_status", true);

        busyOfficerIds = new Set(
          ((activeAssignments as { officer_id: string | null }[] | null) ?? [])
            .map((row) => row.officer_id)
            .filter((id): id is string => Boolean(id))
        );
      }

      const mappedTeamWithAvailability = mappedTeam.map((member) => ({
        ...member,
        hasActiveAssignment: busyOfficerIds.has(member.id),
      }));

      if (!alive) return;

      setShift(activeShift);
      setTeam(mappedTeamWithAvailability);
      setLoading(false);
    };

    void load();

    return () => {
      alive = false;
    };
  }, [initialShift]);

  const dayTitle = shift
    ? new Date(shift.shift_date).toLocaleDateString("en-GB", {
        weekday: "long",
        timeZone: DISPLAY_TIME_ZONE,
      })
    : "Shift";
  const dateTitle = shift
    ? new Date(shift.shift_date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: DISPLAY_TIME_ZONE,
      })
    : "-";

  const shiftDuration = shift ? getDurationLabel(shift.shift_start, shift.shift_end) : "-";

  const rankedTeam = useMemo(() => {
    return team
      .map((officer) => {
        const clockStatus = getClockStatus(officer);
        const availabilityStatus = getAvailabilityStatus(officer, clockStatus.isClockedIn);
        const tones = [clockStatus.tone, availabilityStatus.tone];

        const greenCount = tones.filter((tone) => tone === "green").length;
        const grayCount = tones.filter((tone) => tone === "gray").length;
        const redCount = tones.filter((tone) => tone === "red").length;

        return {
          officer,
          clockStatus,
          availabilityStatus,
          greenCount,
          grayCount,
          redCount,
          sortName: formatName(officer.first_name, officer.last_name),
        };
      })
      .sort((a, b) => {
        if (a.greenCount !== b.greenCount) return b.greenCount - a.greenCount;
        if (a.grayCount !== b.grayCount) return b.grayCount - a.grayCount;
        if (a.redCount !== b.redCount) return a.redCount - b.redCount;
        return a.sortName.localeCompare(b.sortName);
      });
  }, [team]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/sso/home"))}
        >
          <ChevronLeft size={22} color="#0E2D52" />
        </Pressable>
        <Text style={styles.headerTitle}>Shift Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color="#0E2D52" />
        </View>
      ) : errorText || !shift ? (
        <View style={styles.loaderWrap}>
          <Text style={styles.errorText}>{errorText ?? "Unable to load shift details."}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.dayTitle}>{dayTitle}<Text style={styles.dayAccent}>.</Text></Text>
          <Text style={styles.dateTitle}>{dateTitle}</Text>
          <Text style={styles.timeTitle}>{formatTimeRange(shift.shift_start, shift.shift_end)}</Text>

          <InfoCard label="Location" value={shift.location ?? "-"} />
          <InfoCard label="Address" value={shift.address ?? "-"} />
          <InfoCard label="Shift Duration" value={shiftDuration} />
          <InfoCard label="Shift Type" value="Rotational" />

          <Text style={styles.teamTitle}>Your Team</Text>

          {rankedTeam.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No officers assigned to this shift yet.</Text>
            </View>
          ) : (
            rankedTeam.map(({ officer, clockStatus, availabilityStatus }) => (
              <View key={officer.id} style={styles.officerCard}>
                <View style={styles.officerHeader}>
                  <OfficerAvatar officer={officer} />
                  <View style={styles.officerText}>
                    <Text style={styles.officerName}>{formatName(officer.first_name, officer.last_name)}</Text>
                    <Text style={styles.officerRole}>{officer.role ?? "Security Officer"}</Text>
                  </View>

                  <View style={styles.pillRow}>
                    <StatusPill label={clockStatus.label} tone={clockStatus.tone} />
                    <StatusPill label={availabilityStatus.label} tone={availabilityStatus.tone} />
                  </View>
                </View>

                <View style={styles.assignmentRow}>
                  <View style={styles.assignmentCol}>
                    <Text style={styles.assignmentDate}>{formatCardDate(officer.shift_date)}</Text>
                    <Text style={styles.assignmentTime}>{formatTimeRange(officer.shift_start, officer.shift_end)}</Text>
                  </View>
                  <Text style={styles.assignmentArrow}>{"<---->"}</Text>
                  <View style={[styles.assignmentCol, styles.assignmentColRight]}>
                    <Text style={styles.assignmentDate}>{formatCardDate(officer.shift_date)}</Text>
                    <Text style={styles.assignmentTime}>{formatTimeRange(officer.shift_start, officer.shift_end)}</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function OfficerAvatar({ officer }: { officer: TeamOfficer }) {
  const initials = `${officer.first_name?.[0] ?? ""}${officer.last_name?.[0] ?? ""}`.toUpperCase() || "SO";

  if (officer.avatarUrl) {
    return <Image source={{ uri: officer.avatarUrl }} style={styles.avatar} />;
  }

  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarFallbackText}>{initials}</Text>
    </View>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "green" | "red" | "gray" }) {
  return <Text style={[styles.statusPill, tone === "green" ? styles.greenPill : tone === "red" ? styles.redPill : styles.grayPill]}>{label}</Text>;
}

function getClockStatus(officer: TeamOfficer) {
  if (officer.clockout_time || officer.completion_status) {
    return {
      label: "Shift Ended",
      tone: "red" as const,
      isClockedIn: false,
    };
  }

  if (officer.clockin_time) {
    return {
      label: "Clocked In",
      tone: "green" as const,
      isClockedIn: true,
    };
  }

  return {
    label: "Not Clocked In",
    tone: "gray" as const,
    isClockedIn: false,
  };
}

function getAvailabilityStatus(officer: TeamOfficer, isClockedIn: boolean) {
  if (!isClockedIn) {
    return {
      label: "Not Available",
      tone: "gray" as const,
    };
  }

  if (officer.hasActiveAssignment) {
    return {
      label: "Busy",
      tone: "red" as const,
    };
  }

  return {
    label: "Available",
    tone: "green" as const,
  };
}

function parseShiftData(raw?: string) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ShiftPayload;
  } catch {
    return null;
  }
}

function formatName(firstName: string | null, lastName: string | null) {
  return `${firstName?.trim() ?? ""} ${lastName?.trim() ?? ""}`.trim() || "Security Officer";
}

function formatTimeRange(startISO: string, endISO: string) {
  return `${formatTime(startISO)} - ${formatTime(endISO)}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  }).toLowerCase();
}

function formatCardDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  });
}

function getDurationLabel(startISO: string, endISO: string) {
  const diffMs = new Date(endISO).getTime() - new Date(startISO).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return "-";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
  if (minutes === 0) return `${hours} Hours`;
  return `${hours}h ${minutes}m`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 40,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: "#374151",
    fontSize: 20,
    fontWeight: "700",
  },
  headerSpacer: {
    width: 36,
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  errorText: {
    color: "#B91C1C",
    textAlign: "center",
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  dayTitle: {
    color: "#222222",
    fontSize: 32,
    fontWeight: "800",
    marginTop: 6,
  },
  dayAccent: {
    color: "#5154FF",
  },
  dateTitle: {
    color: "#A1A1AA",
    fontSize: 18,
    fontWeight: "500",
    marginTop: 2,
  },
  timeTitle: {
    color: "#374151",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 16,
  },
  infoCard: {
    borderRadius: 14,
    backgroundColor: "#FAFAFA",
    borderWidth: 1,
    borderColor: "#F3F4F6",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  infoLabel: {
    color: "#A1A1AA",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  infoValue: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700",
  },
  teamTitle: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 12,
  },
  emptyCard: {
    borderRadius: 16,
    backgroundColor: "#FAFAFA",
    padding: 18,
  },
  emptyText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "600",
  },
  officerCard: {
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F3F4F6",
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
  },
  officerHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#D1D5DB",
  },
  avatarFallback: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0E2D52",
  },
  avatarFallbackText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  officerText: {
    flex: 1,
    marginLeft: 12,
  },
  officerName: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "800",
  },
  officerRole: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  pillRow: {
    alignItems: "flex-end",
    gap: 6,
  },
  statusPill: {
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  greenPill: {
    backgroundColor: "#3F7D20",
  },
  redPill: {
    backgroundColor: "#D11F2A",
  },
  grayPill: {
    backgroundColor: "#64748B",
  },
  assignmentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  assignmentCol: {
    flex: 1,
  },
  assignmentColRight: {
    alignItems: "flex-end",
  },
  assignmentDate: {
    color: "#4B5563",
    fontSize: 14,
    fontWeight: "700",
  },
  assignmentTime: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  assignmentArrow: {
    color: "#9CA3AF",
    fontWeight: "700",
    marginHorizontal: 12,
  },
});
