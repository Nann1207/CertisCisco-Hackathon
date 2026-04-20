import React, { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, ChevronLeft, CircleX, Clock3 } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { getProfilePhotoUrlFromPath } from "../../lib/profilePhotos";
import { supabase } from "../../lib/supabase";

const DISPLAY_TIME_ZONE = "Asia/Singapore";

type ShiftOfficerRow = {
  shift_id: string;
  officer_id: string | null;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  clockin_time: string | null;
  clockout_time: string | null;
  completion_status: boolean | null;
  employees:
    | {
        id: string;
        first_name: string | null;
        last_name: string | null;
        role: string | null;
        profile_photo_path: string | null;
      }
    | {
        id: string;
        first_name: string | null;
        last_name: string | null;
        role: string | null;
        profile_photo_path: string | null;
      }[]
    | null;
};

type CandidateOfficer = {
  officerId: string;
  shiftId: string;
  shiftDate: string;
  shiftStart: string;
  shiftEnd: string;
  clockinTime: string | null;
  clockoutTime: string | null;
  completionStatus: boolean | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  profilePhotoUrl: string | null;
  hasActiveAssignment: boolean;
  alreadyAssignedToIncident: boolean;
};

type ActiveAssignmentRow = {
  officer_id: string | null;
  officer_name: string | null;
};

type SupervisorName = {
  first_name: string | null;
  last_name: string | null;
};

type ShiftWindow = {
  shiftDate: string;
  shiftStart: string;
  shiftEnd: string;
};

type ExistingAssignedOfficer = {
  officerId: string;
  officerName: string;
  profilePhotoUrl: string | null;
};

