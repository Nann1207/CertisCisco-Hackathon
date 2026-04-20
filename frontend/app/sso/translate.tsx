import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import Text from "../../components/TranslatedText";
import {
  LanguagePreference,
  normalizeLanguagePreference,
  setLanguagePreference as setGlobalLanguagePreference,
} from "../../lib/language-preferences";

const LANGUAGE_OPTIONS: LanguagePreference[] = ["English", "Tamil", "Malay", "Chinese"];

export default function TranslateScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [languagePreference, setLanguagePreference] = useState<LanguagePreference>("English");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const loadLanguagePreference = async () => {
      setLoadError(null);
      setLoading(true);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      let userId = sessionData.session?.user.id ?? null;
      let userEmail = sessionData.session?.user.email ?? null;

      if (!userId || !userEmail) {
        const { data: userData } = await supabase.auth.getUser();
        userId = userId ?? userData.user?.id ?? null;
        userEmail = userEmail ?? userData.user?.email ?? null;
      }

      if (!userId) {
        if (alive) {
          setLoadError(sessionError?.message ?? "Unable to load user session.");
          setLoading(false);
        }
        return;
      }

      const { data: employeeById, error: employeeByIdError } = await supabase
        .from("employees")
        .select("language_preferences")
        .eq("id", userId)
        .maybeSingle();

      let preference = employeeById?.language_preferences ?? null;

      if (!preference && userEmail) {
        const { data: employeeByEmail } = await supabase
          .from("employees")
          .select("language_preferences")
          .eq("email", userEmail)
          .maybeSingle();
        preference = employeeByEmail?.language_preferences ?? null;
      }

      if (!alive) return;

      if (employeeByIdError) {
        setLoadError(employeeByIdError.message);
        setLoading(false);
        return;
      }

      const normalizedPreference = normalizeLanguagePreference(preference);

      if (normalizedPreference && LANGUAGE_OPTIONS.includes(normalizedPreference)) {
        setLanguagePreference(normalizedPreference);
        setGlobalLanguagePreference(normalizedPreference);
      } else {
        setLanguagePreference("English");
        setGlobalLanguagePreference("English");
      }

      setLoading(false);
    };

    void loadLanguagePreference();

    return () => {
      alive = false;
    };
  }, []);

  const subtitleText = useMemo(
    () => `Current preference: ${languagePreference}`,
    [languagePreference]
  );

  const updateLanguagePreference = async (nextValue: LanguagePreference) => {
    if (saving) return;

    setSaving(true);

    const { data: sessionData } = await supabase.auth.getSession();
    let userId = sessionData.session?.user.id ?? null;
    let userEmail = sessionData.session?.user.email ?? null;

    if (!userId || !userEmail) {
      const { data: userData } = await supabase.auth.getUser();
      userId = userId ?? userData.user?.id ?? null;
      userEmail = userEmail ?? userData.user?.email ?? null;
    }

    if (!userId) {
      setSaving(false);
      Alert.alert("Update failed", "Unable to identify the signed-in user.");
      return;
    }

    const { error: updateByIdError } = await supabase
      .from("employees")
      .update({ language_preferences: nextValue })
      .eq("id", userId);

    let updateError = updateByIdError;

    if (updateByIdError && userEmail) {
      const { error: updateByEmailError } = await supabase
        .from("employees")
        .update({ language_preferences: nextValue })
        .eq("email", userEmail);
      updateError = updateByEmailError;
    }

    setSaving(false);

    if (updateError) {
      Alert.alert("Update failed", updateError.message);
      return;
    }

    setGlobalLanguagePreference(nextValue, { forceNotify: true });
    setLanguagePreference(nextValue);
    Alert.alert("Saved", `Language preference updated to ${nextValue}.`);
  };

  return (
    <View style={styles.overlayRoot}>
      <Pressable
        style={styles.backdrop}
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/sso/home")
        }
      />

      <View style={styles.modalCard}>
        <View style={styles.modalHeaderRow}>
          <Text style={styles.modalTitle}>Translate</Text>
          <Pressable
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/sso/home")
            }
            hitSlop={8}
          >
            <X size={18} color="#6B7280" />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centerWrap}>
            <ActivityIndicator color="#1F2457" />
          </View>
        ) : loadError ? (
          <View style={styles.centerWrap}>
            <Text style={styles.errorTitle}>Unable to load language preference</Text>
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        ) : (
          <View style={styles.contentCard}>
            <Text style={styles.label}>{subtitleText}</Text>

            {LANGUAGE_OPTIONS.map((option) => {
              const active = option === languagePreference;
              return (
                <Pressable
                  key={option}
                  style={[styles.optionButton, active ? styles.optionButtonActive : null, saving ? styles.disabledButton : null]}
                  onPress={() => void updateLanguagePreference(option)}
                  disabled={saving}
                >
                  <Text style={[styles.optionText, active ? styles.optionTextActive : null]}>
                    {saving && active ? "Saving..." : option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
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
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
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
  centerWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
  contentCard: {
    gap: 12,
  },
  label: {
    fontSize: 15,
    color: "#6B7280",
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorTitle: {
    fontSize: 18,
    color: "#1F2457",
    fontWeight: "700",
    textAlign: "center",
  },
  errorText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#6B7280",
    textAlign: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
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
