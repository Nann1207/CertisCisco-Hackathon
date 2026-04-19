import React, { useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Text from "../components/TranslatedText";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Eye, EyeOff } from "lucide-react-native";
import { supabase } from "../lib/supabase";

const ORANGE = "#F68D2C";
const BLUE = "#0E2D52";
const roleRoutes: Record<string, string> = {
  "Security Officer": "/securityofficer/home",
  "Senior Security Officer": "/sso/home",
  "Security Supervisor": "/sso/home",
};
const REQUEST_TIMEOUT_MS = 15000;

async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Request timed out. Please try again.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default function LoginScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const horizontalPadding = Math.round(clamp(width * 0.07, 18, 32));
  const topPad = Math.round(clamp(height * 0.06, 26, 56));
  const welcomeMarginTop = Math.round(clamp(height * 0.07, 22, 90));
  const welcomeFontSize = Math.round(clamp(width * 0.092, 30, 40));
  const hintFontSize = Math.round(clamp(width * 0.055, 17, 24));
  const labelFontSize = Math.round(clamp(width * 0.045, 15, 19));
  const bodyFontSize = Math.round(clamp(width * 0.04, 14, 16));
  const inputFontSize = Math.round(clamp(width * 0.045, 15, 19));
  const inputHeight = Math.round(clamp(height * 0.06, 44, 50));
  const signInTextSize = Math.round(clamp(width * 0.058, 19, 24));
  const logoWidth = Math.round(clamp(width * 0.52, 160, 220));
  const logoHeight = Math.round(clamp(logoWidth * 0.42, 66, 92));
  const bottomPad = Math.round(clamp(height * 0.05, 24, 60));
  const langTop = Math.round(clamp(height * 0.06, 20, 54));
  const langRight = Math.round(clamp(width * 0.05, 12, 20));
  const langSize = Math.round(clamp(width * 0.12, 40, 52));

  async function onSignIn() {
    if (loading) return;
    if (!email.trim() || !password) {
      Alert.alert("Missing details", "Please enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      const { data: authData, error: authError } =
        await withTimeout(
          supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
          })
        );

      if (authError || !authData.user) {
        Alert.alert("Sign in failed", authError?.message ?? "Invalid credentials.");
        return;
      }

      const { data: profile, error: profileError } = await withTimeout(
        supabase
          .from("employees")
          .select("role")
          .eq("id", authData.user.id)
          .single()
      );

      if (profileError || !profile?.role) {
        await supabase.auth.signOut();
        Alert.alert("Sign in failed", "Employee role record was not found.");
        return;
      }

      const route = roleRoutes[profile.role];
      if (!route) {
        await supabase.auth.signOut();
        Alert.alert("Sign in failed", `Unsupported role: ${profile.role}`);
        return;
      }

      router.replace(route);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected error during sign in.";
      Alert.alert("Sign in failed", message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <ImageBackground
        source={require("../assets/splash.png")}
        style={styles.bg}
        imageStyle={{ opacity: 0.5 }}
        resizeMode="cover"
      >
        <LinearGradient
          colors={[
            "rgba(14,45,82,0.00)",
            "rgba(14,45,82,0.78)",
            "rgba(14,45,82,0.97)",
          ]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />

        
        <Pressable style={[styles.langBtn, { top: langTop, right: langRight }]} hitSlop={12} onPress={() => {}}>
          <Image
            source={require("../assets/translation.png")}
            style={[styles.langIcon, { width: langSize, height: langSize }]}
            resizeMode="contain"
          />
        </Pressable>

        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.content, { paddingTop: topPad, paddingHorizontal: horizontalPadding }]}> 
            <Text style={[styles.welcome, { fontSize: welcomeFontSize, marginTop: welcomeMarginTop }]}>WELCOME BACK</Text>
            <Text style={[styles.hint, { fontSize: hintFontSize }]}>Please enter your details</Text>

            <Text style={[styles.fieldLabel, { fontSize: labelFontSize }]}>Email Address:</Text>
            <View style={[styles.inputWrap, { height: inputHeight }]}> 
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email address ..."
              placeholderTextColor="rgba(0,0,0,0.45)"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { fontSize: inputFontSize, height: inputHeight }]}
            />
            </View>

            <Text style={[styles.passwordLabel, { fontSize: labelFontSize }]}>Password:</Text>
            <View style={[styles.inputWrap, { height: inputHeight }]}> 
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password ..."
              placeholderTextColor="rgba(0,0,0,0.45)"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              style={[styles.input, { paddingRight: 64, fontSize: inputFontSize, height: inputHeight }]}
            />
            <Pressable
              onPress={() => setShowPassword((s) => !s)}
              style={[styles.eyeBtn, { height: inputHeight }]}
              hitSlop={10}
            >
              {showPassword ? (
                <EyeOff size={18} color="rgba(0,0,0,0.45)" />
              ) : (
                <Eye size={18} color="rgba(0,0,0,0.45)" />
              )}
            </Pressable>
            </View>

            <View style={styles.row}>
              <Pressable
                onPress={() => setRememberMe((v) => !v)}
                style={styles.rememberWrap}
                hitSlop={10}
              >
                <View style={[styles.checkbox, rememberMe && styles.checkboxOn]} />
                <Text style={[styles.rememberText, { fontSize: bodyFontSize }]}>Remember me</Text>
              </Pressable>

              <Pressable onPress={() => {}} hitSlop={10}>
                <Text style={[styles.forgot, { fontSize: bodyFontSize }]}>Forgot password?</Text>
              </Pressable>
            </View>

            <Pressable onPress={onSignIn} style={[styles.signInBtn, { height: inputHeight }]}> 
              {loading ? (
                <ActivityIndicator color={BLUE} />
              ) : (
                <Text style={[styles.signInText, { fontSize: signInTextSize }]}>SIGN IN</Text>
              )}
            </Pressable>
          </View>

          <View style={[styles.bottomBrand, { bottom: bottomPad }]}> 
            <Image
              source={require("../assets/fortis-logo.png")}
              style={[styles.bottomMark, { width: logoWidth, height: logoHeight }]}
              resizeMode="contain"
            />
            <Text style={[styles.bottomCertis, { fontSize: Math.round(clamp(width * 0.05, 16, 22)) }]}>Certis Cisco</Text>
          </View>
        </ScrollView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BLUE },
  bg: { flex: 1 },

  langBtn: { position: "absolute", zIndex: 10 },
  langIcon: { width: 48, height: 48 },

  content: { paddingTop: 120, paddingHorizontal: 28 },

  welcome: { color: "#FFFFFF", fontSize: 40, fontWeight: "600", textAlign: "center", marginTop: 90 },
  hint: {
    marginTop: 8,
    marginBottom: 10,
    color: "rgba(255,255,255,0.58)",
    fontSize: 24,
    fontWeight: "500",
    textAlign: "center",
  },

  fieldLabel: { marginTop: 26, color: "#FFFFFF", fontSize: 19, fontWeight: "500" },
  passwordLabel: {
    marginTop: 35,
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "500",
  },

  inputWrap: {
    marginTop: 6,
    height: 46,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: ORANGE,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  input: { fontSize: 19, color: "#111", height: 46 },

  eyeBtn: {
    position: "absolute",
    right: 14,
    height: 46,
    justifyContent: "center",
  },

  row: {
    marginTop: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  rememberWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: {
    width: 14,
    height: 14,
    borderWidth: 2,
    borderColor: ORANGE,
    borderRadius: 3,
  },
  checkboxOn: { backgroundColor: ORANGE },
  rememberText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },

  forgot: {
    color: ORANGE,
    fontSize: 16,
    textDecorationLine: "underline",
    fontWeight: "600",
  },

  signInBtn: {
    marginTop: 45,
    height: 41,
    borderRadius: 45,
    backgroundColor: "#F68D2C",
    borderWidth: 1,
    borderColor: "#1C1C1C",
    alignItems: "center",
    justifyContent: "center",
  },
  signInText: { color: BLUE, fontSize: 24, fontWeight: "500" },

  bottomBrand: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 60,
    alignItems: "center",
  },
  bottomCertis: { marginTop: 8, color: "#FFFFFF", fontSize: 20, textAlign: "center" },
  bottomMark: {
    width: 200,
    height: 84,
    marginBottom: 14,
  },
});
