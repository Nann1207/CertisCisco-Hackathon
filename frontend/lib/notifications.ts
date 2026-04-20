export const DISPLAY_TIME_ZONE = "Asia/Singapore";

export type NotificationKind = "past" | "upcoming" | "today" | "incident" | "assignment" | "report";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  kind: NotificationKind;
  // numeric priority (lower = higher priority)
  priority?: number;
  // numeric time key in ms used for tie-breaking
  time?: number;
  // optional: ISO timestamp when the user dismissed/closed this notification
  dismissedAt?: string | null;
};

export type NotificationShift = {
  id: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  completion_status: boolean | null;
  location: string | null;
  clockin_time?: string | null;
  clockout_time?: string | null;
};

export type NotificationIncident = {
  incident_id: string;
  incident_category?: string | null;
  location_name?: string | null;
  location_unit_no?: string | null;
  location_description?: string | null;
  created_at?: string | null;
  active_status?: boolean | null;
};

export type NotificationReport = {
  id?: string | null;
  incident_id?: string | null;
  report_type?: string | null;
  created_at?: string | null;
};

export type NotificationAssignment = {
  assignment_id: string;
  incident_id?: string | null;
  assigned_at?: string | null;
  active_status?: boolean | null;
  incidents?: { incident_name?: string | null; location_unit_no?: string | null } | null;
};

type NotificationOptions = {
  includePast: boolean;
};

const UPCOMING_RANGE_DAYS = 7;
const UPCOMING_SOON_HOURS = 24;
const UPCOMING_IMMINENT_MINUTES = 60;
const MAX_UPCOMING_AT_ONCE = 4; // limit how many future/upcoming notifications we show at once

function makeLocationText(inc: {
  location_name?: string | null;
  location_unit_no?: string | null;
  location_description?: string | null;
}) {
  const parts = [inc.location_name?.trim() ?? "", inc.location_unit_no?.trim() ? `#${inc.location_unit_no?.trim()}` : "", inc.location_description?.trim() ?? ""].filter(Boolean);
  return parts.length > 0 ? ` at ${parts.join(" ")}` : "";
}

