import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { createRealtimeTopic } from "../lib/realtime";

const SHIFT_CHANNEL_ID = "shift-reminders";
const PAYSLIP_CHANNEL_ID = "payslips";
const INBOX_CHANNEL_ID = "inbox-email";

const SHIFT_CLOCKIN_REMINDER_MINUTES = [10, 5, 1] as const;
const SHIFT_CLOCKOUT_REMINDER_MINUTES = [10, 5, 1] as const;
const SHIFT_CLOCKIN_POST_MINUTES = [1, 5, 10] as const;
const SHIFT_CLOCKOUT_POST_MINUTES = [1, 5, 10] as const;
const UPCOMING_SHIFT_LOOKAHEAD_DAYS = 7;

type ShiftRow = {
  shift_id: string;
  shift_start: string;
  shift_end: string;
  shift_date: string;
  location: string | null;
  completion_status: boolean | null;
  clockin_time?: string | null;
  clockout_time?: string | null;
};

type PayslipRow = {
  id: string;
  employee_id: string;
  pay_period_start: string;
  pay_period_end: string;
};

type InboxEmailRow = {
  id: string;
  user_id: string;
  subject: string | null;
  sender: string | null;
  created_at: string | null;
};

type ScheduledMap = Record<
  string,
  {
    id: string;
    at: number;
    title?: string;
    body?: string;
    kind?: "upcoming" | "today" | "past";
    priority?: number;
    time?: number;
  }
>;

const storageKey = (userId: string) => `scheduled_local_notifications:${userId}`;
const lastPayslipPeriodKey = (userId: string) => `last_payslip_period_notified:${userId}`;
const localInboxKey = (userId: string) => `local_inbox_notifications:${userId}`;

const minutesBefore = (iso: string, minutes: number) => new Date(new Date(iso).getTime() - minutes * 60 * 1000);
const minutesAfter = (iso: string, minutes: number) => new Date(new Date(iso).getTime() + minutes * 60 * 1000);

const makeDateTrigger = (date: Date, channelId?: string) =>
  Platform.OS === "android"
    ? ({ type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId } as const)
    : ({ type: Notifications.SchedulableTriggerInputTypes.DATE, date } as const);

const makeImmediateTrigger = (channelId?: string) =>
  Platform.OS === "android"
    ? ({ type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, repeats: false, channelId } as const)
    : ({ type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, repeats: false } as const);

const formatMonthLabel = (startDate: string) => {
  const date = new Date(startDate);
  if (Number.isNaN(date.getTime())) return startDate;
  return date.toLocaleString(undefined, { month: "long", year: "numeric" });
};

const payslipPeriodKey = (startDate: string) => {
  const date = new Date(startDate);
  if (Number.isNaN(date.getTime())) return startDate;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const ensureChannels = async () => {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(SHIFT_CHANNEL_ID, {
    name: "Shift reminders",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#1E64A6",
    sound: "default",
  });

  await Notifications.setNotificationChannelAsync(PAYSLIP_CHANNEL_ID, {
    name: "Payslips",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200, 100, 200],
    lightColor: "#1E64A6",
    sound: "default",
  });

  await Notifications.setNotificationChannelAsync(INBOX_CHANNEL_ID, {
    name: "Inbox",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 150, 75, 150],
    lightColor: "#0F2C59",
    sound: "default",
  });
};

const ensureNotificationPermission = async () => {
  if (Platform.OS === "web") return false;
  const existing = await Notifications.getPermissionsAsync();
  const finalStatus =
    existing.status === "granted" ? existing.status : (await Notifications.requestPermissionsAsync()).status;
  return finalStatus === "granted";
};

async function readScheduled(userId: string): Promise<ScheduledMap> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as ScheduledMap) : {};
  } catch {
    return {};
  }
}

async function writeScheduled(userId: string, map: ScheduledMap) {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(map));
}

async function cancelAllScheduled(userId: string) {
  const existing = await readScheduled(userId);
  await Promise.all(
    Object.values(existing).map(async (entry) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(entry.id);
      } catch {
        // ignore
      }
    })
  );
  await writeScheduled(userId, {});
}

type LocalInboxItem = {
  id: string;
  title: string;
  body: string;
  at: number;
  kind: "today" | "upcoming" | "past";
  priority: number;
  time: number;
};

async function upsertLocalInbox(userId: string, item: LocalInboxItem) {
  try {
    const raw = await AsyncStorage.getItem(localInboxKey(userId));
    const list = (raw ? (JSON.parse(raw) as LocalInboxItem[]) : []).filter(Boolean);
    const map = new Map<string, LocalInboxItem>(list.map((it) => [it.id, it]));
    map.set(item.id, item);
    const next = Array.from(map.values())
      .sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
      .slice(0, 50);
    await AsyncStorage.setItem(localInboxKey(userId), JSON.stringify(next));
  } catch (e) {
    console.warn("Failed persisting local inbox notification:", e);
  }
}

