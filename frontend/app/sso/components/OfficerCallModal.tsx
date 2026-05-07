import React from "react";
import { Linking, Modal, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { PhoneCall } from "lucide-react-native";
import Text from "../../../components/TranslatedText";

type OfficerCallModalProps = {
  visible: boolean;
  officerName: string;
  phone: string | null;
  onClose: () => void;
};

export default function OfficerCallModal({
  visible,
  officerName,
  phone,
  onClose,
}: OfficerCallModalProps) {
  const trimmedPhone = phone?.trim() ?? "";
  const canCall = trimmedPhone.length > 0;

  const onCallNow = async () => {
    if (!canCall) return;

    const tel = `tel:${trimmedPhone}`;
    try {
      const canOpen = await Linking.canOpenURL(tel);
      if (!canOpen) return;
      await Linking.openURL(tel);
    } catch {}
  };

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
          colors={["#FFF7ED", "#FFE7CB", "#DBEAFE"]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.card}
        >
          <View style={styles.iconWrap}>
            <PhoneCall size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>Call Officer</Text>
          <Text style={styles.name}>{officerName}</Text>
          <View style={styles.phoneBox}>
            <Text style={styles.phoneText}>{trimmedPhone || "Phone number unavailable"}</Text>
          </View>

          <View style={styles.actions}>
            <Pressable style={[styles.button, styles.cancelButton]} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.primaryButton, !canCall ? styles.primaryButtonDisabled : null]}
              disabled={!canCall}
              onPress={() => void onCallNow()}
            >
              <Text style={styles.primaryText}>Call Now</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(10, 22, 38, 0.64)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  card: {
    width: "100%",
    maxWidth: 350,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#0E2D52",
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    alignItems: "center",
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#0E2D52",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginTop: 12,
    color: "#0E2D52",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  name: {
    marginTop: 4,
    color: "#1F2937",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  phoneBox: {
    marginTop: 14,
    width: "100%",
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(14, 45, 82, 0.22)",
    backgroundColor: "rgba(255, 255, 255, 0.74)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  phoneText: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  actions: {
    marginTop: 18,
    width: "100%",
    flexDirection: "row",
    gap: 10,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: "rgba(255, 255, 255, 0.68)",
    borderWidth: 1,
    borderColor: "rgba(14, 45, 82, 0.2)",
  },
  primaryButton: {
    backgroundColor: "#0E2D52",
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  cancelText: {
    color: "#0E2D52",
    fontSize: 14,
    fontWeight: "900",
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
});
