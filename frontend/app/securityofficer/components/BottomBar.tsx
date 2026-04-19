import React, { useCallback, useEffect, useState } from "react";
import { View, Pressable, StyleSheet, Text } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Home, NotebookPen, MessageCircleMore, ListChecks, PhoneCall } from "lucide-react-native";
import { supabase } from "../../../lib/supabase";
import { createRealtimeTopic } from "../../../lib/realtime";
import type { ChatMessageRecord } from "../../../lib/messageData";
import {
  formatUnreadCount,
  getReadStateMap,
  getTotalUnreadCount,
  isMissingChatReadStatesTableError,
} from "../../../lib/chatUnread";

type Tab = {
  key: string;
  Icon: any;
};

const TABS: Tab[] = [
  { key: "home", Icon: Home },
  { key: "reports", Icon: NotebookPen },
  { key: "phonecalls", Icon: PhoneCall },
  { key: "services", Icon: MessageCircleMore },
  { key: "sop", Icon: ListChecks },
];

export default function BottomBar() {
  const router = useRouter();
  const pathname = usePathname();
  const isSeniorSecurityOfficer = pathname?.startsWith("/sso") ?? false;
  const baseRoute = isSeniorSecurityOfficer ? "/sso" : "/securityofficer";
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    if (sessionError || !userId) {
      setCurrentUserId(null);
      setUnreadCount(0);
      return;
    }

    setCurrentUserId(userId);

    const [{ data: messagesData, error: messagesError }, readStateResult] = await Promise.all([
      supabase
        .from("messages")
        .select("id, sender_id, receiver_id, text, created_at")
        .eq("receiver_id", userId),
      getReadStateMap(userId).then(
        (readStateMap) => ({ readStateMap, error: null }),
        (error) => ({ readStateMap: new Map<string, string>(), error })
      ),
    ]);

    if (messagesError) {
      console.error("Error fetching bottom bar unread messages:", messagesError);
      setUnreadCount(0);
      return;
    }

    if (readStateResult.error && !isMissingChatReadStatesTableError(readStateResult.error)) {
      console.error("Error fetching bottom bar read states:", readStateResult.error);
    }

    setUnreadCount(
      getTotalUnreadCount((messagesData || []) as ChatMessageRecord[], userId, readStateResult.readStateMap)
    );
  }, []);

  useEffect(() => {
    loadUnreadCount();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      loadUnreadCount();
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [loadUnreadCount]);

  useEffect(() => {
    loadUnreadCount();
  }, [loadUnreadCount, pathname]);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(createRealtimeTopic(`bottom-bar-unread:${currentUserId}`))
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
          loadUnreadCount();
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
          loadUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, loadUnreadCount]);

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        {TABS.map(({ key, Icon }) => {
          const href =
            key === "home"
              ? `${baseRoute}/home`
              : key === "reports"
                ? `${baseRoute}/reports`
                : key === "phonecalls"
                  ? `${baseRoute}/phonecalls`
                  : key === "services"
                    ? `${baseRoute}/messagingChannel`
                    : `${baseRoute}/sop`;

          const active =
            pathname === href ||
            (key === "services" &&
              (pathname === `${baseRoute}/message` || pathname === `${baseRoute}/messagingChannel`));

          return (
            <Pressable
              key={key}
              onPress={() => router.replace(href)}
              style={styles.btn}
              hitSlop={10}
            >
              <Icon size={24} color={active ? "#0E2D52" : "#0E2D52"} />
              {key === "services" && unreadCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{formatUnreadCount(unreadCount)}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      
      <View style={styles.homeIndicator} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFFFF",
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.12)",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 10,
  },
  bar: {
    height: 50,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  btn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FF3B58",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 12,
  },
  homeIndicator: {
    alignSelf: "center",
    marginTop: 10,
    width: 134,
    height: 5,
    backgroundColor: "#000",
    borderRadius: 34,
  },
});
