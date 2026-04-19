import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { usePathname, useRouter } from "expo-router";
import { ChevronLeft, MessageCirclePlus, Search } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import Text from "../../components/TranslatedText";
import { createRealtimeTopic } from "../../lib/realtime";
import {
  formatUnreadCount,
  getReadStateMap,
  getUnreadCountsByParticipant,
  isMissingChatReadStatesTableError,
} from "../../lib/chatUnread";
import {
  formatMessageTime,
  getAvatarColor,
  getAvatarTextColor,
  getDisplayName,
  getInitials,
  type ChatChannel,
  type ChatMessageRecord,
  type EmployeeProfile,
} from "../../lib/messageData";

const IMPORTANT_PREFIX = "[IMPORTANT] ";
const ATTACHMENT_PREFIX = "[ATTACHMENT] ";

const getMessagePreview = (text: string, isOwnMessage: boolean) => {
  const messageText = text.startsWith(IMPORTANT_PREFIX) ? text.slice(IMPORTANT_PREFIX.length) : text;

  if (messageText.startsWith(ATTACHMENT_PREFIX)) {
    try {
      const attachment = JSON.parse(messageText.slice(ATTACHMENT_PREFIX.length)) as { type?: string; caption?: string };
      const mediaLabel = attachment.type === "video" ? "Video" : "Photo";
      const preview = attachment.caption ? `${mediaLabel}: ${attachment.caption}` : `${mediaLabel} attachment`;
      return `${isOwnMessage ? "You: " : ""}${preview}`;
    } catch {
      return `${isOwnMessage ? "You: " : ""}Attachment`;
    }
  }

  return isOwnMessage ? `You: ${messageText}` : messageText;
};

const Avatar = ({ channel, size = 54 }: { channel: ChatChannel; size?: number }) => (
  <View
    style={[
      styles.avatar,
      {
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: channel.avatarColor,
      },
    ]}
  >
    <Text style={[styles.avatarText, { color: channel.avatarTextColor }]}>{getInitials(channel.name)}</Text>
    {channel.online && <View style={styles.onlineDot} />}
  </View>
);

