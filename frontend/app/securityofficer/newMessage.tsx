import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, Search } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import Text from "../../components/TranslatedText";
import {
  getAvatarColor,
  getAvatarTextColor,
  getDisplayName,
  getInitials,
  type ChatChannel,
  type ChatMessageRecord,
  type EmployeeProfile,
} from "../../lib/messageData";

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
  </View>
);

const buildContact = (profile: EmployeeProfile): ChatChannel => {
  const avatarColor = getAvatarColor(profile.id);

  return {
    id: profile.id,
    name: getDisplayName(profile),
    subtitle: profile.role ?? "Employee",
    lastMessage: "Tap to start a conversation",
    lastTime: "",
    online: false,
    avatarColor,
    avatarTextColor: getAvatarTextColor(avatarColor),
  };
};

export default function NewMessageScreen() {
  const router = useRouter();
  const [contacts, setContacts] = useState<ChatChannel[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [emptyHint, setEmptyHint] = useState("No people found.");

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setEmptyHint("No people found.");

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    if (sessionError || !userId) {
      console.error("Error loading session:", sessionError);
      setContacts([]);
      setLoading(false);
      return;
    }

    const [
      { data: employeesData, error: employeesError },
      { data: messagesData, error: messagesError },
      { data: shiftsData, error: shiftsError },
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id, first_name, last_name, role")
        .order("first_name", { ascending: true }),
      supabase
        .from("messages")
        .select("id, sender_id, receiver_id, text, created_at")
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`),
      supabase.from("shifts").select("supervisor_id").eq("officer_id", userId),
    ]);

    if (employeesError) {
      console.error("Error fetching employee directory:", employeesError);
    } else {
      console.log("New message employee rows:", employeesData?.length ?? 0);
    }

    if (messagesError) {
      console.error("Error fetching message contacts:", messagesError);
    }

    if (shiftsError) {
      console.error("Error fetching shift supervisors:", shiftsError);
    }

    const visibleProfiles = (employeesData || []) as EmployeeProfile[];
    const contactsById = new Map(visibleProfiles.map((profile) => [profile.id, buildContact(profile)]));

    if (!contactsById.has(userId)) {
      const avatarColor = getAvatarColor(userId);
      contactsById.set(userId, {
        id: userId,
        name: "You",
        subtitle: "Message yourself",
        lastMessage: "Tap to start a conversation",
        lastTime: "",
        online: false,
        avatarColor,
        avatarTextColor: getAvatarTextColor(avatarColor),
      });
    } else {
      const selfContact = contactsById.get(userId);
      if (selfContact) {
        contactsById.set(userId, {
          ...selfContact,
          name: `${selfContact.name} (You)`,
          subtitle: selfContact.subtitle || "Message yourself",
        });
      }
    }

    const messageParticipantIds = ((messagesData || []) as ChatMessageRecord[])
      .map((message) => (message.sender_id === userId ? message.receiver_id : message.sender_id))
      .filter(Boolean);

    const supervisorIds = ((shiftsData || []) as { supervisor_id: string | null }[])
      .map((shift) => shift.supervisor_id)
      .filter((id): id is string => Boolean(id));

    const fallbackIds = Array.from(new Set([...messageParticipantIds, ...supervisorIds]));

    const missingSupervisorIds = supervisorIds.filter((id) => !contactsById.has(id));
    const supervisorRows = await Promise.all(
      missingSupervisorIds.map(async (id) => {
        const { data, error } = await supabase.rpc("get_my_supervisor_name", {
          p_supervisor_id: id,
        });

        if (error) {
          console.error("Error fetching supervisor name:", error);
          return null;
        }

        const row = Array.isArray(data) ? data[0] : null;
        if (!row) return null;

        return {
          id,
          first_name: row.first_name ?? null,
          last_name: row.last_name ?? null,
          role: "Security Supervisor",
        } satisfies EmployeeProfile;
      })
    );

    supervisorRows.forEach((profile) => {
      if (profile) contactsById.set(profile.id, buildContact(profile));
    });

    fallbackIds.forEach((id) => {
      if (contactsById.has(id)) return;

      const avatarColor = getAvatarColor(id);
      contactsById.set(id, {
        id,
        name: "Unknown User",
        subtitle: "Conversation",
        lastMessage: "Tap to start a conversation",
        lastTime: "",
        online: false,
        avatarColor,
        avatarTextColor: getAvatarTextColor(avatarColor),
      });
    });

    const nextContacts = Array.from(contactsById.values()).sort((a, b) => a.name.localeCompare(b.name));
    setContacts(nextContacts);

    if (nextContacts.length === 0 && !employeesError) {
      setEmptyHint("No visible people yet. If employees exist, check the Supabase employees SELECT policy.");
    } else if (employeesError) {
      setEmptyHint("Unable to load people. Check the employees table SELECT policy.");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const filteredContacts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return contacts;

    return contacts.filter((contact) => contact.name.toLowerCase().includes(normalizedSearch));
  }, [contacts, search]);

  const openContact = (contact: ChatChannel) => {
    router.push({
      pathname: "/securityofficer/message",
      params: { channelId: contact.id },
    });
  };

  const renderContactRow = (contact: ChatChannel) => (
    <Pressable key={contact.id} style={styles.contactRow} onPress={() => openContact(contact)}>
      <Avatar channel={contact} />

      <View style={styles.contactBody}>
        <Text style={styles.contactName} numberOfLines={1}>
          {contact.name}
        </Text>
        <Text style={styles.contactRole} numberOfLines={1}>
          {contact.subtitle}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/securityofficer/home")
          }
          hitSlop={10}
        >
          <ChevronLeft size={28} color="#FFFFFF" strokeWidth={2.4} />
        </Pressable>

        <Text style={styles.headerTitle}>New Chat</Text>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.listArea} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        <View style={styles.searchWrap}>
          <Search size={24} color="#111827" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search people"
            placeholderTextColor="#7A7F87"
            style={styles.searchInput}
          />
        </View>

        <View style={styles.contactList}>
          {loading ? (
            <ActivityIndicator color="#0F2C59" style={styles.listLoader} />
          ) : filteredContacts.length > 0 ? (
            filteredContacts.map(renderContactRow)
          ) : (
            <Text style={styles.emptyText}>{emptyHint}</Text>
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
  headerSpacer: {
    width: 52,
    height: 52,
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
  contactList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  listLoader: {
    paddingVertical: 20,
  },
  contactRow: {
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
  contactBody: {
    flex: 1,
    marginLeft: 12,
  },
  contactName: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "800",
  },
  contactRole: {
    color: "#7A7F87",
    fontSize: 15,
    marginTop: 3,
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 14,
    paddingVertical: 16,
    textAlign: "center",
  },
});