export default function SystemNotificationListener() {
  const [userId, setUserId] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const hasPermissionRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      await ensureChannels();
      const ok = await ensureNotificationPermission();
      hasPermissionRef.current = ok;
      if (mounted) setHasPermission(ok);
    })().catch((e) => console.error("Notification setup error:", e));

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId || !hasPermission || Platform.OS === "web") return;

    const scheduleShiftReminders = async () => {
      const start = new Date();
      const end = new Date(start.getTime() + UPCOMING_SHIFT_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

      const { data: shiftsRaw, error } = await supabase
        .from("shifts")
        .select("shift_id, shift_start, shift_end, shift_date, location, completion_status, clockin_time, clockout_time")
        .eq("officer_id", userId)
        .gte("shift_date", start.toISOString().slice(0, 10))
        .lte("shift_date", end.toISOString().slice(0, 10))
        .order("shift_date", { ascending: true })
        .order("shift_start", { ascending: true });

      if (error) {
        console.warn("Shift reminder load error:", error.message);
        return;
      }

      const shifts = ((shiftsRaw as ShiftRow[] | null) ?? []).filter(Boolean);
      const nowMs = Date.now();

      const nextMap: ScheduledMap = {};

      for (const shift of shifts) {
        const loc = shift.location?.trim() ? ` at ${shift.location.trim()}` : "";

        for (const minutes of SHIFT_CLOCKIN_REMINDER_MINUTES) {
          const clockInAt = minutesBefore(shift.shift_start, minutes);
          if (!shift.clockin_time && clockInAt.getTime() > nowMs) {
            const title = "Shift Reminder";
            const body = `Shift starting in ${minutes} min${loc}. Remember to clock in on time!`;
            const identifier = await Notifications.scheduleNotificationAsync({
              content: {
                title,
                body,
                data: { kind: "shift_clockin", shiftId: shift.shift_id, minutesBefore: minutes },
                interruptionLevel: "timeSensitive",
                sound: "default",
              },
              trigger: makeDateTrigger(clockInAt, SHIFT_CHANNEL_ID),
            });
            nextMap[`shift:${shift.shift_id}:clockin:${minutes}`] = { id: identifier, at: clockInAt.getTime() };
            nextMap[`shift:${shift.shift_id}:clockin:${minutes}`].title = title;
            nextMap[`shift:${shift.shift_id}:clockin:${minutes}`].body = body;
            nextMap[`shift:${shift.shift_id}:clockin:${minutes}`].kind = "upcoming";
            nextMap[`shift:${shift.shift_id}:clockin:${minutes}`].priority = 0;
            nextMap[`shift:${shift.shift_id}:clockin:${minutes}`].time = clockInAt.getTime();
          }
        }

        for (const minutes of SHIFT_CLOCKIN_POST_MINUTES) {
          const clockInAt = minutesAfter(shift.shift_start, minutes);
          if (!shift.clockin_time && clockInAt.getTime() > nowMs) {
            const title = "Clock In Reminder";
            const body = `You are ${minutes} min past shift start${loc}. Please clock in now.`;
            const identifier = await Notifications.scheduleNotificationAsync({
              content: {
                title,
                body,
                data: { kind: "shift_clockin_late", shiftId: shift.shift_id, minutesAfter: minutes },
                interruptionLevel: "timeSensitive",
                sound: "default",
              },
              trigger: makeDateTrigger(clockInAt, SHIFT_CHANNEL_ID),
            });
            const k = `shift:${shift.shift_id}:clockin_post:${minutes}`;
            nextMap[k] = { id: identifier, at: clockInAt.getTime(), title, body, kind: "today", priority: 0, time: clockInAt.getTime() };
          }
        }

        for (const minutes of SHIFT_CLOCKOUT_REMINDER_MINUTES) {
          const clockOutAt = minutesBefore(shift.shift_end, minutes);
          if (!shift.clockout_time && clockOutAt.getTime() > nowMs) {
            const needsReport = !shift.completion_status;
            const title = "Shift Reminder";
            const body = needsReport
              ? `Shift ending in ${minutes} min${loc}. Please remember to clock out and submit your end-of-shift report before ending your shift.`
              : `Shift ending in ${minutes} min${loc}. Please remember to clock out.`;
            const identifier = await Notifications.scheduleNotificationAsync({
              content: {
                title,
                body,
                data: {
                  kind: needsReport ? "shift_clockout_report" : "shift_clockout",
                  shiftId: shift.shift_id,
                  minutesBefore: minutes,
                },
                interruptionLevel: "timeSensitive",
                sound: "default",
              },
              trigger: makeDateTrigger(clockOutAt, SHIFT_CHANNEL_ID),
            });
            nextMap[`shift:${shift.shift_id}:clockout:${minutes}`] = { id: identifier, at: clockOutAt.getTime() };
            nextMap[`shift:${shift.shift_id}:clockout:${minutes}`].title = title;
            nextMap[`shift:${shift.shift_id}:clockout:${minutes}`].body = body;
            nextMap[`shift:${shift.shift_id}:clockout:${minutes}`].kind = "upcoming";
            nextMap[`shift:${shift.shift_id}:clockout:${minutes}`].priority = 0;
            nextMap[`shift:${shift.shift_id}:clockout:${minutes}`].time = clockOutAt.getTime();
          }
        }

        for (const minutes of SHIFT_CLOCKOUT_POST_MINUTES) {
          const clockOutAt = minutesAfter(shift.shift_end, minutes);
          if (!shift.clockout_time && clockOutAt.getTime() > nowMs) {
            const needsReport = !shift.completion_status;
            const title = "Clock Out Reminder";
            const body = needsReport
              ? `You are ${minutes} min past shift end${loc}. Please submit your end-of-shift report and clock out now.`
              : `You are ${minutes} min past shift end${loc}. Please clock out now.`;
            const identifier = await Notifications.scheduleNotificationAsync({
              content: {
                title,
                body,
                data: { kind: needsReport ? "shift_clockout_report_late" : "shift_clockout_late", shiftId: shift.shift_id, minutesAfter: minutes },
                interruptionLevel: "timeSensitive",
                sound: "default",
              },
              trigger: makeDateTrigger(clockOutAt, SHIFT_CHANNEL_ID),
            });
            const k = `shift:${shift.shift_id}:clockout_post:${minutes}`;
            nextMap[k] = { id: identifier, at: clockOutAt.getTime(), title, body, kind: "today", priority: 0, time: clockOutAt.getTime() };
          }
        }
      }

      await cancelAllScheduled(userId);
      await writeScheduled(userId, nextMap);
    };

    scheduleShiftReminders().catch((e) => console.error("Error scheduling shift reminders:", e));

    const channel = supabase
      .channel(createRealtimeTopic(`shift-notifications:${userId}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shifts",
          filter: `officer_id=eq.${userId}`,
        },
        async () => {
          if (!hasPermissionRef.current) return;
          await scheduleShiftReminders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hasPermission, userId]);

  useEffect(() => {
    if (!userId || !hasPermission || Platform.OS === "web") return;

    const notifyLatestPayslipIfNeeded = async () => {
      const { data, error } = await supabase
        .from("payslips")
        .select("id, employee_id, pay_period_start, pay_period_end")
        .eq("employee_id", userId)
        .order("pay_period_start", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data?.id) return;

      const period = payslipPeriodKey(data.pay_period_start);
      const lastNotifiedPeriod = await AsyncStorage.getItem(lastPayslipPeriodKey(userId));
      if (lastNotifiedPeriod === period) return;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Payslip available",
          body: `Your payslip for ${formatMonthLabel(data.pay_period_start)} is ready.`,
          data: { kind: "payslip", payslipId: data.id },
          sound: "default",
        },
        trigger: makeImmediateTrigger(PAYSLIP_CHANNEL_ID),
      });

      await AsyncStorage.setItem(lastPayslipPeriodKey(userId), period);
      await upsertLocalInbox(userId, {
        id: `payslip:${period}:${data.id}`,
        title: "Payslip available",
        body: `Your payslip for ${formatMonthLabel(data.pay_period_start)} is ready.`,
        at: Date.now(),
        kind: "today",
        priority: 2,
        time: Date.now(),
      });
    };

    notifyLatestPayslipIfNeeded().catch((e) => console.error("Payslip notify check error:", e));

    const channel = supabase
      .channel(createRealtimeTopic(`payslip-notifications:${userId}`))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "payslips",
          filter: `employee_id=eq.${userId}`,
        },
        async (payload) => {
          if (!hasPermissionRef.current) return;
          const slip = payload.new as PayslipRow;
          const period = payslipPeriodKey(slip.pay_period_start);
          const lastNotifiedPeriod = await AsyncStorage.getItem(lastPayslipPeriodKey(userId));
          if (lastNotifiedPeriod === period) return;
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Payslip available",
              body: `Your payslip for ${formatMonthLabel(slip.pay_period_start)} is ready.`,
              data: { kind: "payslip", payslipId: slip.id },
              sound: "default",
            },
            trigger: makeImmediateTrigger(PAYSLIP_CHANNEL_ID),
          });
          await AsyncStorage.setItem(lastPayslipPeriodKey(userId), period);
          await upsertLocalInbox(userId, {
            id: `payslip:${period}:${slip.id}`,
            title: "Payslip available",
            body: `Your payslip for ${formatMonthLabel(slip.pay_period_start)} is ready.`,
            at: Date.now(),
            kind: "today",
            priority: 2,
            time: Date.now(),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hasPermission, userId]);

  useEffect(() => {
    if (!userId || !hasPermission || Platform.OS === "web") return;

    // Optional: inbox/email notifications (only if you create the table).
    const channel = supabase
      .channel(createRealtimeTopic(`inbox-notifications:${userId}`))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "inbox_emails",
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          if (!hasPermissionRef.current) return;
          const email = payload.new as InboxEmailRow;
          const sender = email.sender?.trim() || "Inbox";
          const subject = email.subject?.trim() || "New message";
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `New email from ${sender}`,
              body: subject,
              data: { kind: "inbox_email", emailId: email.id },
              sound: "default",
            },
            trigger: makeImmediateTrigger(INBOX_CHANNEL_ID),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hasPermission, userId]);

  return null;
}
