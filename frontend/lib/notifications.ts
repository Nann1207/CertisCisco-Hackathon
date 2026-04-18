export const DISPLAY_TIME_ZONE = "Asia/Singapore";

export type NotificationKind = "past" | "upcoming" | "today" | "incident";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  kind: NotificationKind;
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

type NotificationOptions = {
  includePast: boolean;
};

const UPCOMING_RANGE_DAYS = 7;
const UPCOMING_SOON_HOURS = 24;
const UPCOMING_IMMINENT_MINUTES = 60;

export function generateShiftNotifications(
  shifts: NotificationShift[],
  now: Date,
  options: NotificationOptions
): NotificationItem[] {
  const { includePast } = options;
  const nowMs = now.getTime();
  const todayKey = now.toLocaleDateString("en-CA", { timeZone: DISPLAY_TIME_ZONE });
  const items: NotificationItem[] = [];

  for (const shift of shifts) {
    const start = new Date(shift.shift_start);
    const end = new Date(shift.shift_end);
    const startMs = start.getTime();
    const endMs = end.getTime();

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      continue;
    }

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
    const shiftDateKey = new Date(shift.shift_date).toLocaleDateString("en-CA", {
      timeZone: DISPLAY_TIME_ZONE,
    });

    // Upcoming notifications appear progressively as the shift gets closer.
    if (startMs > nowMs && diffDays <= UPCOMING_RANGE_DAYS && !shift.completion_status) {
      if (diffMinutes <= UPCOMING_IMMINENT_MINUTES) {
        items.push({
          id: `upcoming-imminent-${shift.id}`,
          title: "Shift Starting Soon",
          body: `${timeText}${locationText}`,
          timestamp: `Starts in ${Math.max(1, Math.floor(diffMinutes))} min`,
          kind: "upcoming",
        });
      } else if (diffHours <= UPCOMING_SOON_HOURS) {
        items.push({
          id: `upcoming-soon-${shift.id}`,
          title: "Upcoming Shift",
          body: `${dateText}, ${timeText}${locationText}`,
          timestamp: `In ${Math.max(1, Math.floor(diffHours))} hr`,
          kind: "upcoming",
        });
      } else {
        items.push({
          id: `upcoming-${shift.id}`,
          title: "Upcoming Shift",
          body: `${dateText}, ${timeText}${locationText}`,
          timestamp: `${dateText}, ${timeText}`,
          kind: "upcoming",
        });
      }
      continue;
    }

    // During shift window, today and incident summary are visible.
    if (startMs <= nowMs && endMs >= nowMs && shiftDateKey === todayKey) {
      items.push({
        id: `today-${shift.id}`,
        title: "On Shift Now",
        body: `${timeText}${locationText}`,
        timestamp: `Today, ${timeText}`,
        kind: "today",
      });
      items.push({
        id: `incident-${shift.id}`,
        title: "Incident Update",
        body: "No incidents for this active shift.",
        timestamp: `Today, ${timeText}`,
        kind: "incident",
      });
      continue;
    }

    // For today's completed windows, keep a current-day summary signal.
    if (shiftDateKey === todayKey && endMs < nowMs) {
      items.push({
        id: `today-complete-${shift.id}`,
        title: "Today Shift Complete",
        body: `${timeText}${locationText}`,
        timestamp: `Today, ${timeText}`,
        kind: "today",
      });
      continue;
    }

    if (!includePast) {
      continue;
    }

    if (endMs < nowMs) {
      const pastTitle = shift.clockout_time || shift.completion_status ? "Past Shift" : "Past Shift (Action Needed)";
      const pastBody =
        shift.clockout_time || shift.completion_status
          ? `${dateText}, ${timeText}${locationText}`
          : `${dateText}, ${timeText}${locationText} - Missing clock out.`;

      items.push({
        id: `past-${shift.id}`,
        title: pastTitle,
        body: pastBody,
        timestamp: `${dateText}, ${timeText}`,
        kind: "past",
      });
    }
  }

  return items.sort(compareNotificationPriority);
}

export function formatTimeRange(startISO: string, endISO: string) {
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
  const priorityOrder: Record<NotificationKind, number> = {
    upcoming: 0,
    today: 1,
    incident: 2,
    past: 3,
  };

  if (priorityOrder[a.kind] !== priorityOrder[b.kind]) {
    return priorityOrder[a.kind] - priorityOrder[b.kind];
  }

  return a.timestamp.localeCompare(b.timestamp) * -1;
}
