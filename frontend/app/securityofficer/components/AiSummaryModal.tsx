import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Minus, Plus, X } from "lucide-react-native";
import Text from "../../../components/TranslatedText";

type AiSummaryModalProps = {
  visible: boolean;
  fontSize: number;
  minFontSize?: number;
  maxFontSize?: number;
  onChangeFontSize: (next: number) => void;
  onClose: () => void;
};

export default function AiSummaryModal({
  visible,
  fontSize,
  minFontSize = 13,
  maxFontSize = 20,
  onChangeFontSize,
  onClose,
}: AiSummaryModalProps) {
  const decDisabled = fontSize <= minFontSize;
  const incDisabled = fontSize >= maxFontSize;
  const sampleText =
    "Sample AI report text to preview your font size. This does not change the original assessment details shown on the incident page.";

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
      <View style={styles.backdrop}>
        <LinearGradient
          colors={["#F8EEE8", "#E8E3F6", "#C8B8EF"]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.card}
        >
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
            <X size={18} color="#1E1B4B" />
          </Pressable>

          <Text style={styles.title}>AI Assessment Summary</Text>
          <Text style={styles.subtitle}>Adjust the font size for easier reading.</Text>

          <View style={styles.controlsRow}>
            <Pressable
              style={[styles.controlBtn, decDisabled ? styles.controlBtnDisabled : null]}
              onPress={() => onChangeFontSize(Math.max(minFontSize, fontSize - 1))}
              disabled={decDisabled}
            >
              <Minus size={18} color="#1E1B4B" />
            </Pressable>
            <Text style={styles.fontSizeText}>{fontSize}px</Text>
            <Pressable
              style={[styles.controlBtn, incDisabled ? styles.controlBtnDisabled : null]}
              onPress={() => onChangeFontSize(Math.min(maxFontSize, fontSize + 1))}
              disabled={incDisabled}
            >
              <Plus size={18} color="#1E1B4B" />
            </Pressable>
          </View>

          <View style={styles.summaryShell}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.summaryText, { fontSize }]}>{sampleText}</Text>
            </ScrollView>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(10, 22, 38, 0.62)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: "#5B21B6",
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 18,
  },
  closeBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    textAlign: "center",
    fontSize: 20,
    fontWeight: "900",
    color: "#1E1B4B",
  },
  subtitle: {
    marginTop: 6,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: "#4C1D95",
  },
  controlsRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  controlBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "#C7B8F6",
    alignItems: "center",
    justifyContent: "center",
  },
  controlBtnDisabled: {
    opacity: 0.5,
  },
  fontSizeText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1E1B4B",
  },
  summaryShell: {
    marginTop: 14,
    minHeight: 180,
    maxHeight: 320,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#C7B8F6",
    backgroundColor: "rgba(255,255,255,0.92)",
    padding: 14,
  },
  summaryText: {
    color: "#1F2937",
    fontWeight: "600",
    lineHeight: 20,
  },
});
