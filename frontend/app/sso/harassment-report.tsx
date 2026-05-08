import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, FileText, Image as ImageIcon, Video as VideoIcon, X } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useVideoPlayer, VideoView } from "expo-video";
import DateTimePicker from "@react-native-community/datetimepicker";

type WitnessStatus = "yes" | "no" | "unsure";

type PickedDocument = {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  kind: "file" | "photo" | "video";
};

const HARASSMENT_TYPES = [
  "Verbal",
  "Physical",
  "Sexual",
  "Discriminatory",
  "Cyberbullying",
  "Other",
] as const;

const toIsoDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatDdMmYyyy = (date: Date) => {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
};

export default function HarassmentReportScreen() {
  const router = useRouter();

  const [incidentDate, setIncidentDate] = useState<Date>(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [harassmentType, setHarassmentType] = useState<(typeof HARASSMENT_TYPES)[number] | "">("");
  const [harassmentTypeOther, setHarassmentTypeOther] = useState("");
  const [personsInvolved, setPersonsInvolved] = useState("");
  const [description, setDescription] = useState("");
  const [witnessStatus, setWitnessStatus] = useState<WitnessStatus>("no");
  const [witnessName, setWitnessName] = useState("");
  const [documents, setDocuments] = useState<PickedDocument[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState<PickedDocument | null>(null);

  const normalizedWitnessName = useMemo(() => witnessName.trim(), [witnessName]);
  const normalizedHarassmentTypeOther = useMemo(() => harassmentTypeOther.trim(), [harassmentTypeOther]);

  const addSupportingFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: "*/*",
    });

    const assets: any[] =
      (result as any)?.assets ??
      ((result as any)?.type === "success"
        ? [
            {
              uri: (result as any).uri,
              name: (result as any).name,
              mimeType: (result as any).mimeType,
              size: (result as any).size,
            },
          ]
        : []);

    if ((result as any)?.canceled || assets.length === 0) return;

    const nextDocs: PickedDocument[] = assets
      .map((asset) => ({
        uri: String(asset.uri ?? ""),
        name: String(asset.name ?? "document"),
        mimeType: asset.mimeType ? String(asset.mimeType) : null,
        size: typeof asset.size === "number" ? asset.size : null,
        kind: "file" as const,
      }))
      .filter((doc) => Boolean(doc.uri));

    setDocuments((prev) => [...prev, ...nextDocs]);
  };

  const addSupportingMedia = async (kind: "photo" | "video") => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow photo library access to upload supporting media.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === "photo" ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
      quality: 1,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return;

    const nextDocs: PickedDocument[] = result.assets
      .map((asset) => ({
        uri: String(asset.uri ?? ""),
        name:
          (asset as any).fileName ??
          `${kind}-${new Date().toISOString().replace(/[:.]/g, "-")}${kind === "photo" ? ".jpg" : ".mp4"}`,
        mimeType: (asset as any).mimeType ? String((asset as any).mimeType) : null,
        size: typeof (asset as any).fileSize === "number" ? (asset as any).fileSize : null,
        kind,
      }))
      .filter((doc) => Boolean(doc.uri));

    setDocuments((prev) => [...prev, ...nextDocs]);
  };

  const VideoPlayerBox = ({ uri }: { uri: string }) => {
    const player = useVideoPlayer(uri, (videoPlayer) => {
      videoPlayer.loop = false;
    });
    return <VideoView player={player} style={styles.videoPreview} nativeControls contentFit="contain" />;
  };

  const submit = async () => {
    const isoIncidentDate = toIsoDate(incidentDate);
    if (!harassmentType) {
      Alert.alert("Submit failed", "Please select a harassment type.");
      return;
    }
    if (harassmentType === "Other" && !normalizedHarassmentTypeOther) {
      Alert.alert("Submit failed", "Please specify the harassment type for 'Other'.");
      return;
    }
    if (!personsInvolved.trim()) {
      Alert.alert("Submit failed", "Please enter the person(s) involved.");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Submit failed", "Please enter a description of the incident.");
      return;
    }
    if (witnessStatus === "yes" && !normalizedWitnessName) {
      Alert.alert("Submit failed", "Please enter the witness name.");
      return;
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const reporterId = sessionData.session?.user.id ?? null;
    if (!reporterId) {
      Alert.alert("Submit failed", sessionError?.message ?? "Unable to validate your session.");
      return;
    }

    setSubmitting(true);

    const payload = {
      reporter_id: reporterId,
      reporter_role: "sso",
      incident_date: isoIncidentDate,
      harassment_type: harassmentType,
      harassment_type_other: harassmentType === "Other" ? normalizedHarassmentTypeOther : null,
      persons_involved: personsInvolved.trim(),
      incident_description: description.trim(),
      witness_status: witnessStatus,
      witness_name: witnessStatus === "yes" ? normalizedWitnessName : null,
    };

    const { data: insertedRow, error } = await supabase
      .from("harassment_reports")
      .insert(payload)
      .select("id, report_code")
      .single();

    if (error || !insertedRow?.id) {
      setSubmitting(false);
      Alert.alert("Submit failed", error?.message ?? "Unable to save report.");
      return;
    }

    const reportId = String(insertedRow.id);
    const reportCode = insertedRow.report_code ? String(insertedRow.report_code) : null;

    if (documents.length > 0) {
      for (const doc of documents) {
        const fileName = doc.name || "document";
        const safeFileName = fileName.replace(/[^\w.\- ()[\]]+/g, "_");
        const uniquePrefix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const storagePath = `${reporterId}/${reportId}/${uniquePrefix}-${safeFileName}`;

        const response = await fetch(doc.uri);
        const blob = await response.blob();

        const { error: uploadError } = await supabase.storage
          .from("harassment-supporting-documents")
          .upload(storagePath, blob as any, {
            contentType: doc.mimeType ?? "application/octet-stream",
            upsert: false,
          });

        if (uploadError) {
          setSubmitting(false);
          Alert.alert("Upload failed", uploadError.message);
          return;
        }

        const { error: docRowError } = await supabase.from("harassment_report_documents").insert({
          report_id: reportId,
          uploader_id: reporterId,
          file_path: storagePath,
          file_name: fileName,
          content_type: doc.mimeType,
          file_size: doc.size,
        });

        if (docRowError) {
          setSubmitting(false);
          Alert.alert("Submit failed", docRowError.message);
          return;
        }
      }
    }

    setSubmitting(false);
    Alert.alert(
      "Submitted",
      reportCode ? `Your harassment report has been submitted.\nReport ID: ${reportCode}` : "Your harassment report has been submitted."
    );
    router.back();
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <ChevronLeft size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>Harassment Report</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>DATE OF INCIDENT</Text>
        <Pressable onPress={() => setDatePickerOpen(true)} style={styles.dateInput}>
          <Text style={styles.dateText}>{formatDdMmYyyy(incidentDate)}</Text>
        </Pressable>

        <Text style={styles.label}>TYPE OF HARASSMENT</Text>
        <View style={styles.selectWrap}>
          {HARASSMENT_TYPES.map((type) => {
            const selected = harassmentType === type;
            return (
              <Pressable
                key={type}
                onPress={() => setHarassmentType(type)}
                style={[styles.selectPill, selected && styles.selectPillActive]}
              >
                <Text style={[styles.selectText, selected && styles.selectTextActive]}>{type}</Text>
              </Pressable>
            );
          })}
        </View>

        {harassmentType === "Other" ? (
          <>
            <Text style={styles.label}>PLEASE SPECIFY</Text>
            <TextInput
              value={harassmentTypeOther}
              onChangeText={setHarassmentTypeOther}
              placeholder="Enter type of harassment"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />
          </>
        ) : null}

        <Text style={styles.label}>PERSON(S) INVOLVED</Text>
        <TextInput
          value={personsInvolved}
          onChangeText={setPersonsInvolved}
          placeholder="Name or role of the individual(s)"
          placeholderTextColor="#94A3B8"
          style={styles.input}
        />

        <Text style={styles.label}>DESCRIPTION OF INCIDENT</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Describe what happened in as much detail as you feel comfortable sharing..."
          placeholderTextColor="#94A3B8"
          style={[styles.input, styles.textarea]}
          multiline
        />

        <Text style={styles.label}>WERE THERE WITNESSES?</Text>
        <View style={styles.radioRow}>
          {([
            { id: "yes", label: "Yes" },
            { id: "no", label: "No" },
            { id: "unsure", label: "Unsure" },
          ] as const).map((option) => {
            const selected = witnessStatus === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => setWitnessStatus(option.id)}
                style={styles.radioItem}
              >
                <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                  {selected ? <View style={styles.radioInner} /> : null}
                </View>
                <Text style={styles.radioLabel}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {witnessStatus === "yes" ? (
          <>
            <Text style={styles.label}>WITNESS NAME</Text>
            <TextInput
              value={witnessName}
              onChangeText={setWitnessName}
              placeholder="Enter witness name"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />
          </>
        ) : null}

        <Text style={styles.label}>SUPPORTING DOCUMENTS (OPTIONAL)</Text>
        <View style={styles.uploadRow}>
          <Pressable
            disabled={submitting}
            onPress={() => void addSupportingFile()}
            style={[styles.uploadBtn, submitting && styles.submitBtnDisabled]}
          >
            <FileText size={16} color="#088EAB" />
            <Text style={styles.uploadBtnText}>File</Text>
          </Pressable>
          <Pressable
            disabled={submitting}
            onPress={() => void addSupportingMedia("photo")}
            style={[styles.uploadBtn, submitting && styles.submitBtnDisabled]}
          >
            <ImageIcon size={16} color="#088EAB" />
            <Text style={styles.uploadBtnText}>Photo</Text>
          </Pressable>
          <Pressable
            disabled={submitting}
            onPress={() => void addSupportingMedia("video")}
            style={[styles.uploadBtn, submitting && styles.submitBtnDisabled]}
          >
            <VideoIcon size={16} color="#088EAB" />
            <Text style={styles.uploadBtnText}>Video</Text>
          </Pressable>
        </View>

        {documents.length > 0 ? (
          <View style={styles.docList}>
            {documents.map((doc, idx) => (
              <View key={`${doc.uri}-${idx}`} style={styles.docRow}>
                <Pressable
                  style={styles.docLeft}
                  disabled={submitting}
                  onPress={() => setPreviewing(doc)}
                >
                  {doc.kind === "photo" ? (
                    <Image source={{ uri: doc.uri }} style={styles.thumb} />
                  ) : (
                    <View style={styles.thumbPlaceholder}>
                      <Text style={styles.thumbPlaceholderText}>{doc.kind.toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.docTextCol}>
                    <Text style={styles.docName} numberOfLines={1}>
                      {doc.name}
                    </Text>
                    <Text style={styles.docMeta} numberOfLines={1}>
                      {doc.kind}
                    </Text>
                  </View>
                </Pressable>
                <Pressable disabled={submitting} onPress={() => setDocuments((prev) => prev.filter((_, i) => i !== idx))}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <Pressable
          disabled={submitting}
          onPress={() => void submit()}
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>Submit</Text>
          )}
        </Pressable>
      </ScrollView>

      <Modal
        visible={datePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDatePickerOpen(false)}
      >
        <View style={styles.previewOverlay}>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>Select Date</Text>
              <Pressable onPress={() => setDatePickerOpen(false)} hitSlop={10}>
                <X size={20} color="#0F172A" />
              </Pressable>
            </View>

            <DateTimePicker
              value={incidentDate}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "calendar"}
              themeVariant="light"
              textColor="#0F172A"
              onChange={(_, selectedDate) => {
                if (Platform.OS !== "ios") setDatePickerOpen(false);
                if (selectedDate) setIncidentDate(selectedDate);
              }}
            />

            {Platform.OS === "ios" ? (
              <Pressable style={styles.doneBtn} onPress={() => setDatePickerOpen(false)}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(previewing)} transparent animationType="fade" onRequestClose={() => setPreviewing(null)}>
        <View style={styles.previewOverlay}>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>Preview</Text>
              <Pressable onPress={() => setPreviewing(null)} hitSlop={10}>
                <X size={20} color="#0F172A" />
              </Pressable>
            </View>

            {previewing ? (
              previewing.kind === "photo" ? (
                <Image source={{ uri: previewing.uri }} style={styles.imagePreview} resizeMode="contain" />
              ) : previewing.kind === "video" ? (
                <VideoPlayerBox uri={previewing.uri} />
              ) : (
                <View style={styles.filePreview}>
                  <FileText size={22} color="#088EAB" />
                  <Text style={styles.filePreviewName}>{previewing.name}</Text>
                  <Text style={styles.filePreviewHint}>Preview not available for files. It will be uploaded on submit.</Text>
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
  headerTitle: { fontSize: 20, lineHeight: 24, fontWeight: "800", color: "#0F172A" },
  headerSpacer: { width: 40, height: 40 },
  content: { padding: 16, paddingBottom: 28 },
  label: { color: "#334155", fontWeight: "800", marginBottom: 8, marginTop: 12 },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0F172A",
  },
  dateInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dateText: { color: "#0F172A", fontWeight: "800" },
  textarea: { minHeight: 120, textAlignVertical: "top" },
  selectWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  selectPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  selectPillActive: { borderColor: "#0AAFD0", backgroundColor: "#F3FAFD" },
  selectText: { color: "#0F172A", fontWeight: "700" },
  selectTextActive: { color: "#088EAB" },
  radioRow: { flexDirection: "row", flexWrap: "wrap", gap: 18, marginTop: 2 },
  radioItem: { flexDirection: "row", alignItems: "center" },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  radioOuterSelected: { borderColor: "#0AAFD0" },
  radioInner: { width: 9, height: 9, borderRadius: 999, backgroundColor: "#0AAFD0" },
  radioLabel: { color: "#0F172A", fontWeight: "700" },
  submitBtn: {
    marginTop: 18,
    backgroundColor: "#0AAFD0",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: "#FFFFFF", fontWeight: "900" },
  secondaryBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D7EEF5",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  secondaryBtnText: { color: "#088EAB", fontWeight: "900" },
  uploadRow: { flexDirection: "row", gap: 10 },
  uploadBtn: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D7EEF5",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  uploadBtnText: { color: "#088EAB", fontWeight: "900" },
  docList: { marginTop: 10 },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  docLeft: { flex: 1, marginRight: 10, flexDirection: "row", alignItems: "center" },
  docTextCol: { flex: 1 },
  docMeta: { marginTop: 2, color: "#64748B", fontSize: 12, fontWeight: "700" },
  thumb: { width: 42, height: 42, borderRadius: 10, marginRight: 10, backgroundColor: "#E5E7EB" },
  thumbPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 10,
    marginRight: 10,
    backgroundColor: "#F3FAFD",
    borderWidth: 1,
    borderColor: "#D7EEF5",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbPlaceholderText: { color: "#088EAB", fontWeight: "900", fontSize: 10 },
  docName: { flex: 1, marginRight: 10, color: "#0F172A", fontWeight: "700" },
  removeText: { color: "#DC2626", fontWeight: "900" },
  previewOverlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.55)", justifyContent: "center", padding: 16 },
  previewCard: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 12, maxHeight: "80%" },
  previewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  previewTitle: { color: "#0F172A", fontWeight: "900", fontSize: 16 },
  imagePreview: { width: "100%", height: 360, backgroundColor: "#0B1220" },
  videoPreview: { width: "100%", height: 360, backgroundColor: "#0B1220" },
  filePreview: { alignItems: "center", paddingVertical: 30, gap: 10 },
  filePreviewName: { color: "#0F172A", fontWeight: "900", textAlign: "center" },
  filePreviewHint: { color: "#64748B", textAlign: "center", lineHeight: 20 },
  doneBtn: {
    marginTop: 12,
    backgroundColor: "#0AAFD0",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  doneBtnText: { color: "#FFFFFF", fontWeight: "900" },
});
