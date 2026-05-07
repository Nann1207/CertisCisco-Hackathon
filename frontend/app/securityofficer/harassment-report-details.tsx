import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Send } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";

type ReportStatus = "submitted" | "in_review" | "need_info" | "resolved" | "closed";

type ReportRow = {
  id: string;
  created_at: string | null;
  report_code: string | null;
  status: ReportStatus | null;
  incident_date: string | null;
  harassment_type: string | null;
  harassment_type_other: string | null;
  persons_involved: string | null;
  incident_description: string | null;
  witness_status: string | null;
  witness_name: string | null;
};

type MessageRow = {
  id: string;
  created_at: string | null;
  sender_role: "reporter" | "admin" | string;
  message: string | null;
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

export default function HarassmentReportDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const reportId = typeof id === "string" ? id : "";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [report, setReport] = useState<ReportRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);

  const canLoad = useMemo(() => Boolean(reportId), [reportId]);
  const trimmedMessage = useMemo(() => newMessage.trim(), [newMessage]);

  const load = useCallback(async () => {
    if (!canLoad) return;

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id ?? null;
    if (!userId) {
      Alert.alert("Load failed", sessionError?.message ?? "Unable to validate your session.");
      return;
    }

    const { data: reportRow, error: reportError } = await supabase
      .from("harassment_reports")
      .select(
        "id, created_at, report_code, status, incident_date, harassment_type, harassment_type_other, persons_involved, incident_description, witness_status, witness_name"
      )
      .eq("id", reportId)
      .maybeSingle();

    if (reportError) {
      Alert.alert("Load failed", reportError.message);
      return;
    }

    setReport((reportRow as ReportRow | null) ?? null);

    const { data: messageRows, error: messageError } = await supabase
      .from("harassment_report_messages")
      .select("id, created_at, sender_role, message")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true });

    if (messageError) {
      Alert.alert("Load failed", messageError.message);
      return;
    }

    setMessages(((messageRows as MessageRow[] | null) ?? []).filter(Boolean));
  }, [canLoad, reportId]);

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

    const { error } = await supabase.from("harassment_report_messages").insert({
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
              <Text style={styles.meta}>
                Report ID: {report?.report_code ?? report?.id ?? "-"}
              </Text>
              <Text style={styles.meta}>Status: {formatStatusLabel(report?.status ?? "submitted")}</Text>
              <Text style={styles.meta}>Incident Date: {report?.incident_date ?? "-"}</Text>
              <Text style={styles.meta}>
                Type:{" "}
                {report?.harassment_type === "Other"
                  ? `Other (${report?.harassment_type_other ?? "-"})`
                  : report?.harassment_type ?? "-"}
              </Text>
              <Text style={styles.meta}>Persons Involved: {report?.persons_involved ?? "-"}</Text>
              <Text style={styles.meta}>Witnesses: {report?.witness_status ?? "-"}</Text>
              {report?.witness_name ? <Text style={styles.meta}>Witness Name: {report.witness_name}</Text> : null}
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
});