export default function SsoAddBackupPage() {
  const router = useRouter();
  const { incidentId } = useLocalSearchParams<{ incidentId?: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [supervisorId, setSupervisorId] = useState<string | null>(null);
  const [supervisorName, setSupervisorName] = useState("-");
  const [candidates, setCandidates] = useState<CandidateOfficer[]>([]);
  const [existingAssigned, setExistingAssigned] = useState<ExistingAssignedOfficer[]>([]);
  const [selectedOfficerIds, setSelectedOfficerIds] = useState<Set<string>>(new Set());

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

      setSupervisorId(userId);

      const { data: supervisorProfile } = await supabase
        .from("employees")
        .select("first_name, last_name")
        .eq("id", userId)
        .maybeSingle<SupervisorName>();

      if (alive && supervisorProfile) {
        const fullName = `${(supervisorProfile.first_name ?? "").trim()} ${(supervisorProfile.last_name ?? "").trim()}`.trim();
        setSupervisorName(fullName || "-");
      }

      const { data: existingAssignmentRows } = await supabase
        .from("incident_assignments")
        .select("officer_id, officer_name")
        .eq("incident_id", incidentId)
        .eq("active_status", true)
        .limit(200);

      const existingRows = (existingAssignmentRows as ActiveAssignmentRow[] | null) ?? [];
      const existingIds = new Set(
        existingRows.map((row) => row.officer_id).filter((id): id is string => Boolean(id))
      );

      const existingOfficerIds = Array.from(existingIds);
      let employeeById = new Map<string, { profile_photo_path: string | null }>();
      if (existingOfficerIds.length > 0) {
        const { data: employeeRows } = await supabase
          .from("employees")
          .select("id, profile_photo_path")
          .in("id", existingOfficerIds);

        employeeById = new Map(
          ((employeeRows as { id: string; profile_photo_path: string | null }[] | null) ?? []).map((row) => [row.id, { profile_photo_path: row.profile_photo_path }])
        );
      }

      const existingMapped = (
        await Promise.all(existingRows.map(async (row) => {
          const officerId = row.officer_id;
          if (!officerId) return null;
          const profile = employeeById.get(officerId) ?? null;
          return {
            officerId,
            officerName: row.officer_name?.trim() || "Assigned Officer",
            profilePhotoUrl: await getProfilePhotoUrlFromPath(profile?.profile_photo_path ?? null),
          } satisfies ExistingAssignedOfficer;
        }))
      )
        .filter((item): item is ExistingAssignedOfficer => Boolean(item));

      if (alive) {
        setExistingAssigned(existingMapped);
      }

      const today = new Date();
      const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      const { data: rows, error: rowsError } = await supabase
        .from("shifts")
        .select(
          "shift_id, officer_id, shift_date, shift_start, shift_end, clockin_time, clockout_time, completion_status, employees!shifts_officer_id_fkey(id, first_name, last_name, role, profile_photo_path)"
        )
        .eq("supervisor_id", userId)
        .eq("shift_date", todayISO)
        .order("shift_start", { ascending: true })
        .limit(200);

      if (rowsError) {
        if (alive) {
          setLoading(false);
          Alert.alert("Load failed", rowsError.message);
        }
        return;
      }

      const shiftRows = ((rows as ShiftOfficerRow[] | null) ?? []);
      const currentShift = selectCurrentShiftWindow(shiftRows);
      const sourceRows = currentShift
        ? shiftRows.filter(
            (row) =>
              row.shift_date === currentShift.shiftDate &&
              row.shift_start === currentShift.shiftStart &&
              row.shift_end === currentShift.shiftEnd
          )
        : shiftRows;

      const normalized = (
        await Promise.all((sourceRows.length > 0 ? sourceRows : shiftRows).map(async (row) => {
          const employee = Array.isArray(row.employees) ? row.employees[0] : row.employees;
          if (!row.officer_id || !employee?.id) return null;

          return {
            officerId: row.officer_id,
            shiftId: row.shift_id,
            shiftDate: row.shift_date,
            shiftStart: row.shift_start,
            shiftEnd: row.shift_end,
            clockinTime: row.clockin_time,
            clockoutTime: row.clockout_time,
            completionStatus: row.completion_status,
            firstName: employee.first_name,
            lastName: employee.last_name,
            role: employee.role,
            profilePhotoUrl: await getProfilePhotoUrlFromPath(employee.profile_photo_path),
            hasActiveAssignment: false,
            alreadyAssignedToIncident: false,
          } satisfies CandidateOfficer;
        }))
      )
        .filter((item): item is CandidateOfficer => Boolean(item));

      const uniqueByOfficer = new Map<string, CandidateOfficer>();
      for (const row of normalized) {
        if (!uniqueByOfficer.has(row.officerId)) {
          uniqueByOfficer.set(row.officerId, row);
        }
      }

      const uniqueCandidates = Array.from(uniqueByOfficer.values());
      const officerIds = uniqueCandidates.map((item) => item.officerId);

      let busyOfficerIds = new Set<string>();
      if (officerIds.length > 0) {
        const { data: activeAssignments } = await supabase
          .from("incident_assignments")
          .select("officer_id")
          .in("officer_id", officerIds)
          .eq("active_status", true);

        busyOfficerIds = new Set(
          ((activeAssignments as ActiveAssignmentRow[] | null) ?? [])
            .map((item) => item.officer_id)
            .filter((item): item is string => Boolean(item))
        );
      }

      const merged = uniqueCandidates.map((item) => ({
        ...item,
        hasActiveAssignment: busyOfficerIds.has(item.officerId),
        alreadyAssignedToIncident: existingIds.has(item.officerId),
      }));

      if (!alive) return;
      setCandidates(merged);
      setLoading(false);
    };

    void load();

    return () => {
      alive = false;
    };
  }, [incidentId]);

  const rankedCandidates = useMemo(() => {
    return candidates
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
          fullName: formatName(officer.firstName, officer.lastName),
        };
      })
      .sort((a, b) => {
        if (a.greenCount !== b.greenCount) return b.greenCount - a.greenCount;
        if (a.grayCount !== b.grayCount) return b.grayCount - a.grayCount;
        if (a.redCount !== b.redCount) return a.redCount - b.redCount;
        return a.fullName.localeCompare(b.fullName);
      });
  }, [candidates]);

  const selectedCount = selectedOfficerIds.size;

  const onToggleAssign = (officer: CandidateOfficer, canAssign: boolean) => {
    if (!canAssign) return;

    setSelectedOfficerIds((prev) => {
      const next = new Set(prev);
      if (next.has(officer.officerId)) {
        next.delete(officer.officerId);
        return next;
      }

      if (next.size >= 3) {
        Alert.alert("Selection limit", "You can add up to 3 backup officers at a time.");
        return next;
      }

      next.add(officer.officerId);
      return next;
    });
  };

  const onConfirm = async () => {
    if (saving || !incidentId || !supervisorId) return;

    if (selectedOfficerIds.size === 0) {
      Alert.alert("No officers selected", "Select at least one backup officer.");
      return;
    }

    const selectedCandidates = rankedCandidates
      .map((entry) => entry.officer)
      .filter((officer) => selectedOfficerIds.has(officer.officerId));

    if (selectedCandidates.length === 0) {
      Alert.alert("No officers selected", "Select at least one backup officer.");
      return;
    }

    setSaving(true);

    const rows = selectedCandidates.map((officer) => ({
      incident_id: incidentId,
      shift_id: officer.shiftId,
      officer_id: officer.officerId,
      officer_name: formatName(officer.firstName, officer.lastName),
      supervisor_id: supervisorId,
      supervisor_name: supervisorName,
      active_status: true,
    }));

    const { error } = await supabase.from("incident_assignments").insert(rows);

    setSaving(false);

    if (error) {
      Alert.alert("Assign failed", error.message);
      return;
    }

      // Clear persisted acknowledgement so the supervisor attention pulse
      // is stopped when returning to the incident view.
      try {
        if (incidentId) {
          const key = `sso_backup_ack:${incidentId}`;
          await AsyncStorage.removeItem(key);
        }
      } catch (err) {
        console.warn("[sso] failed to clear backup ack state:", err);
      }

      router.replace(`/sso/incident-after-assign?incidentId=${incidentId}`);
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topPanel}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => (router.canGoBack() ? router.back() : router.replace("/sso/home"))}>
            <ChevronLeft size={24} color="#FFFFFF" strokeWidth={2.6} />
          </Pressable>
          <Text style={styles.headerTitle}>Add Backup Officers</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : (
        <View style={styles.bodyPanel}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.assignedTitle}>Assigned Officers</Text>
            <View style={styles.assignedRow}>
              {existingAssigned.length > 0 ? (
                existingAssigned.map((officer) => (
                  <View key={officer.officerId} style={styles.assignedOfficerItem}>
                    <ProfileAvatar profilePhotoUrl={officer.profilePhotoUrl} fullName={officer.officerName} />
                    <Text style={styles.assignedOfficerName} numberOfLines={1}>{officer.officerName}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No assigned officers yet.</Text>
              )}
            </View>

            {rankedCandidates.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No officers found for your current shift.</Text>
              </View>
            ) : (
              rankedCandidates.map(({ officer, clockStatus, availabilityStatus, fullName }) => {
                const isSelected = selectedOfficerIds.has(officer.officerId);
                const canAssign =
                  availabilityStatus.tone === "green" &&
                  !officer.alreadyAssignedToIncident;

                return (
                  <View key={officer.officerId} style={styles.card}>
                    <View style={styles.topRow}>
                      <View style={styles.profileRow}>
                        <ProfileAvatar profilePhotoUrl={officer.profilePhotoUrl} fullName={fullName} />
                        <View style={styles.profileTextCol}>
                          <Text style={styles.profileName}>{fullName}</Text>
                          <Text style={styles.profileRole}>{officer.role ?? "Security Officer"}</Text>
                        </View>
                      </View>

                      <View style={styles.badgesCol}>
                        <StatusBadge label={clockStatus.label} tone={clockStatus.tone} />
                        <StatusBadge label={availabilityStatus.label} tone={availabilityStatus.tone} />
                      </View>
                    </View>

                    <View style={styles.shiftRow}>
                      <View style={styles.shiftMeta}>
                        <Text style={styles.shiftMetaLabel}>Shift Date</Text>
                        <Text style={styles.shiftDate}>{formatDate(officer.shiftDate)}</Text>
                      </View>
                      <View style={styles.shiftMeta}>
                        <Text style={styles.shiftMetaLabel}>Shift Time</Text>
                        <Text style={styles.shiftTime}>{formatTimeRange(officer.shiftDate, officer.shiftStart, officer.shiftEnd)}</Text>
                      </View>
                    </View>

                    <Pressable
                      style={[
                        styles.assignBtn,
                        isSelected ? styles.assignBtnSelected : null,
                        !canAssign ? styles.assignBtnDisabled : null,
                      ]}
                      disabled={!canAssign}
                      onPress={() => onToggleAssign(officer, canAssign)}
                    >
                      <Text
                        style={[
                          styles.assignBtnText,
                          isSelected ? styles.assignBtnTextSelected : null,
                          !canAssign ? styles.assignBtnTextDisabled : null,
                        ]}
                      >
                        {officer.alreadyAssignedToIncident
                          ? "Already Assigned"
                          : isSelected
                            ? "Assigning"
                            : "Assign Incident"}
                      </Text>
                    </Pressable>
                  </View>
                );
              })
            )}

            <View style={styles.confirmWrap}>
              <LinearGradient
                colors={["#FF6A45", "#7C0002"]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={[
                  styles.confirmBtn,
                  (selectedCount === 0 || saving) ? styles.confirmBtnDisabled : null,
                ]}
              >
                <Pressable
                  style={styles.confirmBtnInner}
                  disabled={selectedCount === 0 || saving}
                  onPress={() => {
                    void onConfirm();
                  }}
                >
                  <Text style={styles.confirmBtnText}>{saving ? "Assigning..." : "CONFIRM"}</Text>
                </Pressable>
              </LinearGradient>
            </View>
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

function ProfileAvatar({ profilePhotoUrl, fullName }: { profilePhotoUrl: string | null; fullName: string }) {
  if (profilePhotoUrl) {
    return <Image source={{ uri: profilePhotoUrl }} style={styles.avatar} />;
  }

  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "SO";

  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarInitials}>{initials}</Text>
    </View>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "green" | "red" | "gray" }) {
  return (
    <View style={[styles.statusBadge, tone === "green" ? styles.badgeGreen : tone === "red" ? styles.badgeRed : styles.badgeGray]}>
      {tone === "green" ? <CheckCircle2 size={11} color="#FFFFFF" /> : tone === "red" ? <CircleX size={11} color="#FFFFFF" /> : <Clock3 size={11} color="#FFFFFF" />}
      <Text style={styles.statusBadgeText}>{label}</Text>
    </View>
  );
}

