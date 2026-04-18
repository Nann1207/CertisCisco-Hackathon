import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Bell, ChevronLeft } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { createRealtimeTopic } from "../../lib/realtime";
import {
  formatMessageTime,
  getAvatarColor,
  getAvatarTextColor,
  getDisplayName,
  getInitials,
  type ChatMessageRecord,
  type EmployeeProfile,
} from "../../lib/messageData";
import { attachProfilePhotoUrls } from "../../lib/profilePhotos";

const IMPORTANT_PREFIX = "[IMPORTANT] ";
const ATTACHMENT_PREFIX = "[ATTACHMENT] ";

type NotificationItem = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  text: string;
  time: string;
  createdAt: string;
  isImportant: boolean;
  avatarColor: string;
  avatarTextColor: string;
  avatarUrl?: string | null;
};

const getMessagePreview = (text: string) => {
  const withoutImportance = text.startsWith(IMPORTANT_PREFIX) ? text.slice(IMPORTANT_PREFIX.length) : text;

  if (!withoutImportance.startsWith(ATTACHMENT_PREFIX)) {
    return withoutImportance;
  }

  try {
    const attachment = JSON.parse(withoutImportance.slice(ATTACHMENT_PREFIX.length)) as {
      type?: string;
      caption?: string;
    };
    const mediaLabel = attachment.type === "video" ? "Video" : "Photo";
    return attachment.caption ? `${mediaLabel}: ${attachment.caption}` : `${mediaLabel} attachment`;
  } catch {
    return "Attachment";
  }
};

export default function NotificationsScreen() {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const buildNotifications = useCallback((rows: ChatMessageRecord[], userProfiles: EmployeeProfile[]) => {
    const profileById = new Map(userProfiles.map((profile) => [profile.id, profile]));

    return rows.map((message) => {
      const profile = profileById.get(message.sender_id);
      const avatarColor = getAvatarColor(message.sender_id);

      return {
        id: message.id,
        senderId: message.sender_id,
        senderName: getDisplayName(profile),
        senderRole: profile?.role ?? "Chat message",
        text: getMessagePreview(message.text),
        time: formatMessageTime(message.created_at),
        createdAt: message.created_at,
        isImportant: message.text.startsWith(IMPORTANT_PREFIX),
        avatarColor,
        avatarTextColor: getAvatarTextColor(avatarColor),
        avatarUrl: profile?.avatarUrl ?? null,
      };
    });
  }, []);

  const loadNotifications = useCallback(async () => {
    setLoading(true);

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    if (sessionError || !userId) {
      console.error("Error loading notification session:", sessionError);
      setCurrentUserId(null);
      setMessages([]);
      setProfiles([]);
      setLoading(false);
      return;
    }

    setCurrentUserId(userId);

    const { data: messageData, error: messageError } = await supabase
      .from("messages")
      .select("id, sender_id, receiver_id, text, created_at")
      .eq("receiver_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (messageError) {
      console.error("Error fetching notifications:", messageError);
      setMessages([]);
      setProfiles([]);
      setLoading(false);
      return;
    }

    const nextMessages = (messageData || []) as ChatMessageRecord[];
    setMessages(nextMessages);

    const senderIds = Array.from(new Set(nextMessages.map((message) => message.sender_id)));
    if (senderIds.length === 0) {
      setProfiles([]);
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("employees")
      .select("id, emp_id, first_name, last_name, role, profile_photo_path")
      .in("id", senderIds);

    if (profileError) {
      console.error("Error fetching notification profiles:", profileError);
    }

    setProfiles(await attachProfilePhotoUrls((profileData || []) as EmployeeProfile[]));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(createRealtimeTopic(`notifications:${currentUserId}`))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, loadNotifications]);

  const notificationItems = useMemo(
    () => buildNotifications(messages, profiles),
    [buildNotifications, messages, profiles]
  );

  const openChat = (item: NotificationItem) => {
    router.push({
      pathname: "/securityofficer/message",
      params: { channelId: item.senderId },
    });
  };

  const renderNotification = (item: NotificationItem) => (
    <Pressable key={item.id} style={styles.notificationRow} onPress={() => openChat(item)}>
      <View style={[styles.avatar, { backgroundColor: item.avatarColor }]}>
        {item.avatarUrl ? (
          <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
        ) : (
          <Text style={[styles.avatarText, { color: item.avatarTextColor }]}>{getInitials(item.senderName)}</Text>
        )}
      </View>

      <View style={styles.notificationBody}>
        <View style={styles.titleRow}>
          <Text style={styles.senderName} numberOfLines={1}>
            {item.senderName}
          </Text>
          <Text style={styles.timeText}>{item.time}</Text>
        </View>

        <Text style={styles.roleText} numberOfLines={1}>
          {item.senderRole}
        </Text>
        <Text style={styles.previewText} numberOfLines={2}>
          {item.text}
        </Text>
      </View>

      {item.isImportant ? (
        <View style={styles.importantPill}>
          <Text style={styles.importantText}>Important</Text>
        </View>
      ) : null}
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={10}>
          <ChevronLeft size={28} color="#FFFFFF" strokeWidth={2.4} />
        </Pressable>

        <Text style={styles.headerTitle}>Notifications</Text>

        <View style={styles.headerIcon}>
          <Bell size={24} color="#FFFFFF" strokeWidth={2.4} />
        </View>
      </View>

      <ScrollView style={styles.listArea} contentContainerStyle={styles.listContent}>
        <Text style={styles.sectionTitle}>Chat Alerts</Text>

        {loading ? (
          <ActivityIndicator color="#0F2C59" style={styles.loader} />
        ) : notificationItems.length > 0 ? (
          notificationItems.map(renderNotification)
        ) : (
          <View style={styles.emptyState}>
            <Bell size={34} color="#52606D" strokeWidth={2} />
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyText}>New chat messages will appear here.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    backgroundColor: "#0F2C59",
    paddingTop: 48,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "800",
  },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  listArea: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 36,
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 14,
  },
  loader: {
    marginTop: 36,
  },
  notificationRow: {
    minHeight: 96,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    marginBottom: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    fontSize: 17,
    fontWeight: "800",
  },
  notificationBody: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  senderName: {
    flex: 1,
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
    marginRight: 8,
  },
  timeText: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "700",
  },
  roleText: {
    color: "#52606D",
    fontSize: 13,
    marginBottom: 5,
  },
  previewText: {
    color: "#111827",
    fontSize: 14,
    lineHeight: 19,
  },
  importantPill: {
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginLeft: 8,
  },
  importantText: {
    color: "#B91C1C",
    fontSize: 11,
    fontWeight: "800",
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    color: "#111827",
    fontSize: 19,
    fontWeight: "800",
    marginTop: 12,
    marginBottom: 6,
  },
  emptyText: {
    color: "#52606D",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 21,
  },
});
