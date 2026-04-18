import { useEffect, useRef, useState } from "react";
import { Platform, Vibration } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router, useGlobalSearchParams, usePathname } from "expo-router";
import { supabase } from "../lib/supabase";
import { getDisplayName, type ChatMessageRecord, type EmployeeProfile } from "../lib/messageData";
import { createRealtimeTopic } from "../lib/realtime";

const IMPORTANT_PREFIX = "[IMPORTANT] ";
const ATTACHMENT_PREFIX = "[ATTACHMENT] ";
const CHAT_NOTIFICATION_CHANNEL_ID = "chat-messages";
const URGENT_CHAT_NOTIFICATION_CHANNEL_ID = "urgent-chat-messages";
const URGENT_NOTIFICATION_SOUND = "urgent_bells.mp3";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const getNotificationBody = (text: string) => {
  const withoutImportance = text.startsWith(IMPORTANT_PREFIX) ? text.slice(IMPORTANT_PREFIX.length) : text;

  if (!withoutImportance.startsWith(ATTACHMENT_PREFIX)) {
    return withoutImportance;
  }

  try {
    const attachment = JSON.parse(withoutImportance.slice(ATTACHMENT_PREFIX.length)) as {
      type?: string;
      caption?: string;
    };
    const mediaLabel = attachment.type === "video" ? "sent a video" : "sent a photo";

    return attachment.caption ? `${mediaLabel}: ${attachment.caption}` : mediaLabel;
  } catch {
    return "sent an attachment";
  }
};

const isImportantMessage = (text: string) => text.startsWith(IMPORTANT_PREFIX);

const ensureNotificationPermissions = async () => {
  if (Platform.OS === "web") return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHAT_NOTIFICATION_CHANNEL_ID, {
      name: "Chat messages",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0F2C59",
    });

    await Notifications.setNotificationChannelAsync(URGENT_CHAT_NOTIFICATION_CHANNEL_ID, {
      name: "Urgent chat messages",
      importance: Notifications.AndroidImportance.MAX,
      sound: URGENT_NOTIFICATION_SOUND,
      vibrationPattern: [0, 300, 120, 300, 120, 600],
      lightColor: "#FF3B58",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const finalStatus =
    existing.status === "granted" ? existing.status : (await Notifications.requestPermissionsAsync()).status;

  return finalStatus === "granted";
};

const getEasProjectId = () =>
  Constants.easConfig?.projectId ?? (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;

export default function ChatNotificationListener() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ channelId?: string }>();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [hasNotificationPermission, setHasNotificationPermission] = useState(false);
  const hasPermissionRef = useRef(false);
  const senderNameCacheRef = useRef(new Map<string, string>());

  useEffect(() => {
    let mounted = true;

    ensureNotificationPermissions()
      .then((hasPermission) => {
        hasPermissionRef.current = hasPermission;
        if (mounted) setHasNotificationPermission(hasPermission);
      })
      .catch((error) => {
        console.error("Error setting up chat notifications:", error);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user.id ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user.id ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (
      !currentUserId ||
      !hasNotificationPermission ||
      Platform.OS === "web" ||
      Constants.appOwnership === "expo"
    ) {
      return;
    }

    const registerPushToken = async () => {
      if (!Device.isDevice) return;

      const projectId = getEasProjectId();
      if (!projectId) {
        console.warn("Expo push token not registered: missing EAS projectId. Run `eas init` and rebuild the app.");
        return;
      }

      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      const { error } = await supabase.from("push_tokens").upsert(
        {
          user_id: currentUserId,
          token,
          platform: Platform.OS,
          device_name: Device.deviceName,
          enabled: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,token" }
      );

      if (error) {
        console.error("Error saving push token:", error);
      }
    };

    registerPushToken().catch((error) => {
      console.error("Error registering push token:", error);
    });
  }, [currentUserId, hasNotificationPermission]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const channelId = response.notification.request.content.data?.channelId;

      if (typeof channelId !== "string" || !channelId) return;

      router.push({
        pathname: "/securityofficer/message",
        params: { channelId },
      });
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!currentUserId || Platform.OS === "web" || Constants.appOwnership !== "expo") return;

    const fetchSenderName = async (senderId: string) => {
      const cachedName = senderNameCacheRef.current.get(senderId);
      if (cachedName) return cachedName;

      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, role")
        .eq("id", senderId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching notification sender:", error);
      }

      const displayName = getDisplayName((data as EmployeeProfile | null) ?? null);
      senderNameCacheRef.current.set(senderId, displayName);
      return displayName;
    };

    const channel = supabase
      .channel(createRealtimeTopic(`chat-notifications:${currentUserId}`))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        async (payload) => {
          if (!hasPermissionRef.current) return;

          const message = payload.new as ChatMessageRecord;
          const isViewingThisChat = pathname === "/securityofficer/message" && params.channelId === message.sender_id;
          if (isViewingThisChat) return;

          const senderName = await fetchSenderName(message.sender_id);
          const important = isImportantMessage(message.text);

          if (important) {
            Vibration.vibrate([0, 300, 120, 300, 120, 600]);
          }

          await Notifications.scheduleNotificationAsync({
            content: {
              title: important ? `Urgent: ${senderName}` : senderName,
              body: important ? `Important: ${getNotificationBody(message.text)}` : getNotificationBody(message.text),
              data: { channelId: message.sender_id, important },
              sound: important ? URGENT_NOTIFICATION_SOUND : "default",
              priority: important
                ? Notifications.AndroidNotificationPriority.MAX
                : Notifications.AndroidNotificationPriority.HIGH,
              vibrate: important ? [0, 300, 120, 300, 120, 600] : [0, 250, 250, 250],
              interruptionLevel: important ? "timeSensitive" : "active",
            },
            trigger:
              Platform.OS === "android"
                ? { channelId: important ? URGENT_CHAT_NOTIFICATION_CHANNEL_ID : CHAT_NOTIFICATION_CHANNEL_ID }
                : null,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, params.channelId, pathname]);

  return null;
}