function getClockStatus(officer: CandidateOfficer) {
  if (officer.clockoutTime || officer.completionStatus) {
    return { label: "Shift Ended", tone: "red" as const, isClockedIn: false };
  }

  if (officer.clockinTime) {
    return { label: "Clocked In", tone: "green" as const, isClockedIn: true };
  }

  return { label: "Not Clocked In", tone: "gray" as const, isClockedIn: false };
}

function getAvailabilityStatus(officer: CandidateOfficer, isClockedIn: boolean) {
  if (!isClockedIn) {
    return { label: "Not Available", tone: "gray" as const };
  }

  if (officer.hasActiveAssignment) {
    return { label: "Busy", tone: "red" as const };
  }

  return { label: "Available", tone: "green" as const };
}

function formatName(firstName: string | null, lastName: string | null) {
  return `${firstName?.trim() ?? ""} ${lastName?.trim() ?? ""}`.trim() || "Security Officer";
}

function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  });
}

function formatTimeRange(shiftDate: string, startISO: string, endISO: string) {
  const start = formatShiftTime(shiftDate, startISO);
  const end = formatShiftTime(shiftDate, endISO);
  return `${start} - ${end}`;
}

function formatShiftTime(shiftDate: string, shiftValue: string) {
  const opts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  };

  const ts = parseShiftTimestamp(shiftDate, shiftValue);
  if (ts === null) return "--:--";
  return new Date(ts).toLocaleTimeString([], opts);
}

