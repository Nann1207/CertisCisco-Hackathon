import React, { useMemo } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { X } from "lucide-react-native";
import Text from "../../../components/TranslatedText";

const MAX_REASON_LENGTH = 80;

type RejectAssignmentModalProps = {
  visible: boolean;
  officerName?: string | null;
  reason: string;
  submitting?: boolean;
  onChangeReason: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export default function RejectAssignmentModal({
  visible,
  officerName,
  reason,
  submitting = false,
  onChangeReason,
  onSubmit,
  onClose,
}: RejectAssignmentModalProps) {
  const trimmedReason = reason.trim();
  const canSubmit = trimmedReason.length > 0 && !submitting;

  const headerText = useMemo(() => {
    const name = officerName?.trim();
    if (!name) return "Decline Assignment";
    return `Decline Assignment`;
  }, [officerName]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <LinearGradient
          colors={["#FFE2C9", "#F6D5E0", "#542A7C"]}
          locations={[0.1, 0.55, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.card}
        >
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
            <X size={18} color="#2E1065" />
          </Pressable>

          <Text style={styles.title}>{headerText}</Text>
          <View style={styles.subtitle}>
            <Text style={styles.subtitleText}>
              {`Provide short reason so supervisor can \nreassign quickly.`}
            </Text>
          </View>

          <Text style={styles.inputLabel}>Reason required (max {MAX_REASON_LENGTH} characters)</Text>
          <View style={styles.inputShell}>
            <TextInput
              style={styles.input}
              placeholder="Enter reason before submitting..."
              placeholderTextColor="rgba(30, 41, 59, 0.55)"
              value={reason}
              onChangeText={(value) => onChangeReason(value.slice(0, MAX_REASON_LENGTH))}
              maxLength={MAX_REASON_LENGTH}
              multiline
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>({reason.length}/{MAX_REASON_LENGTH})</Text>
          </View>
          {!trimmedReason ? (
            <Text style={styles.requiredText}>A reason is required to decline this assignment.</Text>
          ) : null}

          <View style={styles.actionsRow}>
            <Pressable style={[styles.actionBtn, styles.cancelBtn]} onPress={onClose} disabled={submitting}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>

            <Pressable
              style={[styles.actionBtn, styles.submitBtn, !canSubmit ? styles.submitBtnDisabled : null]}
              onPress={onSubmit}
              disabled={!canSubmit}
            >
              <LinearGradient
                colors={canSubmit ? ["#0E2D52", "#0B1F3A"] : ["#94A3B8", "#64748B"]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.submitGradient}
              >
                <Text style={styles.submitText}>{submitting ? "Submitting..." : "Submit"}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </LinearGradient>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(10, 22, 38, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "#64206E",
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 20,
  },
  closeBtn: {
    position: "absolute",
    right: 12,
    top: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginTop: 8,
    fontSize: 25,
    fontWeight: "900",
    color: "#1E1B4B",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 6,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  subtitleText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#5B4E77",
    textAlign: "center",
  },
  inputLabel: {
    marginTop: 26,
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  inputShell: {
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#3F1FB6",
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    minHeight: 108,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  charCount: {
    marginTop: 6,
    fontSize: 12,
    textAlign: "right",
    color: "#1F2937",
    fontWeight: "700",
  },
  requiredText: {
    marginTop: 7,
    color: "#991B1B",
    fontSize: 12,
    fontWeight: "800",
  },
  actionsRow: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: "rgba(110, 85, 136, 0.5)",
    backgroundColor: "rgba(255, 255, 255, 0.6)",
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#3F1FB6",
  },
  submitBtn: {
    overflow: "hidden",
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitGradient: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  submitText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FFFFFF",
  },
});