export function generateNotifications(
  shifts: NotificationShift[] | null | undefined,
  incidents: NotificationIncident[] | null | undefined,
  reports: NotificationReport[] | null | undefined,
  assignments: NotificationAssignment[] | null | undefined,
  now: Date,
  options: NotificationOptions
): NotificationItem[] {
  const { includePast } = options;
  const nowMs = now.getTime();
  const todayKey = now.toLocaleDateString("en-CA", { timeZone: DISPLAY_TIME_ZONE });
  const items: NotificationItem[] = [];

  // Shifts -> upcoming/today/past
  for (const shift of (shifts ?? [])) {
    const start = new Date(shift.shift_start);
    const end = new Date(shift.shift_end);
    const startMs = start.getTime();
    const endMs = end.getTime();

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;

    const diffMs = startMs - nowMs;
    const diffMinutes = diffMs / (60 * 1000);
    const diffHours = diffMs / (60 * 60 * 1000);
    const diffDays = diffMs / (24 * 60 * 60 * 1000);

    const dateText = new Date(shift.shift_date).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: DISPLAY_TIME_ZONE,
    });
    const timeText = formatTimeRange(shift.shift_start, shift.shift_end);
    const locationText = shift.location?.trim() ? ` at ${shift.location.trim()}` : "";
    const shiftDateKey = new Date(shift.shift_date).toLocaleDateString("en-CA", { timeZone: DISPLAY_TIME_ZONE });

    if (startMs > nowMs && diffDays <= UPCOMING_RANGE_DAYS && !shift.completion_status) {
      const base = {
        id: `upcoming-${shift.id}`,
        title: "Upcoming Shift",
        body: `${dateText}, ${timeText}${locationText}`,
        kind: "upcoming" as const,
        priority: 1,
        time: startMs,
      };

      if (diffMinutes <= UPCOMING_IMMINENT_MINUTES) {
        items.push({ ...base, id: `upcoming-imminent-${shift.id}`, title: "Shift Starting Soon", timestamp: `Starts in ${Math.max(1, Math.floor(diffMinutes))} min` });
      } else if (diffHours <= UPCOMING_SOON_HOURS) {
        items.push({ ...base, id: `upcoming-soon-${shift.id}`, timestamp: `In ${Math.max(1, Math.floor(diffHours))} hr` });
      } else {
        items.push({ ...base, timestamp: `${dateText}, ${timeText}` });
      }
      continue;
    }

    if (startMs <= nowMs && endMs >= nowMs && shiftDateKey === todayKey) {
      items.push({ id: `today-${shift.id}`, title: "On Shift Now", body: `${timeText}${locationText}`, timestamp: `Today, ${timeText}`, kind: "today", priority: 2, time: startMs });
      items.push({ id: `incident-${shift.id}`, title: "Incident Update", body: "No incidents for this active shift.", timestamp: `Today, ${timeText}`, kind: "incident", priority: 0, time: startMs });
      continue;
    }

    if (shiftDateKey === todayKey && endMs < nowMs) {
      items.push({ id: `today-complete-${shift.id}`, title: "Today Shift Complete", body: `${timeText}${locationText}`, timestamp: `Today, ${timeText}`, kind: "today", priority: 2, time: endMs });
      continue;
    }

    if (!includePast) continue;

    if (endMs < nowMs) {
      const pastTitle = shift.clockout_time || shift.completion_status ? "Past Shift" : "Past Shift (Action Needed)";
      const pastBody = shift.clockout_time || shift.completion_status ? `${dateText}, ${timeText}${locationText}` : `${dateText}, ${timeText}${locationText} - Missing clock out.`;
      items.push({ id: `past-${shift.id}`, title: pastTitle, body: pastBody, timestamp: `${dateText}, ${timeText}`, kind: "past", priority: 5, time: endMs });
    }
  }

  // Incidents -> active/resolved
  for (const inc of (incidents ?? [])) {
    const createdMs = inc.created_at ? new Date(inc.created_at).getTime() : nowMs;
    const locationText = makeLocationText(inc as any);
    const title = (inc.incident_category ?? "Incident").toString();
    const body = `${title}${locationText}`;
    if (inc.active_status) {
      items.push({ id: `incident-active-${inc.incident_id}`, title: `Active Incident: ${title}`, body, timestamp: inc.created_at ?? "Now", kind: "incident", priority: 0, time: createdMs });
    } else {
      items.push({ id: `incident-past-${inc.incident_id}`, title: `Past Incident: ${title}`, body, timestamp: inc.created_at ?? "", kind: "past", priority: 5, time: createdMs });
    }
  }

  // Reports -> pending or new reports
  for (const rep of (reports ?? [])) {
    const createdMs = rep.created_at ? new Date(rep.created_at).getTime() : nowMs;
    const isResolved = ((rep.report_type ?? "").toLowerCase() === "resolved");
    if (isResolved) {
      items.push({ id: `report-${rep.id}`, title: `Report: ${rep.report_type}`, body: `Report created`, timestamp: rep.created_at ?? "", kind: "past", priority: 5, time: createdMs });
    } else {
      items.push({ id: `report-${rep.id}`, title: `Report: ${rep.report_type ?? "Pending"}`, body: `Report needs attention`, timestamp: rep.created_at ?? "", kind: "report", priority: 4, time: createdMs });
    }
  }

  // Assignments -> new assignment alerts
  for (const a of (assignments ?? [])) {
    const assignedMs = a.assigned_at ? new Date(a.assigned_at).getTime() : nowMs;
    const incidentName = Array.isArray(a.incidents) ? (a.incidents[0]?.incident_name ?? "New Incident") : a.incidents?.incident_name ?? "New Incident";
    const locationUnit = Array.isArray(a.incidents) ? (a.incidents[0]?.location_unit_no ?? "") : a.incidents?.location_unit_no ?? "";
    const locationText = locationUnit ? ` #${locationUnit}` : "";
    items.push({ id: `assignment-${a.assignment_id}`, title: `Assigned: ${incidentName}`, body: `Assigned to you${locationText}`, timestamp: a.assigned_at ?? "", kind: "assignment", priority: 3, time: assignedMs });
  }

  // Remove duplicate items by id, preserving first occurrence
  const uniqueMap = new Map<string, NotificationItem>();
  for (const it of items) {
    if (!uniqueMap.has(it.id)) uniqueMap.set(it.id, it);
  }
  let uniqueItems = Array.from(uniqueMap.values());

  // Limit how many upcoming/future notifications are shown at once to avoid overwhelming users.
  const upcomingItems = uniqueItems.filter((it) => it.kind === "upcoming");
  if (upcomingItems.length > MAX_UPCOMING_AT_ONCE) {
    // keep the soonest upcoming ones
    const allowed = new Set(upcomingItems.sort((a, b) => (a.time ?? 0) - (b.time ?? 0)).slice(0, MAX_UPCOMING_AT_ONCE).map((i) => i.id));
    uniqueItems = uniqueItems.filter((it) => it.kind !== "upcoming" || allowed.has(it.id));
  }

  return uniqueItems.sort(compareNotificationPriority);
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

function compareNotificationPriority(a: NotificationItem, b: NotificationItem) {
  const pa = a.priority ?? 99;
  const pb = b.priority ?? 99;
  if (pa !== pb) return pa - pb;

  const ta = a.time ?? 0;
  const tb = b.time ?? 0;
  // For equal priority, prefer more recent for incidents/reports/past, earlier for upcoming/today
  if (a.kind === "upcoming" || a.kind === "today") {
    return ta - tb;
  }
  return tb - ta;
}

// Backwards-compatible wrapper: keep original name
export function generateShiftNotifications(shifts: NotificationShift[], now: Date, options: NotificationOptions) {
  return generateNotifications(shifts, null, null, null, now, options);
}
