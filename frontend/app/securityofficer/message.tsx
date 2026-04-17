import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Image,
  InteractionManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Paperclip, Search, Send, Zap } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useVideoPlayer, VideoView } from "expo-video";
import { supabase } from "../../lib/supabase";
import {
  getAvatarColor,
  getAvatarTextColor,
  getDisplayName,
  getInitials,
  type ChatChannel,
  type ChatMessageRecord,
  type EmployeeProfile,
} from "../../lib/messageData";

type ChatMessageProps = {
  rawText: string;
  text: string;
  time: string;
  isSender: boolean;
  isImportant: boolean;
  attachment?: MessageAttachment | null;
  onOpenAttachment: (attachment: MessageAttachment) => void;
  onForwardMessage: (messageText: string) => void;
  avatarColor: string;
  avatarTextColor: string;
  avatarLabel: string;
};

const IMPORTANT_PREFIX = "[IMPORTANT] ";
const ATTACHMENT_PREFIX = "[ATTACHMENT] ";
const ATTACHMENT_BUCKET = "message-attachments";

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

type MessageAttachment = {
  type: "image" | "video";
  url: string;
  path: string;
  name: string;
  mimeType: string;
  caption?: string;
};

type AttachmentError = {
  message?: string;
  statusCode?: string;
  error?: string;
};

type PendingAttachmentAction = {
  source: "camera" | "library";
  mediaTypes: ImagePicker.MediaType[];
};

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
};

const parseMessageText = (text: string) => {
  const isImportant = text.startsWith(IMPORTANT_PREFIX);
  const messageText = isImportant ? text.slice(IMPORTANT_PREFIX.length) : text;

  if (messageText.startsWith(ATTACHMENT_PREFIX)) {
    try {
      const attachment = JSON.parse(messageText.slice(ATTACHMENT_PREFIX.length)) as MessageAttachment;

      return {
        isImportant,
        displayText: attachment.type === "video" ? "Video attachment" : "Photo attachment",
        attachment,
      };
    } catch {
      return {
        isImportant,
        displayText: messageText,
        attachment: null,
      };
    }
  }

  return {
    isImportant,
    displayText: messageText,
    attachment: null,
  };
};

const buildChannelFromProfile = (profile: EmployeeProfile): ChatChannel => {
  const avatarColor = getAvatarColor(profile.id);

  return {
    id: profile.id,
    name: getDisplayName(profile),
    subtitle: profile.role ?? "Conversation",
    lastMessage: "",
    lastTime: "",
    online: false,
    avatarColor,
    avatarTextColor: getAvatarTextColor(avatarColor),
  };
};

const Avatar = ({ channel, size = 52 }: { channel: ChatChannel; size?: number }) => (
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

const ChatMessage = ({
  rawText,
  text,
  time,
  isSender,
  isImportant,
  attachment,
  onOpenAttachment,
  onForwardMessage,
  avatarColor,
  avatarTextColor,
  avatarLabel,
}: ChatMessageProps) => (
  <View style={[styles.messageRow, isSender ? styles.messageRowSender : styles.messageRowReceiver]}>
    {!isSender && (
      <View style={[styles.messageAvatar, { backgroundColor: avatarColor }]}>
        <Text style={[styles.messageAvatarText, { color: avatarTextColor }]}>{avatarLabel}</Text>
      </View>
    )}

    <Pressable
      style={[
        styles.messageBubble,
        isSender ? styles.senderBubble : styles.receiverBubble,
        isImportant && styles.importantBubble,
      ]}
      onLongPress={() => onForwardMessage(rawText)}
      delayLongPress={300}
    >
      {isImportant && (
        <View style={styles.importantTag}>
          <Zap size={13} color="#B91C1C" strokeWidth={2.6} />
          <Text style={styles.importantTagText}>Important</Text>
        </View>
      )}
      {attachment ? (
        <Pressable
          onPress={() => onOpenAttachment(attachment)}
          onLongPress={() => onForwardMessage(rawText)}
          delayLongPress={300}
          style={styles.attachmentWrap}
        >
          {attachment.type === "image" ? (
            <Image source={{ uri: attachment.url }} style={styles.attachmentImage} resizeMode="cover" />
          ) : (
            <View style={styles.videoAttachment}>
              <Text style={styles.videoAttachmentIcon}>▶</Text>
              <Text style={styles.videoAttachmentText}>Open video</Text>
            </View>
          )}
          <Text style={styles.attachmentName} numberOfLines={1}>
            {attachment.name}
          </Text>
          {attachment.caption ? <Text style={styles.attachmentCaption}>{attachment.caption}</Text> : null}
        </Pressable>
      ) : (
        <Text style={styles.messageText}>{text}</Text>
      )}

      <View style={[styles.messageMeta, isSender ? styles.messageMetaSender : styles.messageMetaReceiver]}>
        {isSender && <Text style={styles.readReceipt}>{"\u2713\u2713"}</Text>}
        <Text style={styles.messageTime}>{time}</Text>
      </View>
    </Pressable>
  </View>
);

const VideoPlayerBox = ({ uri, style }: { uri: string; style: StyleProp<ViewStyle> }) => {
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = false;
  });

  return <VideoView player={player} style={style} nativeControls contentFit="contain" />;
};

