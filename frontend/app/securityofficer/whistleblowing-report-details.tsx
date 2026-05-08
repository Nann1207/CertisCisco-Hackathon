import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, FileText, Send, X } from "lucide-react-native";
import * as FileSystem from "expo-file-system/legacy";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";
import { useVideoPlayer, VideoView } from "expo-video";
import * as WebBrowser from "expo-web-browser";

type ReportStatus = "submitted" | "in_review" | "need_info" | "resolved" | "closed";

type ReportRow = {
  id: string;
  created_at: string | null;
  report_code: string | null;
  status: ReportStatus | null;
  incident_date: string | null;
  category: string | null;
  category_other: string | null;
  department_of_people_involved: string | null;
  details_of_concern: string | null;
  evidence_status: string | null;
};

type MessageRow = {
  id: string;
  created_at: string | null;
  sender_role: "reporter" | "admin" | string;
  message: string | null;
};

type AttachmentRow = {
  id: string;
  created_at: string | null;
  file_path: string;
  file_name: string;
  content_type: string | null;
  file_size: number | null;
  signed_url: string;
  cached_uri: string | null;
};

const resolveAttachmentKind = (contentType: string | null, fileName: string) => {
  const type = (contentType ?? "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  const lower = fileName.toLowerCase();
  if (/\.(png|jpg|jpeg|gif|webp|heic)$/.test(lower)) return "image";
  if (/\.(mp4|mov|m4v|webm)$/.test(lower)) return "video";
  return "file";
};

const normalizeStoragePath = (rawPath: string) => {
  const trimmed = rawPath.trim();
  if (!trimmed) return trimmed;

  let path = trimmed.replace(/^\/+/, "");
  const bucketPrefix = "whistleblowing-supporting-documents/";
  if (path.startsWith(bucketPrefix)) {
    path = path.slice(bucketPrefix.length);
  }
  return path;
};

const buildAttachmentCacheUri = (attachmentId: string, fileName: string) => {
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) return null;

  const safeName = fileName.replace(/[^\w.\- ()\[\]]+/g, "_").trim() || "attachment";
  return `${cacheRoot}whistleblowing-attachment-${attachmentId}-${safeName}`;
};

const toSignedRequestUrl = (signedUrl: string) =>
  signedUrl.replace(/\[/g, "%5B").replace(/\]/g, "%5D").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/ /g, "%20");

const cacheImageAttachment = async (attachmentId: string, fileName: string, signedUrl: string) => {
  const cacheUri = buildAttachmentCacheUri(attachmentId, fileName);
  if (!cacheUri) return null;

  try {
    const cachedInfo = await FileSystem.getInfoAsync(cacheUri);
    if (cachedInfo.exists) {
      return cachedInfo.uri;
    }

    const downloadResult: any = await FileSystem.downloadAsync(toSignedRequestUrl(signedUrl), cacheUri);
    if (typeof downloadResult?.status === "number" && downloadResult.status !== 200) {
      return null;
    }

    const info = await FileSystem.getInfoAsync(cacheUri);
    if (!info.exists || (typeof (info as any).size === "number" && (info as any).size <= 0)) {
      return null;
    }

    return downloadResult.uri;
  } catch {
    return null;
  }
};

const formatStatusLabel = (status: ReportStatus | null) => {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "in_review":
      return "In Review";
    case "need_info":
      return "Need More Info";
    case "resolved":
      return "Resolved";
    case "closed":
      return "Closed";
    default:
      return "Submitted";
  }
};

