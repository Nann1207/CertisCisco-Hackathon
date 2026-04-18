import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import Text from "../components/TranslatedText";
import {
  LanguagePreference,
  setLanguagePreference,
} from "../lib/language-preferences";
import {
  getPublicLanguagePreference,
  setPublicLanguagePreference,
  subscribePublicLanguagePreference,
} from "../lib/public-language-preferences";

const LANGUAGE_OPTIONS: LanguagePreference[] = ["English", "Tamil", "Malay", "Chinese"];

export default function PublicTranslateModal() {
  const router = useRouter();
  const [current, setCurrent] = useState<LanguagePreference>(getPublicLanguagePreference());

  useEffect(() => {
    return subscribePublicLanguagePreference(setCurrent);
  }, []);

  const onSelect = (next: LanguagePreference) => {
    setPublicLanguagePreference(next);
    setLanguagePreference(next, { forceNotify: true });
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/login");
    }
  };

  return (
    <View style={styles.overlayRoot}>
      <Pressable
        style={styles.backdrop}
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/login"))}
      />

      <View style={styles.modalCard}>
        <View style={styles.modalHeaderRow}>
          <Text style={styles.modalTitle}>Translate</Text>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/login"))}
            hitSlop={8}
          >
            <X size={18} color="#6B7280" />
          </Pressable>
        </View>

        <Text style={styles.label}>Select language for this session</Text>

        {LANGUAGE_OPTIONS.map((option) => {
          const active = option === current;
          return (
            <Pressable
              key={option}
              style={[styles.optionButton, active ? styles.optionButtonActive : null]}
              onPress={() => onSelect(option)}
            >
              <Text style={[styles.optionText, active ? styles.optionTextActive : null]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  label: {
    fontSize: 15,
    color: "#6B7280",
    fontWeight: "600",
  },
  optionButton: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  optionButtonActive: {
    borderColor: "#1F2457",
    backgroundColor: "#EEF2FF",
  },
  optionText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "600",
  },
  optionTextActive: {
    color: "#1F2457",
    fontWeight: "700",
  },
});