function selectCurrentShiftWindow(rows: ShiftOfficerRow[]): ShiftWindow | null {
  if (rows.length === 0) return null;

  const now = Date.now();
  for (const row of rows) {
    const start = parseShiftTimestamp(row.shift_date, row.shift_start);
    const end = parseShiftTimestamp(row.shift_date, row.shift_end);
    if (start === null || end === null) continue;
    if (now >= start && now <= end) {
      return {
        shiftDate: row.shift_date,
        shiftStart: row.shift_start,
        shiftEnd: row.shift_end,
      };
    }
  }

  const slotCounts = new Map<string, { count: number; slot: ShiftWindow }>();
  for (const row of rows) {
    const key = `${row.shift_date}|${row.shift_start}|${row.shift_end}`;
    const existing = slotCounts.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    slotCounts.set(key, {
      count: 1,
      slot: { shiftDate: row.shift_date, shiftStart: row.shift_start, shiftEnd: row.shift_end },
    });
  }

  const winner = Array.from(slotCounts.values()).sort((a, b) => b.count - a.count)[0];
  return winner?.slot ?? null;
}

function parseShiftTimestamp(shiftDate: string, shiftValue: string) {
  const raw = shiftValue?.trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (Number.isFinite(direct.getTime())) return direct.getTime();

  const combined = new Date(`${shiftDate}T${raw}`);
  if (Number.isFinite(combined.getTime())) return combined.getTime();

  return null;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0E2D52",
  },
  topPanel: {
    backgroundColor: "#0E2D52",
    paddingBottom: 18,
  },
  header: {
    paddingHorizontal: 12,
    paddingTop: 40,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
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
    marginLeft: 10,
    fontSize: 24,
    lineHeight: 22,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  bodyPanel: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 30,
    gap: 14,
  },
  assignedTitle: {
    color: "#0E2D52",
    fontSize: 13,
    lineHeight: 22,
    fontWeight: "700",
  },
  assignedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 10,
  },
  assignedOfficerItem: {
    width: 85,
    alignItems: "center",
  },
  assignedOfficerName: {
    marginTop: 4,
    color: "#4B5563",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyWrap: {
    borderRadius: 20,
    backgroundColor: "#FAFAFA",
    padding: 16,
    minHeight: 120,
    justifyContent: "center",
  },
  emptyText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  card: {
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 11.1,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#CBD5E1",
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0E2D52",
  },
  avatarInitials: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  profileTextCol: {
    marginLeft: 10,
    justifyContent: "center",
  },
  profileName: {
    color: "#000000",
    fontSize: 16,
    lineHeight: 16,
    fontWeight: "700",
  },
  profileRole: {
    marginTop: 1,
    color: "#7C7C7C",
    fontSize: 12,
    lineHeight: 13,
    fontWeight: "700",
  },
  badgesCol: {
    gap: 6,
    alignItems: "flex-end",
    maxWidth: 154,
  },
  statusBadge: {
    minHeight: 21,
    borderRadius: 11,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  badgeGreen: {
    backgroundColor: "#225518",
  },
  badgeRed: {
    backgroundColor: "#920507",
  },
  badgeGray: {
    backgroundColor: "#6B7280",
  },
  statusBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  shiftRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  shiftMeta: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "#FAFAFA",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  shiftMetaLabel: {
    color: "#9CA3AF",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  shiftDate: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  shiftTime: {
    color: "#4B5563",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  assignBtn: {
    alignSelf: "center",
    minWidth: 140,
    height: 32,
    borderRadius: 20,
    backgroundColor: "#2A2C31",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 14,
  },
  assignBtnDisabled: {
    backgroundColor: "#9CA3AF",
  },
  assignBtnSelected: {
    backgroundColor: "#9300D7",
    borderWidth: 3,
    borderColor: "#C773FF",
    shadowColor: "#9300D7",
    shadowOpacity: 0.45,
    shadowRadius: 6.3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 10,
  },
  assignBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  assignBtnTextSelected: {
    color: "#FFFFFF",
  },
  assignBtnTextDisabled: {
    color: "#E5E7EB",
  },
  confirmWrap: {
    marginTop: 18,
    alignSelf: "center",
    width: 215,
    borderRadius: 999,
    shadowColor: "#FF3639",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  confirmBtn: {
    width: "100%",
    height: 37,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(160, 176, 192, 0.4)",
  },
  confirmBtnInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnDisabled: {
    opacity: 0.45,
  },
  confirmBtnText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 25,
  },
});
