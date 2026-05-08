import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { createRealtimeTopic } from "../lib/realtime";

const SHIFT_CHANNEL_ID = "shift-reminders";
const PAYSLIP_CHANNEL_ID = "payslips";
const INBOX_CHANNEL_ID = "inbox-email";

const SHIFT_CLOCKIN_MINUTES_BEFORE = 10;
const SHIFT_CLOCKOUT_MINUTES_BEFORE = 10;
const SHIFT_REPORT_MINUTES_BEFORE = 5;
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
  }
>;

const storageKey = (userId: string) => `scheduled_local_notifications:${userId}`;
const lastPayslipKey = (userId: string) => `last_payslip_notified:${userId}`;

const minutesBefore = (iso: string, minutes: number) => new Date(new Date(iso).getTime() - minutes * 60 * 1000);

const formatMonthLabel = (startDate: string) => {
  const date = new Date(startDate);
  if (Number.isNaN(date.getTime())) return startDate;
  return date.toLocaleString(undefined, { month: "long", year: "numeric" });
};

const ensureChannels = async () => {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(SHIFT_CHANNEL_ID, {
    name: "Shift reminders",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#1E64A6",
  });

  await Notifications.setNotificationChannelAsync(PAYSLIP_CHANNEL_ID, {
    name: "Payslips",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200, 100, 200],
    lightColor: "#1E64A6",
  });

  await Notifications.setNotificationChannelAsync(INBOX_CHANNEL_ID, {
    name: "Inbox",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 150, 75, 150],
    lightColor: "#0F2C59",
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

        const clockInAt = minutesBefore(shift.shift_start, SHIFT_CLOCKIN_MINUTES_BEFORE);
        if (!shift.clockin_time && clockInAt.getTime() > nowMs) {
          const identifier = await Notifications.scheduleNotificationAsync({
            content: {
              title: "Shift Reminder",
              body: `Clock in in ${SHIFT_CLOCKIN_MINUTES_BEFORE} min${loc}.`,
              data: { kind: "shift_clockin", shiftId: shift.shift_id },
              interruptionLevel: "timeSensitive",
            },
            trigger:
              Platform.OS === "android"
                ? { channelId: SHIFT_CHANNEL_ID, date: clockInAt }
                : { date: clockInAt },
          });
          nextMap[`shift:${shift.shift_id}:clockin`] = { id: identifier, at: clockInAt.getTime() };
        }

        const clockOutAt = minutesBefore(shift.shift_end, SHIFT_CLOCKOUT_MINUTES_BEFORE);
        if (!shift.clockout_time && clockOutAt.getTime() > nowMs) {
          const identifier = await Notifications.scheduleNotificationAsync({
            content: {
              title: "Shift Reminder",
              body: `Clock out in ${SHIFT_CLOCKOUT_MINUTES_BEFORE} min${loc}.`,
              data: { kind: "shift_clockout", shiftId: shift.shift_id },
              interruptionLevel: "timeSensitive",
            },
            trigger:
              Platform.OS === "android"
                ? { channelId: SHIFT_CHANNEL_ID, date: clockOutAt }
                : { date: clockOutAt },
          });
          nextMap[`shift:${shift.shift_id}:clockout`] = { id: identifier, at: clockOutAt.getTime() };
        }

        const reportAt = minutesBefore(shift.shift_end, SHIFT_REPORT_MINUTES_BEFORE);
        if (!shift.completion_status && reportAt.getTime() > nowMs) {
          const identifier = await Notifications.scheduleNotificationAsync({
            content: {
              title: "End-of-Shift Report",
              body: `Submit your report before ending your shift${loc}.`,
              data: { kind: "shift_report", shiftId: shift.shift_id },
              interruptionLevel: "timeSensitive",
            },
            trigger:
              Platform.OS === "android"
                ? { channelId: SHIFT_CHANNEL_ID, date: reportAt }
                : { date: reportAt },
          });
          nextMap[`shift:${shift.shift_id}:report`] = { id: identifier, at: reportAt.getTime() };
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

      const lastNotified = await AsyncStorage.getItem(lastPayslipKey(userId));
      if (lastNotified === data.id) return;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Payslip available",
          body: `Your payslip for ${formatMonthLabel(data.pay_period_start)} is ready.`,
          data: { kind: "payslip", payslipId: data.id },
        },
        trigger: Platform.OS === "android" ? { channelId: PAYSLIP_CHANNEL_ID, seconds: 1 } : null,
      });

      await AsyncStorage.setItem(lastPayslipKey(userId), data.id);
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
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Payslip available",
              body: `Your payslip for ${formatMonthLabel(slip.pay_period_start)} is ready.`,
              data: { kind: "payslip", payslipId: slip.id },
            },
            trigger: Platform.OS === "android" ? { channelId: PAYSLIP_CHANNEL_ID, seconds: 1 } : null,
          });
          await AsyncStorage.setItem(lastPayslipKey(userId), slip.id);
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
            },
            trigger: Platform.OS === "android" ? { channelId: INBOX_CHANNEL_ID, seconds: 1 } : null,
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