export default function MessageScreen() {
  const router = useRouter();
  const { channelId } = useLocalSearchParams<{ channelId?: string }>();
  const scrollViewRef = useRef<ScrollView | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<ChatChannel | null>(null);
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [importantMode, setImportantMode] = useState(false);
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [pendingAttachmentAction, setPendingAttachmentAction] = useState<PendingAttachmentAction | null>(null);
  const [pendingAttachmentAsset, setPendingAttachmentAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [attachmentCaption, setAttachmentCaption] = useState("");
  const [viewingAttachment, setViewingAttachment] = useState<MessageAttachment | null>(null);
  const [forwardingMessageText, setForwardingMessageText] = useState<string | null>(null);
  const [forwardContacts, setForwardContacts] = useState<ChatChannel[]>([]);
  const [forwardSearch, setForwardSearch] = useState("");
  const [loadingForwardContacts, setLoadingForwardContacts] = useState(false);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const isMessageInCurrentChat = useCallback(
    (msg: ChatMessageRecord) => {
      if (!currentUserId || !channelId) return false;

      return (
        (msg.sender_id === currentUserId && msg.receiver_id === channelId) ||
        (msg.sender_id === channelId && msg.receiver_id === currentUserId)
      );
    },
    [channelId, currentUserId]
  );

  const loadChat = useCallback(async () => {
    if (!channelId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    if (sessionError || !userId) {
      console.error("Error loading session:", sessionError);
      setCurrentUserId(null);
      setSelectedChannel(null);
      setMessages([]);
      setLoading(false);
      return;
    }

    setCurrentUserId(userId);

    const [{ data: profileData, error: profileError }, { data: messagesData, error: messagesError }] = await Promise.all([
      supabase.from("employees").select("id, first_name, last_name, role").eq("id", channelId).maybeSingle(),
      supabase
        .from("messages")
        .select("id, sender_id, receiver_id, text, created_at")
        .or(`and(sender_id.eq.${userId},receiver_id.eq.${channelId}),and(sender_id.eq.${channelId},receiver_id.eq.${userId})`)
        .order("created_at", { ascending: true }),
    ]);

    if (profileError) {
      console.error("Error fetching chat profile:", profileError);
    }

    if (profileData) {
      setSelectedChannel(buildChannelFromProfile(profileData as EmployeeProfile));
    } else {
      const avatarColor = getAvatarColor(channelId);
      setSelectedChannel({
        id: channelId,
        name: "Unknown User",
        subtitle: "Conversation",
        lastMessage: "",
        lastTime: "",
        online: false,
        avatarColor,
        avatarTextColor: getAvatarTextColor(avatarColor),
      });
    }

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      setMessages([]);
    } else {
      setMessages((messagesData || []) as ChatMessageRecord[]);
    }

    setLoading(false);
  }, [channelId]);

  useEffect(() => {
    setMessages([]);
    setInput("");
    loadChat();
  }, [loadChat]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!currentUserId || !channelId) return;

    const channel = supabase
      .channel(`chat:${currentUserId}:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newMessage = payload.new as ChatMessageRecord;

          if (!isMessageInCurrentChat(newMessage)) return;

          setMessages((prev) => {
            const exists = prev.some((msg) => msg.id === newMessage.id);
            if (exists) return prev;
            return [...prev, newMessage];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId, currentUserId, isMessageInCurrentChat]);

  const handleSendMessage = async () => {
    if (!currentUserId || !channelId) return;

    const trimmed = input.trim();
    if (!trimmed) return;

    const textToSend = importantMode ? `${IMPORTANT_PREFIX}${trimmed}` : trimmed;

    const temporaryMessage: ChatMessageRecord = {
      id: `local-${Date.now()}`,
      sender_id: currentUserId,
      receiver_id: channelId,
      text: textToSend,
      created_at: new Date().toISOString(),
    };

    setInput("");
    setImportantMode(false);
    setMessages((prev) => [...prev, temporaryMessage]);

    if (importantMode) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      Vibration.vibrate([0, 90, 50, 180]);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }

    const { data, error } = await supabase
      .from("messages")
      .insert([
        {
          sender_id: currentUserId,
          receiver_id: channelId,
          text: textToSend,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => prev.filter((msg) => msg.id !== temporaryMessage.id));
      setInput(trimmed);
      setImportantMode(textToSend.startsWith(IMPORTANT_PREFIX));
      return;
    }

    const sentMessage = data as ChatMessageRecord;
    setMessages((prev) => prev.map((msg) => (msg.id === temporaryMessage.id ? sentMessage : msg)));
  };

  const sendMessageText = useCallback(async (textToSend: string, restoreTextOnError = "") => {
    if (!currentUserId || !channelId) return;

    const temporaryMessage: ChatMessageRecord = {
      id: `local-${Date.now()}`,
      sender_id: currentUserId,
      receiver_id: channelId,
      text: textToSend,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, temporaryMessage]);

    const { data, error } = await supabase
      .from("messages")
      .insert([
        {
          sender_id: currentUserId,
          receiver_id: channelId,
          text: textToSend,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => prev.filter((msg) => msg.id !== temporaryMessage.id));
      if (restoreTextOnError) setInput(restoreTextOnError);
      throw error;
    }

    const sentMessage = data as ChatMessageRecord;
    setMessages((prev) => prev.map((msg) => (msg.id === temporaryMessage.id ? sentMessage : msg)));
  }, [channelId, currentUserId]);

  const getAssetFileName = useCallback((asset: ImagePicker.ImagePickerAsset) => {
    const fallbackExtension = asset.type === "video" ? "mp4" : "jpg";
    const fileName = asset.fileName || `${asset.type || "attachment"}-${Date.now()}.${fallbackExtension}`;
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  }, []);

  const uploadAndSendAttachment = useCallback(async (asset: ImagePicker.ImagePickerAsset, caption: string) => {
    if (!currentUserId || !channelId) return;

    setUploadingAttachment(true);

    try {
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const fileName = getAssetFileName(asset);
      const mimeType = asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg");
      const mediaType = asset.type === "video" ? "video" : "image";
      const storagePath = `${currentUserId}/${channelId}/${Date.now()}-${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(storagePath, arrayBuffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(storagePath);
      const attachment: MessageAttachment = {
        type: mediaType,
        url: data.publicUrl,
        path: storagePath,
        name: fileName,
        mimeType,
        caption: caption.trim() || undefined,
      };
      const textToSend = `${importantMode ? IMPORTANT_PREFIX : ""}${ATTACHMENT_PREFIX}${JSON.stringify(attachment)}`;

      setImportantMode(false);
      await sendMessageText(textToSend);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (error) {
      console.error("Error sending attachment:", error);
      const attachmentError = error as AttachmentError;
      const isMissingBucket =
        attachmentError.message?.toLowerCase().includes("bucket not found") ||
        attachmentError.error?.toLowerCase().includes("bucket not found") ||
        attachmentError.statusCode === "404";

      Alert.alert(
        "Attachment failed",
        isMissingBucket
          ? "The Supabase Storage bucket message-attachments does not exist yet. Create it in Supabase Storage, or run backend/supabase_message_attachments_storage.sql."
          : "Unable to upload this attachment. Please try again."
      );
    } finally {
      setUploadingAttachment(false);
    }
  }, [channelId, currentUserId, getAssetFileName, importantMode, sendMessageText]);

  const queueAttachmentPicker = (source: "camera" | "library", mediaTypes: ImagePicker.MediaType[]) => {
    console.log("Attachment action pressed:", source, mediaTypes);
    setPendingAttachmentAction({ source, mediaTypes });
    setShowAttachmentSheet(false);
  };

  const openAttachmentMenu = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: "Attach media",
          options: ["Take photo", "Record video", "Choose photo", "Choose video", "Cancel"],
          cancelButtonIndex: 4,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) queueAttachmentPicker("camera", ["images"]);
          if (buttonIndex === 1) queueAttachmentPicker("camera", ["videos"]);
          if (buttonIndex === 2) queueAttachmentPicker("library", ["images"]);
          if (buttonIndex === 3) queueAttachmentPicker("library", ["videos"]);
        }
      );
      return;
    }

    setShowAttachmentSheet(true);
  };

  const openAttachmentPicker = useCallback(async ({ source, mediaTypes }: PendingAttachmentAction) => {
    if (!currentUserId || !channelId) {
      Alert.alert("Chat not ready", "Please wait for this chat to finish loading before attaching media.");
      return;
    }

    try {
      console.log("Opening attachment picker:", source, mediaTypes);

      if (source === "camera") {
        const isCameraAvailable = await ImagePicker.getCameraPermissionsAsync();
        console.log("Camera permission status:", isCameraAvailable.status, isCameraAvailable.granted);
        if (!isCameraAvailable.canAskAgain && !isCameraAvailable.granted) {
          Alert.alert("Camera blocked", "Please enable camera access in Settings to take photos or videos.");
          return;
        }
      }

      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      console.log("Attachment permission status:", permission.status, permission.granted);

      if (!permission.granted) {
        Alert.alert("Permission needed", "Please allow access so you can attach photos or videos.");
        return;
      }

      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes,
        quality: 0.85,
        videoMaxDuration: 60,
        allowsEditing: false,
      };
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(pickerOptions)
          : await ImagePicker.launchImageLibraryAsync(pickerOptions);
      console.log("Attachment picker result canceled:", result.canceled);

      if (result.canceled || !result.assets?.[0]) return;

      setPendingAttachmentAsset(result.assets[0]);
      setAttachmentCaption(input.trim());
    } catch (error) {
      console.error("Error opening attachment picker:", error);
      Alert.alert("Unable to open picker", "Please try again after restarting the app.");
    }
  }, [channelId, currentUserId, input]);

  const cancelAttachmentPreview = () => {
    setPendingAttachmentAsset(null);
    setAttachmentCaption("");
  };

  const sendPendingAttachment = async () => {
    if (!pendingAttachmentAsset) return;

    const asset = pendingAttachmentAsset;
    const caption = attachmentCaption;

    setPendingAttachmentAsset(null);
    setAttachmentCaption("");
    setInput("");
    await uploadAndSendAttachment(asset, caption);
  };

  const loadForwardContacts = useCallback(async () => {
    if (!currentUserId) return;

    setLoadingForwardContacts(true);

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
        .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`),
      supabase.from("shifts").select("supervisor_id").eq("officer_id", currentUserId),
    ]);

    if (employeesError) console.error("Error fetching forward contacts:", employeesError);
    if (messagesError) console.error("Error fetching forward message contacts:", messagesError);
    if (shiftsError) console.error("Error fetching forward supervisors:", shiftsError);

    const contactsById = new Map<string, ChatChannel>();
    const addContact = (contact: ChatChannel) => {
      contactsById.set(contact.id, contact);
    };
    const profiles = (employeesData || []) as EmployeeProfile[];

    profiles.forEach((profile) => {
      addContact(buildChannelFromProfile(profile));
    });

    if (selectedChannel) addContact(selectedChannel);

    if (!contactsById.has(currentUserId)) {
      const avatarColor = getAvatarColor(currentUserId);
      addContact({
        id: currentUserId,
        name: "You",
        subtitle: "Forward to yourself",
        lastMessage: "",
        lastTime: "",
        online: false,
        avatarColor,
        avatarTextColor: getAvatarTextColor(avatarColor),
      });
    } else {
      const selfContact = contactsById.get(currentUserId);
      if (selfContact) {
        addContact({
          ...selfContact,
          name: `${selfContact.name} (You)`,
          subtitle: selfContact.subtitle || "Forward to yourself",
        });
      }
    }

    const messageParticipantIds = ((messagesData || []) as ChatMessageRecord[])
      .map((message) => (message.sender_id === currentUserId ? message.receiver_id : message.sender_id))
      .filter(Boolean);

    const supervisorIds = ((shiftsData || []) as { supervisor_id: string | null }[])
      .map((shift) => shift.supervisor_id)
      .filter((id): id is string => Boolean(id));

    const missingSupervisorIds = supervisorIds.filter((id) => !contactsById.has(id));
    const supervisorRows = await Promise.all(
      missingSupervisorIds.map(async (id) => {
        const { data, error } = await supabase.rpc("get_my_supervisor_name", {
          p_supervisor_id: id,
        });

        if (error) {
          console.error("Error fetching forward supervisor name:", error);
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
      if (profile) addContact(buildChannelFromProfile(profile));
    });

    const recentIds = Array.from(
      new Set([...(channelId ? [channelId] : []), ...messageParticipantIds, ...supervisorIds].filter(Boolean))
    );
    const missingRecentIds = recentIds.filter((id) => !contactsById.has(id));

    if (missingRecentIds.length > 0) {
      const { data: recentProfiles, error: recentProfilesError } = await supabase
        .from("employees")
        .select("id, first_name, last_name, role")
        .in("id", missingRecentIds);

      if (recentProfilesError) {
        console.error("Error fetching recent forward profiles:", recentProfilesError);
      } else {
        ((recentProfiles || []) as EmployeeProfile[]).forEach((profile) => {
          addContact(buildChannelFromProfile(profile));
        });
      }
    }

    recentIds.forEach((id) => {
      if (contactsById.has(id)) return;

      const avatarColor = getAvatarColor(id);
      addContact({
        id,
        name: "Unknown User",
        subtitle: "Conversation",
        lastMessage: "",
        lastTime: "",
        online: false,
        avatarColor,
        avatarTextColor: getAvatarTextColor(avatarColor),
      });
    });

    setForwardContacts(Array.from(contactsById.values()).sort((a, b) => a.name.localeCompare(b.name)));
    setLoadingForwardContacts(false);
  }, [channelId, currentUserId, selectedChannel]);

  const searchForwardContacts = useCallback(async (searchText: string) => {
    if (!currentUserId) return;

    const term = searchText.trim();
    if (!term) return;

    const { data, error } = await supabase
      .from("employees")
      .select("id, first_name, last_name, role")
      .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,role.ilike.%${term}%`)
      .order("first_name", { ascending: true })
      .limit(25);

    if (error) {
      console.error("Error searching forward contacts:", error);
      return;
    }

    const searchResults = ((data || []) as EmployeeProfile[]).map(buildChannelFromProfile);
    if (searchResults.length === 0) return;

    setForwardContacts((prev) => {
      const contactsById = new Map(prev.map((contact) => [contact.id, contact]));

      searchResults.forEach((contact) => {
        if (contact.id === currentUserId) {
          contactsById.set(contact.id, {
            ...contact,
            name: `${contact.name} (You)`,
            subtitle: contact.subtitle || "Forward to yourself",
          });
          return;
        }

        contactsById.set(contact.id, contact);
      });

      return Array.from(contactsById.values()).sort((a, b) => a.name.localeCompare(b.name));
    });
  }, [currentUserId]);

  const openForwardSheet = useCallback(
    (messageText: string) => {
      if (!currentUserId) return;

      setForwardingMessageText(messageText);
      setForwardSearch("");
      Haptics.selectionAsync().catch(() => undefined);
      loadForwardContacts();
    },
    [currentUserId, loadForwardContacts]
  );

  const closeForwardSheet = () => {
    setForwardingMessageText(null);
    setForwardSearch("");
  };

  const forwardMessageToContact = async (contact: ChatChannel) => {
    if (!currentUserId || !forwardingMessageText) return;

    const { error } = await supabase.from("messages").insert([
      {
        sender_id: currentUserId,
        receiver_id: contact.id,
        text: forwardingMessageText,
      },
    ]);

    if (error) {
      console.error("Error forwarding message:", error);
      Alert.alert("Forward failed", "Unable to forward this message. Please try again.");
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    closeForwardSheet();
    Alert.alert("Forwarded", `Message sent to ${contact.name}.`);
  };

  useEffect(() => {
    if (!forwardingMessageText) return;

    const trimmedSearch = forwardSearch.trim();
    if (!trimmedSearch) return;

    const timeout = setTimeout(() => {
      searchForwardContacts(trimmedSearch);
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [forwardSearch, forwardingMessageText, searchForwardContacts]);

  useEffect(() => {
    if (showAttachmentSheet || !pendingAttachmentAction) return;

    const action = pendingAttachmentAction;
    setPendingAttachmentAction(null);

    const interaction = InteractionManager.runAfterInteractions(() => {
      wait(350).then(() => openAttachmentPicker(action));
    });

    return () => {
      interaction.cancel();
    };
  }, [openAttachmentPicker, pendingAttachmentAction, showAttachmentSheet]);

  const toggleImportantMode = () => {
    setImportantMode((value) => {
      const nextValue = !value;

      if (nextValue) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
        Vibration.vibrate([0, 80, 40, 120]);
      } else {
        Haptics.selectionAsync().catch(() => undefined);
      }

      return nextValue;
    });
  };

  const avatarLabel = useMemo(() => getInitials(selectedChannel?.name ?? "Unknown User"), [selectedChannel?.name]);
  const filteredForwardContacts = useMemo(() => {
    const normalizedSearch = forwardSearch.trim().toLowerCase();
    const contacts = forwardContacts;

    if (!normalizedSearch) return contacts;

    return contacts.filter(
      (contact) =>
        contact.name.toLowerCase().includes(normalizedSearch) ||
        contact.subtitle.toLowerCase().includes(normalizedSearch)
    );
  }, [forwardContacts, forwardSearch]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.replace("/securityofficer/home")} hitSlop={10}>
          <ChevronLeft size={28} color="#FFFFFF" strokeWidth={2.4} />
        </Pressable>

        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      {selectedChannel ? (
        <View style={styles.profileBar}>
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{selectedChannel.name}</Text>
            <Text style={styles.profileStatus}>{selectedChannel.subtitle}</Text>
          </View>

          <View style={styles.profileAvatarWrap}>
            <Avatar channel={selectedChannel} size={52} />
          </View>
        </View>
      ) : null}

      <ScrollView
        ref={scrollViewRef}
        style={styles.chatArea}
        contentContainerStyle={styles.chatContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollToBottom(false)}
      >
        {!channelId ? (
          <Text style={styles.emptyText}>Select a conversation to start messaging.</Text>
        ) : loading ? (
          <Text style={styles.emptyText}>Loading messages...</Text>
        ) : messages.length === 0 ? (
          <Text style={styles.emptyText}>No messages yet.</Text>
        ) : (
          messages.map((msg) => {
            const { displayText, isImportant, attachment } = parseMessageText(msg.text);

            return (
              <ChatMessage
                key={msg.id}
                rawText={msg.text}
                text={displayText}
                time={formatTime(msg.created_at)}
                isSender={msg.sender_id === currentUserId}
                isImportant={isImportant}
                attachment={attachment}
                onOpenAttachment={setViewingAttachment}
                onForwardMessage={openForwardSheet}
                avatarColor={selectedChannel?.avatarColor ?? "#0F2C59"}
                avatarTextColor={selectedChannel?.avatarTextColor ?? "#FFFFFF"}
                avatarLabel={avatarLabel}
              />
            );
          })
        )}
      </ScrollView>

      <View style={styles.inputBar}>
        <Pressable
          style={[styles.iconButton, uploadingAttachment && styles.disabledButton]}
          onPress={openAttachmentMenu}
          disabled={uploadingAttachment || !currentUserId || !channelId}
          hitSlop={10}
        >
          <Paperclip size={24} color="#8A8F98" strokeWidth={2} />
        </Pressable>

        <Pressable
          style={[styles.iconButton, importantMode && styles.importantButton]}
          onPress={toggleImportantMode}
          hitSlop={10}
        >
          <Zap size={24} color={importantMode ? "#FFFFFF" : "#8A8F98"} strokeWidth={2.4} />
        </Pressable>

        <View style={styles.inputWrap}>
          <TextInput
            placeholder="Send a message"
            placeholderTextColor="#8A8F98"
            style={styles.input}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSendMessage}
            returnKeyType="send"
            editable={Boolean(currentUserId && channelId)}
          />
        </View>

        <Pressable style={styles.sendButton} onPress={handleSendMessage} hitSlop={10}>
          <Send size={18} color="#FFFFFF" strokeWidth={2.4} />
        </Pressable>
      </View>

      <Modal transparent visible={showAttachmentSheet} animationType="fade" onRequestClose={() => setShowAttachmentSheet(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowAttachmentSheet(false)} />
          <View style={styles.attachmentSheet}>
            <Text style={styles.attachmentSheetTitle}>Attach media</Text>

            <Pressable
              style={styles.attachmentAction}
              onPress={(event) => {
                event.stopPropagation();
                queueAttachmentPicker("camera", ["images"]);
              }}
            >
              <Text style={styles.attachmentActionText}>Take photo</Text>
            </Pressable>

            <Pressable
              style={styles.attachmentAction}
              onPress={(event) => {
                event.stopPropagation();
                queueAttachmentPicker("camera", ["videos"]);
              }}
            >
              <Text style={styles.attachmentActionText}>Record video</Text>
            </Pressable>

            <Pressable
              style={styles.attachmentAction}
              onPress={(event) => {
                event.stopPropagation();
                queueAttachmentPicker("library", ["images"]);
              }}
            >
              <Text style={styles.attachmentActionText}>Choose photo</Text>
            </Pressable>

            <Pressable
              style={styles.attachmentAction}
              onPress={(event) => {
                event.stopPropagation();
                queueAttachmentPicker("library", ["videos"]);
              }}
            >
              <Text style={styles.attachmentActionText}>Choose video</Text>
            </Pressable>

            <Pressable
              style={[styles.attachmentAction, styles.cancelAttachmentAction]}
              onPress={(event) => {
                event.stopPropagation();
                setShowAttachmentSheet(false);
              }}
            >
              <Text style={styles.cancelAttachmentText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={Boolean(pendingAttachmentAsset)}
        animationType="slide"
        onRequestClose={cancelAttachmentPreview}
      >
        <KeyboardAvoidingView
          style={styles.previewModalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={styles.previewHeader}>
            <Pressable style={styles.previewHeaderButton} onPress={cancelAttachmentPreview}>
              <Text style={styles.previewCancelText}>Cancel</Text>
            </Pressable>
            <Text style={styles.previewTitle}>Send media</Text>
            <Pressable
              style={[styles.previewHeaderButton, uploadingAttachment && styles.disabledButton]}
              onPress={sendPendingAttachment}
              disabled={uploadingAttachment}
            >
              <Text style={styles.previewSendText}>{uploadingAttachment ? "Sending" : "Send"}</Text>
            </Pressable>
          </View>

          <View style={styles.previewMediaArea}>
            {pendingAttachmentAsset?.type === "video" ? (
              <VideoPlayerBox uri={pendingAttachmentAsset.uri} style={styles.previewVideo} />
            ) : pendingAttachmentAsset ? (
              <Image source={{ uri: pendingAttachmentAsset.uri }} style={styles.previewImage} resizeMode="contain" />
            ) : null}
          </View>

          <View style={styles.previewCaptionWrap}>
            {importantMode && (
              <View style={styles.previewImportantPill}>
                <Zap size={14} color="#B91C1C" strokeWidth={2.6} />
                <Text style={styles.previewImportantText}>Important</Text>
              </View>
            )}
            <TextInput
              value={attachmentCaption}
              onChangeText={setAttachmentCaption}
              placeholder="Add a message"
              placeholderTextColor="#8A8F98"
              style={styles.previewCaptionInput}
              multiline
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={Boolean(viewingAttachment)}
        animationType="fade"
        onRequestClose={() => setViewingAttachment(null)}
        presentationStyle="fullScreen"
      >
        <View style={styles.viewerRoot}>
          <View style={styles.viewerHeader}>
            <Pressable style={styles.viewerCloseButton} onPress={() => setViewingAttachment(null)}>
              <Text style={styles.viewerCloseText}>Close</Text>
            </Pressable>
            <Text style={styles.viewerTitle} numberOfLines={1}>
              {viewingAttachment?.name ?? "Media"}
            </Text>
            <View style={styles.viewerHeaderSpacer} />
          </View>

          <View style={styles.viewerMediaArea}>
            {viewingAttachment?.type === "video" ? (
              <VideoPlayerBox uri={viewingAttachment.url} style={styles.viewerVideo} />
            ) : viewingAttachment ? (
              <Image source={{ uri: viewingAttachment.url }} style={styles.viewerImage} resizeMode="contain" />
            ) : null}
          </View>

          {viewingAttachment?.caption ? (
            <Text style={styles.viewerCaption}>{viewingAttachment.caption}</Text>
          ) : null}
        </View>
      </Modal>

      <Modal transparent visible={Boolean(forwardingMessageText)} animationType="fade" onRequestClose={closeForwardSheet}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeForwardSheet} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.forwardSheetKeyboard}
          >
            <View style={styles.forwardSheet}>
              <View style={styles.forwardHeader}>
                <Text style={styles.forwardTitle}>Forward to</Text>
                <Pressable onPress={closeForwardSheet} hitSlop={10}>
                  <Text style={styles.forwardCancelText}>Cancel</Text>
                </Pressable>
              </View>

              <View style={styles.forwardSearchWrap}>
                <Search size={20} color="#6B7280" />
                <TextInput
                  value={forwardSearch}
                  onChangeText={setForwardSearch}
                  placeholder="Search people"
                  placeholderTextColor="#8A8F98"
                  style={styles.forwardSearchInput}
                />
              </View>

              <ScrollView style={styles.forwardList} keyboardShouldPersistTaps="handled">
                {loadingForwardContacts ? (
                  <ActivityIndicator color="#0F2C59" style={styles.forwardLoader} />
                ) : filteredForwardContacts.length > 0 ? (
                  filteredForwardContacts.map((contact) => (
                    <Pressable
                      key={contact.id}
                      style={styles.forwardContactRow}
                      onPress={() => forwardMessageToContact(contact)}
                    >
                      <Avatar channel={contact} size={44} />
                      <View style={styles.forwardContactText}>
                        <Text style={styles.forwardContactName} numberOfLines={1}>
                          {contact.name}
                        </Text>
                        <Text style={styles.forwardContactRole} numberOfLines={1}>
                          {contact.subtitle}
                        </Text>
                      </View>
                    </Pressable>
                  ))
                ) : (
                  <Text style={styles.forwardEmptyText}>No people found.</Text>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
    marginRight: 52,
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "700",
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
  profileBar: {
    minHeight: 80,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#DADDE3",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  profileText: {
    alignItems: "center",
    paddingHorizontal: 72,
  },
  profileName: {
    color: "#111827",
    fontSize: 21,
    fontWeight: "800",
    textAlign: "center",
  },
  profileStatus: {
    marginTop: 2,
    color: "#7A7F87",
    fontSize: 13,
    textAlign: "center",
  },
  profileAvatarWrap: {
    position: "absolute",
    right: 18,
    width: 52,
    height: 52,
  },
  chatArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  chatContent: {
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 28,
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 14,
    paddingVertical: 16,
    textAlign: "center",
  },
  messageRow: {
    width: "100%",
    flexDirection: "row",
    marginBottom: 16,
  },
  messageRowSender: {
    justifyContent: "flex-end",
  },
  messageRowReceiver: {
    justifyContent: "flex-start",
  },
  messageAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
    alignSelf: "flex-end",
    alignItems: "center",
    justifyContent: "center",
  },
  messageAvatarText: {
    fontSize: 12,
    fontWeight: "800",
  },
  messageBubble: {
    maxWidth: "75%",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  senderBubble: {
    backgroundColor: "#E9E9EB",
    borderBottomRightRadius: 0,
  },
  receiverBubble: {
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#DADDE3",
    borderBottomLeftRadius: 0,
  },
  importantBubble: {
    borderWidth: 1,
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
  },
  importantTag: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
  },
  importantTagText: {
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "800",
  },
  attachmentWrap: {
    minWidth: 180,
  },
  attachmentImage: {
    width: 220,
    height: 160,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
  attachmentName: {
    color: "#4B5563",
    fontSize: 12,
    marginTop: 6,
  },
  attachmentCaption: {
    color: "#111827",
    fontSize: 16,
    lineHeight: 22,
    marginTop: 8,
  },
  videoAttachment: {
    width: 220,
    height: 130,
    borderRadius: 8,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  videoAttachmentIcon: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
  },
  videoAttachmentText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
  },
  messageText: {
    color: "#111827",
    fontSize: 18,
    lineHeight: 24,
  },
  messageMeta: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  messageMetaSender: {
    justifyContent: "flex-end",
  },
  messageMetaReceiver: {
    justifyContent: "flex-start",
  },
  readReceipt: {
    color: "#1F7AFF",
    fontSize: 12,
    marginRight: 4,
  },
  messageTime: {
    color: "#7A7F87",
    fontSize: 13,
  },
  inputBar: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#DADDE3",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconButton: {
    width: 28,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  importantButton: {
    width: 36,
    backgroundColor: "#DC2626",
  },
  disabledButton: {
    opacity: 0.45,
  },
  inputWrap: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  input: {
    color: "#111827",
    fontSize: 16,
    paddingVertical: Platform.OS === "ios" ? 9 : 5,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#8A8F98",
    alignItems: "center",
    justifyContent: "center",
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  attachmentSheet: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 30,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  attachmentSheetTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
  attachmentAction: {
    minHeight: 48,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  attachmentActionText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelAttachmentAction: {
    borderBottomWidth: 0,
    marginTop: 8,
  },
  cancelAttachmentText: {
    color: "#DC2626",
    fontSize: 16,
    fontWeight: "700",
  },
  previewModalRoot: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  previewHeader: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  previewHeaderButton: {
    width: 72,
    minHeight: 40,
    justifyContent: "center",
  },
  previewCancelText: {
    color: "#6B7280",
    fontSize: 16,
    fontWeight: "700",
  },
  previewTitle: {
    flex: 1,
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  previewSendText: {
    color: "#0F2C59",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "right",
  },
  previewMediaArea: {
    flex: 1,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  previewVideo: {
    width: "100%",
    height: "100%",
  },
  previewCaptionWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  previewImportantPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  previewImportantText: {
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "800",
  },
  previewCaptionInput: {
    minHeight: 44,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    color: "#111827",
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  viewerRoot: {
    flex: 1,
    backgroundColor: "#000000",
  },
  viewerHeader: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#000000",
  },
  viewerCloseButton: {
    width: 72,
    minHeight: 40,
    justifyContent: "center",
  },
  viewerCloseText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  viewerTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  viewerHeaderSpacer: {
    width: 72,
  },
  viewerMediaArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  viewerVideo: {
    width: "100%",
    height: "100%",
  },
  viewerImage: {
    width: "100%",
    height: "100%",
  },
  viewerCaption: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
  },
  forwardSheetKeyboard: {
    width: "100%",
    justifyContent: "flex-end",
  },
  forwardSheet: {
    maxHeight: "72%",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 30,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  forwardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  forwardTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800",
  },
  forwardCancelText: {
    color: "#DC2626",
    fontSize: 16,
    fontWeight: "700",
  },
  forwardSearchWrap: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  forwardSearchInput: {
    flex: 1,
    color: "#111827",
    fontSize: 16,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
  },
  forwardList: {
    maxHeight: 420,
  },
  forwardLoader: {
    paddingVertical: 28,
  },
  forwardContactRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  forwardContactText: {
    flex: 1,
    marginLeft: 12,
  },
  forwardContactName: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
  },
  forwardContactRole: {
    color: "#7A7F87",
    fontSize: 13,
    marginTop: 2,
  },
  forwardEmptyText: {
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 28,
  },
});
