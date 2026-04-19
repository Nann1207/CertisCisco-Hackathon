import React, { useEffect, useMemo, useState } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, ChevronLeft, Clock3, CircleX } from "lucide-react-native";
import Text from "../../components/TranslatedText";
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
  profilePhotoPath: string | null;
  hasActiveAssignment: boolean;
  alreadyAssignedToIncident: boolean;
};

type ActiveAssignmentRow = {
  officer_id: string | null;
};

type ExistingIncidentAssignmentRow = {
  officer_id: string | null;
};

type SupervisorName = {
  first_name: string | null;
  last_name: string | null;
};

export default function SsoAssignOfficerPage() {
  const router = useRouter();
  const { incidentId } = useLocalSearchParams<{ incidentId?: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [supervisorId, setSupervisorId] = useState<string | null>(null);
  const [supervisorName, setSupervisorName] = useState("-");
  const [candidates, setCandidates] = useState<CandidateOfficer[]>([]);
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

      const normalized = ((rows as ShiftOfficerRow[] | null) ?? [])
        .map((row) => {
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
            profilePhotoPath: employee.profile_photo_path,
            hasActiveAssignment: false,
            alreadyAssignedToIncident: false,
          } satisfies CandidateOfficer;
        })
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

      let assignedToIncidentIds = new Set<string>();
      const { data: existingAssignments } = await supabase
        .from("incident_assignments")
        .select("officer_id")
        .eq("incident_id", incidentId)
        .eq("active_status", true);

      assignedToIncidentIds = new Set(
        ((existingAssignments as ExistingIncidentAssignmentRow[] | null) ?? [])
          .map((item) => item.officer_id)
          .filter((item): item is string => Boolean(item))
      );

      const merged = uniqueCandidates.map((item) => ({
        ...item,
        hasActiveAssignment: busyOfficerIds.has(item.officerId),
        alreadyAssignedToIncident: assignedToIncidentIds.has(item.officerId),
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
        Alert.alert("Selection limit", "You can assign up to 3 officers at a time.");
        return next;
      }

      next.add(officer.officerId);
      return next;
    });
  };

  const onConfirm = async () => {
    if (saving || !incidentId || !supervisorId) return;

    if (selectedOfficerIds.size === 0) {
      Alert.alert("No officers selected", "Select at least one officer to assign.");
      return;
    }

    const selectedCandidates = rankedCandidates
      .map((entry) => entry.officer)
      .filter((officer) => selectedOfficerIds.has(officer.officerId));

    if (selectedCandidates.length === 0) {
      Alert.alert("No officers selected", "Select at least one officer to assign.");
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

    router.replace(`/sso/incident-after-assign?incidentId=${incidentId}`);
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => (router.canGoBack() ? router.back() : router.replace("/sso/home"))}>
          <ChevronLeft size={24} color="#FFFFFF" strokeWidth={2.6} />
        </Pressable>
        <Text style={styles.headerTitle}>Assign Officer</Text>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color="#0E2D52" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
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
                      <ProfileAvatar profilePhotoPath={officer.profilePhotoPath} fullName={fullName} />
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
                    <View style={styles.shiftCol}>
                      <Text style={styles.shiftDate}>{formatDate(officer.shiftDate)}</Text>
                      <Text style={styles.shiftTime}>{formatTimeRange(officer.shiftStart, officer.shiftEnd)}</Text>
                    </View>

                    <Text style={styles.arrowText}>{"<---->"}</Text>

                    <View style={[styles.shiftCol, styles.shiftColRight]}>
                      <Text style={styles.shiftDate}>{formatDate(officer.shiftDate)}</Text>
                      <Text style={styles.shiftTime}>{formatTimeRange(officer.shiftStart, officer.shiftEnd)}</Text>
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

          <Pressable
            style={[styles.confirmBtn, (selectedCount === 0 || saving) ? styles.confirmBtnDisabled : null]}
            disabled={selectedCount === 0 || saving}
            onPress={() => {
              void onConfirm();
            }}
          >
            <Text style={styles.confirmBtnText}>{saving ? "Assigning..." : "CONFIRM"}</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ProfileAvatar({ profilePhotoPath, fullName }: { profilePhotoPath: string | null; fullName: string }) {
  if (profilePhotoPath && /^https?:\/\//i.test(profilePhotoPath)) {
    return <Image source={{ uri: profilePhotoPath }} style={styles.avatar} />;
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
      {tone === "green" ? <CheckCircle2 size={12} color="#FFFFFF" /> : tone === "red" ? <CircleX size={12} color="#FFFFFF" /> : <Clock3 size={12} color="#FFFFFF" />}
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

function formatTimeRange(startISO: string, endISO: string) {
  const opts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  };
  return `${new Date(startISO).toLocaleTimeString([], opts)} - ${new Date(endISO).toLocaleTimeString([], opts)}`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#EDEDED",
  },
  header: {
    paddingHorizontal: 12,
    paddingTop: 40,
    paddingBottom: 12,
    backgroundColor: "#0E2D52",
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    marginLeft: 10,
    fontSize: 38,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 10,
  },
  emptyWrap: {
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    padding: 16,
  },
  emptyText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  card: {
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8D8D8",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
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
  },
  profileName: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "800",
  },
  profileRole: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "600",
  },
  badgesCol: {
    gap: 6,
    alignItems: "flex-end",
  },
  statusBadge: {
    minHeight: 24,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  badgeGreen: {
    backgroundColor: "#266B26",
  },
  badgeRed: {
    backgroundColor: "#A30B0B",
  },
  badgeGray: {
    backgroundColor: "#6B7280",
  },
  statusBadgeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  shiftRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shiftCol: {
    flex: 1,
  },
  shiftColRight: {
    alignItems: "flex-end",
  },
  shiftDate: {
    color: "#374151",
    fontSize: 14,
    fontWeight: "700",
  },
  shiftTime: {
    color: "#4B5563",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  arrowText: {
    marginHorizontal: 10,
    color: "#9CA3AF",
    fontWeight: "800",
    fontSize: 16,
  },
  assignBtn: {
    alignSelf: "center",
    minWidth: 176,
    height: 42,
    borderRadius: 24,
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
    backgroundColor: "#8A1FDF",
    borderWidth: 2,
    borderColor: "#C29BFF",
    shadowColor: "#9F5CFF",
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  assignBtnText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },
  assignBtnTextSelected: {
    color: "#FFFFFF",
  },
  assignBtnTextDisabled: {
    color: "#E5E7EB",
  },
  confirmBtn: {
    marginTop: 18,
    alignSelf: "center",
    width: "74%",
    height: 56,
    borderRadius: 30,
    backgroundColor: "#D83821",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#DC3A22",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    color: "#FFFFFF",
    fontSize: 40,
    fontWeight: "900",
    lineHeight: 44,
  },
});