export default function WhistleblowingReportDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const reportId = typeof id === "string" ? id : "";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [report, setReport] = useState<ReportRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState<AttachmentRow | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canLoad = useMemo(() => Boolean(reportId), [reportId]);
  const trimmedMessage = useMemo(() => newMessage.trim(), [newMessage]);

  const formatDateTime = useCallback((raw: string | null) => {
    if (!raw) return "";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString();
  }, []);

  const getAttachmentKind = useCallback(resolveAttachmentKind, []);

  const VideoPlayerBox = ({ uri }: { uri: string }) => {
    const player = useVideoPlayer(uri, (videoPlayer) => {
      videoPlayer.loop = false;
    });
    return <VideoView player={player} style={styles.videoPreview} nativeControls contentFit="contain" />;
  };

  const load = useCallback(async () => {
    if (!canLoad) return;

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id ?? null;
    if (!userId) {
      Alert.alert("Load failed", sessionError?.message ?? "Unable to validate your session.");
      return;
    }

    const { data: reportRow, error: reportError } = await supabase
      .from("whistleblowing_reports")
      .select(
        "id, created_at, report_code, status, incident_date, category, category_other, department_of_people_involved, details_of_concern, evidence_status"
      )
      .eq("id", reportId)
      .maybeSingle();

    if (reportError) {
      Alert.alert("Load failed", reportError.message);
      return;
    }

    setReport((reportRow as ReportRow | null) ?? null);

    const { data: messageRows, error: messageError } = await supabase
      .from("whistleblowing_report_messages")
      .select("id, created_at, sender_role, message")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true });

    if (messageError) {
      Alert.alert("Load failed", messageError.message);
      return;
    }

    setMessages(((messageRows as MessageRow[] | null) ?? []).filter(Boolean));

    const { data: attachmentRows, error: attachmentError } = await supabase
      .from("whistleblowing_report_documents")
      .select("id, created_at, file_path, file_name, content_type, file_size")
      .eq("report_id", reportId)
      .order("created_at", { ascending: false });

    if (attachmentError) {
      Alert.alert("Load failed", attachmentError.message);
      setAttachments([]);
      return;
    }

    const rawAttachments =
      ((attachmentRows as Omit<AttachmentRow, "signed_url">[] | null) ?? []).filter(
        (row): row is any => Boolean(row?.file_path && row?.file_name)
      );

    const signedResults = await Promise.all(
      rawAttachments.map(async (row) => {
        const { data, error } = await supabase.storage
          .from("whistleblowing-supporting-documents")
          .createSignedUrl(normalizeStoragePath(row.file_path), 60 * 60);
        if (error || !data?.signedUrl) return null;
        return { ...row, signed_url: data.signedUrl, cached_uri: null } as AttachmentRow;
      })
    );

    const hydratedAttachments = await Promise.all(
      signedResults.filter((row): row is AttachmentRow => Boolean(row)).map(async (row) => {
        if (resolveAttachmentKind(row.content_type, row.file_name) !== "image") {
          return row;
        }

        const cached_uri = await cacheImageAttachment(row.id, row.file_name, row.signed_url);
        return { ...row, cached_uri };
      })
    );

    setAttachments(hydratedAttachments as AttachmentRow[]);
  }, [canLoad, reportId]);

  useEffect(() => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }

    setPreviewError(null);
    setPreviewLoading(false);

    if (previewing && getAttachmentKind(previewing.content_type, previewing.file_name) === "image") {
      previewTimeoutRef.current = setTimeout(() => {
        setPreviewLoading(false);
        setPreviewError("Preview is taking too long to load. Tap Open to view it externally.");
      }, 8000);
    }

    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
        previewTimeoutRef.current = null;
      }
    };
  }, [previewing]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!canLoad) {
        setLoading(false);
        return;
      }
      setLoading(true);
      await load();
      if (alive) setLoading(false);
    };
    void run();
    return () => {
      alive = false;
    };
  }, [canLoad, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const sendMessage = async () => {
    if (!trimmedMessage) return;
    if (!canLoad) return;

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id ?? null;
    if (!userId) {
      Alert.alert("Send failed", sessionError?.message ?? "Unable to validate your session.");
      return;
    }

    setSending(true);

    const { error } = await supabase.from("whistleblowing_report_messages").insert({
      report_id: reportId,
      sender_id: userId,
      sender_role: "reporter",
      message: trimmedMessage,
    });

    if (error) {
      setSending(false);
      Alert.alert("Send failed", error.message);
      return;
    }

    setNewMessage("");
    await load();
    setSending(false);
  };

  if (!canLoad) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <ChevronLeft size={22} color="#0F172A" />
          </Pressable>
          <Text style={styles.headerTitle}>Report Details</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.center}>
          <Text style={styles.bodyText}>Missing report id.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <ChevronLeft size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>Report Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Report</Text>
              <Text style={styles.meta}>Report ID: {report?.report_code ?? report?.id ?? "-"}</Text>
              <Text style={styles.meta}>Status: {formatStatusLabel(report?.status ?? "submitted")}</Text>
              <Text style={styles.meta}>Incident Date: {report?.incident_date ?? "-"}</Text>
              <Text style={styles.meta}>
                Category: {report?.category === "Other" ? `Other (${report?.category_other ?? "-"})` : report?.category ?? "-"}
              </Text>
              <Text style={styles.meta}>Department: {report?.department_of_people_involved ?? "-"}</Text>
              <Text style={styles.meta}>Evidence: {report?.evidence_status ?? "-"}</Text>
              <Text style={styles.meta}>Submitted At: {formatDateTime(report?.created_at ?? null) || "-"}</Text>
              <Text style={styles.metaBold}>Details</Text>
              <Text style={styles.bodyText}>{report?.details_of_concern ?? "-"}</Text>
            </View>

            <Text style={styles.sectionTitle}>Attachments</Text>
            <View style={styles.card}>
              {attachments.length === 0 ? (
                <Text style={styles.bodyText}>No attachments.</Text>
              ) : (
                attachments.map((att) => {
                  const kind = getAttachmentKind(att.content_type, att.file_name);
                  return (
                    <Pressable key={att.id} style={styles.attachmentRow} onPress={() => setPreviewing(att)}>
                      <View style={styles.attachmentIcon}>
                        <FileText size={18} color="#088EAB" />
                      </View>
                      <View style={styles.attachmentTextCol}>
                        <Text style={styles.attachmentName} numberOfLines={1}>
                          {att.file_name}
                        </Text>
                        <Text style={styles.attachmentMeta} numberOfLines={1}>
                          {kind.toUpperCase()} • {formatDateTime(att.created_at) || "-"}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>

            <Text style={styles.sectionTitle}>Follow Up</Text>
            <View style={styles.card}>
              {messages.length === 0 ? (
                <Text style={styles.bodyText}>No messages yet.</Text>
              ) : (
                messages.map((msg) => (
                  <View key={msg.id} style={styles.msgRow}>
                    <Text style={styles.msgRole}>{msg.sender_role === "admin" ? "Admin" : "You"}</Text>
                    <Text style={styles.msgText}>{msg.message ?? ""}</Text>
                    <Text style={styles.msgTime}>{msg.created_at ?? ""}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.composer}>
              <TextInput
                value={newMessage}
                onChangeText={setNewMessage}
                placeholder="Type a message..."
                placeholderTextColor="#94A3B8"
                style={styles.composerInput}
                editable={!sending}
              />
              <Pressable
                onPress={() => void sendMessage()}
                disabled={sending || !trimmedMessage}
                style={[styles.sendBtn, (sending || !trimmedMessage) && styles.sendBtnDisabled]}
              >
                {sending ? <ActivityIndicator color="#FFFFFF" /> : <Send size={18} color="#FFFFFF" />}
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={Boolean(previewing)} transparent animationType="fade" onRequestClose={() => setPreviewing(null)}>
        <View style={styles.previewOverlay}>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>Attachment</Text>
              <View style={styles.previewHeaderRight}>
                {previewing ? (
                  <Pressable onPress={() => void WebBrowser.openBrowserAsync(toSignedRequestUrl(previewing.signed_url))} hitSlop={10}>
                    <Text style={styles.openText}>Open</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => setPreviewing(null)} hitSlop={10}>
                  <X size={20} color="#0F172A" />
                </Pressable>
              </View>
            </View>

            {previewing ? (
              getAttachmentKind(previewing.content_type, previewing.file_name) === "image" ? (
                <View style={styles.previewMediaWrap}>
                  <Image
                    source={{ uri: previewing.cached_uri ?? toSignedRequestUrl(previewing.signed_url) }}
                    style={styles.imagePreview}
                    resizeMode="contain"
                    onLoadStart={() => {
                      setPreviewError(null);
                      setPreviewLoading(true);
                    }}
                    onLoad={() => {
                      if (previewTimeoutRef.current) {
                        clearTimeout(previewTimeoutRef.current);
                        previewTimeoutRef.current = null;
                      }
                      setPreviewLoading(false);
                    }}
                    onLoadEnd={() => {
                      if (previewTimeoutRef.current) {
                        clearTimeout(previewTimeoutRef.current);
                        previewTimeoutRef.current = null;
                      }
                      setPreviewLoading(false);
                    }}
                    onError={() => {
                      if (previewTimeoutRef.current) {
                        clearTimeout(previewTimeoutRef.current);
                        previewTimeoutRef.current = null;
                      }
                      setPreviewLoading(false);
                      setPreviewError("Unable to load this image preview. Tap Open to view it externally.");
                    }}
                  />
                  {previewLoading ? (
                    <View style={styles.previewLoadingOverlay}>
                      <ActivityIndicator color="#FFFFFF" />
                    </View>
                  ) : null}
                  {previewError ? <Text style={styles.previewError}>{previewError}</Text> : null}
                </View>
              ) : getAttachmentKind(previewing.content_type, previewing.file_name) === "video" ? (
                <View style={styles.previewMediaWrap}>
                  <VideoPlayerBox uri={toSignedRequestUrl(previewing.signed_url)} />
                </View>
              ) : (
                <View style={styles.filePreview}>
                  <FileText size={22} color="#088EAB" />
                  <Text style={styles.filePreviewName}>{previewing.file_name}</Text>
                  <Text style={styles.filePreviewHint}>Preview not available for this file type.</Text>
                </View>
              )
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backBtn: { width: 40, height: 40, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  headerSpacer: { width: 40, height: 40 },
  content: { padding: 16, paddingBottom: 28 },
  center: { padding: 24, alignItems: "center" },
  bodyText: { color: "#334155", lineHeight: 20 },
  sectionTitle: { marginTop: 16, marginBottom: 8, color: "#0F172A", fontWeight: "900", fontSize: 16 },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    padding: 14,
  },
  cardTitle: { fontSize: 15, fontWeight: "900", color: "#0F172A", marginBottom: 10 },
  meta: { color: "#334155", marginBottom: 6, lineHeight: 20 },
  metaBold: { marginTop: 6, fontWeight: "900", color: "#0F172A" },
  msgRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  msgRole: { fontWeight: "900", color: "#0F172A" },
  msgText: { marginTop: 4, color: "#334155", lineHeight: 20 },
  msgTime: { marginTop: 6, color: "#94A3B8", fontSize: 12 },
  composer: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  composerInput: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0F172A",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#0AAFD0",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.6 },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
  },
  attachmentIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#E0F2F1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  attachmentTextCol: { flex: 1 },
  attachmentName: { fontSize: 14, color: "#0F172A", fontWeight: "600" },
  attachmentMeta: { fontSize: 12, color: "#64748B", marginTop: 2 },
  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    padding: 16,
  },
  previewCard: { backgroundColor: "#FFFFFF", borderRadius: 18, overflow: "hidden" },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  previewTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  previewHeaderRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  openText: { fontSize: 15, fontWeight: "700", color: "#088EAB" },
  previewMediaWrap: { width: "100%", aspectRatio: 1, backgroundColor: "#0F172A" },
  imagePreview: { width: "100%", height: "100%" },
  videoPreview: { width: "100%", height: "100%" },
  previewLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.25)",
  },
  previewError: { padding: 12, color: "#FFFFFF", fontSize: 13 },
  filePreview: { padding: 24, alignItems: "center", gap: 10 },
  filePreviewName: { fontSize: 14, fontWeight: "600", color: "#0F172A" },
  filePreviewHint: { fontSize: 12, color: "#64748B", textAlign: "center" },
});