export default function MessagingChannelScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const isSeniorSecurityOfficer = pathname?.startsWith("/sso") ?? false;
  const showCurrentSupervisorSection = !isSeniorSecurityOfficer;
  const baseRoute = isSeniorSecurityOfficer ? "/sso" : "/securityofficer";

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [currentSupervisorId, setCurrentSupervisorId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const todayISO = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  };

  const buildChannels = useCallback(
    (
      messages: ChatMessageRecord[],
      userId: string,
      profiles: EmployeeProfile[],
      unreadCountsByParticipant: Map<string, number>
    ) => {
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const latestByParticipant = new Map<string, ChatMessageRecord>();

    messages.forEach((message) => {
      const participantId = message.sender_id === userId ? message.receiver_id : message.sender_id;
      const previous = latestByParticipant.get(participantId);

      if (!previous || new Date(message.created_at).getTime() > new Date(previous.created_at).getTime()) {
        latestByParticipant.set(participantId, message);
      }
    });

    return Array.from(latestByParticipant.entries())
      .map(([participantId, latestMessage]) => {
        const profile = profileById.get(participantId);
        const name = getDisplayName(profile);
        const avatarColor = getAvatarColor(participantId);

        return {
          id: participantId,
          name,
          subtitle: profile?.role ?? "Conversation",
          lastMessage: getMessagePreview(latestMessage.text, latestMessage.sender_id === userId),
          lastTime: formatMessageTime(latestMessage.created_at),
          unread: unreadCountsByParticipant.get(participantId) ?? 0,
          online: false,
          avatarColor,
          avatarTextColor: getAvatarTextColor(avatarColor),
        };
      })
      .sort((a, b) => {
        const messageA = latestByParticipant.get(a.id);
        const messageB = latestByParticipant.get(b.id);
        return new Date(messageB?.created_at ?? 0).getTime() - new Date(messageA?.created_at ?? 0).getTime();
      });
    },
    []
  );

  const loadChannels = useCallback(async () => {
    setLoading(true);

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    if (sessionError || !userId) {
      console.error("Error loading session:", sessionError);
      setChannels([]);
      setCurrentUserId(null);
      setLoading(false);
      return;
    }

    setCurrentUserId(userId);

    const shiftPromise = showCurrentSupervisorSection
      ? supabase
          .from("shifts")
          .select("supervisor_id")
          .eq("officer_id", userId)
          .eq("shift_date", todayISO())
          .order("shift_start", { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null as { supervisor_id?: string | null } | null, error: null as unknown });

    const [{ data: messagesData, error: messagesError }, { data: shiftData, error: shiftError }, readStateResult] =
      await Promise.all([
      supabase
        .from("messages")
        .select("id, sender_id, receiver_id, text, created_at")
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false }),
      shiftPromise,
      getReadStateMap(userId).then(
        (readStateMap) => ({ readStateMap, error: null as unknown }),
        (error) => ({ readStateMap: new Map<string, string>(), error })
      ),
    ]);

    if (shiftError && showCurrentSupervisorSection) {
      console.error("Error fetching current supervisor:", shiftError);
    }

    setCurrentSupervisorId(showCurrentSupervisorSection ? shiftData?.supervisor_id ?? null : null);

    if (messagesError) {
      console.error("Error fetching message channels:", messagesError);
      setChannels([]);
      setLoading(false);
      return;
    }

    const messages = (messagesData || []) as ChatMessageRecord[];
    if (readStateResult.error && !isMissingChatReadStatesTableError(readStateResult.error)) {
      console.error("Error fetching chat read states:", readStateResult.error);
    }

    const unreadCountsByParticipant = getUnreadCountsByParticipant(messages, userId, readStateResult.readStateMap);
    const participantIds = Array.from(
      new Set(messages.map((message) => (message.sender_id === userId ? message.receiver_id : message.sender_id)))
    );

    if (participantIds.length === 0) {
      setChannels([]);
      setLoading(false);
      return;
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from("employees")
      .select("id, first_name, last_name, role")
      .in("id", participantIds);

    if (profilesError) {
      console.error("Error fetching message profiles:", profilesError);
    }

    setChannels(buildChannels(messages, userId, (profilesData || []) as EmployeeProfile[], unreadCountsByParticipant));
    setLoading(false);
  }, [buildChannels, showCurrentSupervisorSection]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  useFocusEffect(
    useCallback(() => {
      loadChannels();
    }, [loadChannels])
  );

  useEffect(() => {
    if (!currentUserId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      channel = supabase
        .channel(createRealtimeTopic(`message-channels:${currentUserId}`))
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
          },
          (payload) => {
            const row = (payload.new || payload.old) as Partial<ChatMessageRecord>;
            if (row.sender_id !== currentUserId && row.receiver_id !== currentUserId) return;
            loadChannels();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "chat_read_states",
            filter: `user_id=eq.${currentUserId}`,
          },
          () => {
            loadChannels();
          }
        )
        .subscribe();
    } catch (error) {
      console.error("Error subscribing to realtime updates:", error);
      return;
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [currentUserId, loadChannels]);

  const filteredChannels = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return channels;

    return channels.filter((channel) => channel.name.toLowerCase().includes(normalizedSearch));
  }, [channels, search]);

  const currentSupervisor = filteredChannels.find((channel) => channel.id === currentSupervisorId);
  const otherChannels = filteredChannels.filter((channel) => channel.id !== currentSupervisorId);

  const openChannel = (channel: ChatChannel) => {
    router.push({
      pathname: `${baseRoute}/message`,
      params: { channelId: channel.id },
    });
  };

  const renderChannelRow = (channel: ChatChannel) => (
    <Pressable key={channel.id} style={styles.channelRow} onPress={() => openChannel(channel)}>
      <Avatar channel={channel} />

      <View style={styles.channelBody}>
        <View style={styles.channelTitleRow}>
          <Text style={styles.channelName} numberOfLines={1}>
            {channel.name}
          </Text>
          <Text style={styles.channelTime}>{channel.lastTime}</Text>
        </View>

        <View style={styles.channelPreviewRow}>
          <Text style={styles.channelPreview} numberOfLines={1}>
            {channel.lastMessage}
          </Text>
          {channel.unread ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{formatUnreadCount(channel.unread)}</Text>
            </View>
          ) : channel.lastTime ? (
            <Text style={styles.channelCheck}>{"\u2713"}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace(`${baseRoute}/home`)
          }
          hitSlop={10}
        >
          <ChevronLeft size={28} color="#FFFFFF" strokeWidth={2.4} />
        </Pressable>

        <Text style={styles.headerTitle}>Messages</Text>

        <Pressable
          style={styles.composeButton}
          onPress={() => router.push(`${baseRoute}/newMessage`)}
          hitSlop={10}
        >
          <MessageCirclePlus size={28} color="#FFFFFF" strokeWidth={2.4} />
        </Pressable>
      </View>

      <ScrollView style={styles.listArea} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        {showCurrentSupervisorSection ? (
          <>
            <Text style={styles.sectionTitle}>Current Supervisor</Text>
            {loading ? (
              <ActivityIndicator color="#0F2C59" />
            ) : currentSupervisor ? (
              renderChannelRow(currentSupervisor)
            ) : (
              <Text style={styles.emptyText}>No current supervisor conversation yet.</Text>
            )}
          </>
        ) : null}

        <Text style={[styles.sectionTitle, showCurrentSupervisorSection ? styles.allSupervisorsTitle : null]}>
          Message History
        </Text>

        <View style={styles.searchWrap}>
          <Search size={24} color="#111827" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search"
            placeholderTextColor="#7A7F87"
            style={styles.searchInput}
          />
        </View>

        <View style={styles.supervisorList}>
          {loading ? (
            <ActivityIndicator color="#0F2C59" style={styles.listLoader} />
          ) : otherChannels.length > 0 ? (
            otherChannels.map(renderChannelRow)
          ) : (
            <Text style={styles.emptyText}>No message history yet.</Text>
          )}
        </View>
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
    fontSize: 28,
    fontWeight: "700",
  },
  composeButton: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  listArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  listContent: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 36,
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 16,
  },
  allSupervisorsTitle: {
    marginTop: 28,
  },
  searchWrap: {
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: "#111827",
    fontSize: 16,
    paddingHorizontal: 12,
  },
  supervisorList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  listLoader: {
    paddingVertical: 20,
  },
  channelRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    paddingVertical: 10,
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 17,
    fontWeight: "800",
  },
  onlineDot: {
    position: "absolute",
    top: 0,
    right: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#24E36A",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  channelBody: {
    flex: 1,
    marginLeft: 12,
  },
  channelTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  channelName: {
    flex: 1,
    color: "#111827",
    fontSize: 17,
    fontWeight: "800",
  },
  channelTime: {
    color: "#7A7F87",
    fontSize: 14,
    marginLeft: 10,
  },
  channelPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  channelPreview: {
    flex: 1,
    color: "#7A7F87",
    fontSize: 15,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FF3B58",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  unreadText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  channelCheck: {
    color: "#8A8F98",
    fontSize: 16,
    marginLeft: 8,
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 14,
    paddingVertical: 16,
    textAlign: "center",
  },
});
