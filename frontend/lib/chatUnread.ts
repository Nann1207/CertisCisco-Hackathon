import { supabase } from "./supabase";
import type { ChatMessageRecord } from "./messageData";

export type ChatReadStateRecord = {
  participant_id: string;
  last_read_at: string;
};

export type ChatReadStateMap = Map<string, string>;

type SupabaseError = {
  code?: string;
  message?: string;
};

export const isMissingChatReadStatesTableError = (error: unknown) => {
  const supabaseError = error as SupabaseError;
  return (
    supabaseError?.code === "PGRST205" ||
    supabaseError?.message?.includes("chat_read_states") ||
    supabaseError?.message?.includes("schema cache")
  );
};

export const getReadStateMap = async (userId: string) => {
  const { data, error } = await supabase
    .from("chat_read_states")
    .select("participant_id, last_read_at")
    .eq("user_id", userId);

  if (error) {
    if (isMissingChatReadStatesTableError(error)) {
      return new Map<string, string>();
    }

    throw error;
  }

  return new Map(
    ((data || []) as ChatReadStateRecord[]).map((state) => [state.participant_id, state.last_read_at])
  );
};

export const markChatRead = async (userId: string, participantId: string) => {
  const { error } = await supabase.from("chat_read_states").upsert(
    {
      user_id: userId,
      participant_id: participantId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "user_id,participant_id" }
  );

  if (error) {
    if (isMissingChatReadStatesTableError(error)) {
      return;
    }

    throw error;
  }
};

export const getUnreadCountsByParticipant = (
  messages: ChatMessageRecord[],
  userId: string,
  readStateMap: ChatReadStateMap
) => {
  const counts = new Map<string, number>();

  messages.forEach((message) => {
    if (message.receiver_id !== userId) return;

    const lastReadAt = readStateMap.get(message.sender_id);
    if (lastReadAt && new Date(message.created_at).getTime() <= new Date(lastReadAt).getTime()) return;

    counts.set(message.sender_id, (counts.get(message.sender_id) ?? 0) + 1);
  });

  return counts;
};

export const getTotalUnreadCount = (
  messages: ChatMessageRecord[],
  userId: string,
  readStateMap: ChatReadStateMap
) => {
  const counts = getUnreadCountsByParticipant(messages, userId, readStateMap);
  return Array.from(counts.values()).reduce((total, count) => total + count, 0);
};

export const formatUnreadCount = (count: number) => (count > 99 ? "99+" : String(count));
