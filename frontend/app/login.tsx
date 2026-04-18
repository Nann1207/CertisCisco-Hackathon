import React, { useEffect, useState } from "react";
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
import {
  LanguagePreference,
  normalizeLanguagePreference,
  setLanguagePreference,
} from "../lib/language-preferences";
import {
  getPublicLanguagePreference,
  setPublicLanguagePreference,
  subscribePublicLanguagePreference,
} from "../lib/public-language-preferences";

const ORANGE = "#F68D2C";
const BLUE = "#0E2D52";
const roleRoutes: Record<string, string> = {
  "Security Officer": "/securityofficer/home",
  "Senior Security Officer": "/sso/home",
  "Security Supervisor": "/securitysupervisor/home",
};
const REQUEST_TIMEOUT_MS = 15000;

const LOGIN_COPY: Record<
  LanguagePreference,
  {
    welcomeBack: string;
    enterDetails: string;
    emailAddress: string;
    password: string;
    emailPlaceholder: string;
    passwordPlaceholder: string;
    rememberMe: string;
    forgotPassword: string;
    signIn: string;
    missingDetailsTitle: string;
    missingDetailsBody: string;
    signInFailedTitle: string;
    invalidCredentials: string;
    unexpectedError: string;
  }
> = {
  English: {
    welcomeBack: "WELCOME BACK",
    enterDetails: "Please enter your details",
    emailAddress: "Email Address:",
    password: "Password:",
    emailPlaceholder: "Enter your email address ...",
    passwordPlaceholder: "Enter your password ...",
    rememberMe: "Remember me",
    forgotPassword: "Forgot password?",
    signIn: "SIGN IN",
    missingDetailsTitle: "Missing details",
    missingDetailsBody: "Please enter your email and password.",
    signInFailedTitle: "Sign in failed",
    invalidCredentials: "Invalid credentials.",
    unexpectedError: "Unexpected error during sign in.",
  },
  Malay: {
    welcomeBack: "SELAMAT KEMBALI",
    enterDetails: "Sila masukkan butiran anda",
    emailAddress: "Alamat Emel:",
    password: "Kata Laluan:",
    emailPlaceholder: "Masukkan alamat emel anda ...",
    passwordPlaceholder: "Masukkan kata laluan anda ...",
    rememberMe: "Ingat saya",
    forgotPassword: "Lupa kata laluan?",
    signIn: "LOG MASUK",
    missingDetailsTitle: "Maklumat tidak lengkap",
    missingDetailsBody: "Sila masukkan emel dan kata laluan anda.",
    signInFailedTitle: "Log masuk gagal",
    invalidCredentials: "Maklumat log masuk tidak sah.",
    unexpectedError: "Ralat tidak dijangka semasa log masuk.",
  },
  Tamil: {
    welcomeBack: "மீண்டும் வரவேற்கிறோம்",
    enterDetails: "உங்கள் விவரங்களை உள்ளிடவும்",
    emailAddress: "மின்னஞ்சல் முகவரி:",
    password: "கடவுச்சொல்:",
    emailPlaceholder: "உங்கள் மின்னஞ்சல் முகவரியை உள்ளிடவும் ...",
    passwordPlaceholder: "உங்கள் கடவுச்சொல்லை உள்ளிடவும் ...",
    rememberMe: "என்னை நினைவில் கொள்",
    forgotPassword: "கடவுச்சொல் மறந்துவிட்டதா?",
    signIn: "உள்நுழை",
    missingDetailsTitle: "தகவல் இல்லை",
    missingDetailsBody: "உங்கள் மின்னஞ்சலும் கடவுச்சொல்லும் உள்ளிடவும்.",
    signInFailedTitle: "உள்நுழைவு தோல்வி",
    invalidCredentials: "தவறான உள்நுழைவு தகவல்.",
    unexpectedError: "உள்நுழையும்போது எதிர்பாராத பிழை.",
  },
  Chinese: {
    welcomeBack: "欢迎回来",
    enterDetails: "请输入您的资料",
    emailAddress: "电子邮箱：",
    password: "密码：",
    emailPlaceholder: "请输入您的电子邮箱 ...",
    passwordPlaceholder: "请输入您的密码 ...",
    rememberMe: "记住我",
    forgotPassword: "忘记密码？",
    signIn: "登录",
    missingDetailsTitle: "缺少信息",
    missingDetailsBody: "请输入您的电子邮箱和密码。",
    signInFailedTitle: "登录失败",
    invalidCredentials: "登录凭据无效。",
    unexpectedError: "登录时发生意外错误。",
  },
};

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
  const [publicLanguage, setPublicLanguage] = useState<LanguagePreference>(
    getPublicLanguagePreference()
  );

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
  const copy = LOGIN_COPY[publicLanguage];
  const authMetaTextStyle = {
    fontSize: bodyFontSize,
    lineHeight: Math.round(bodyFontSize * 1.2),
  };

  useEffect(() => {
    return subscribePublicLanguagePreference(setPublicLanguage);
  }, []);

  useEffect(() => {
    setLanguagePreference(publicLanguage);
  }, [publicLanguage]);

  async function onSignIn() {
    if (loading) return;
    if (!email.trim() || !password) {
      Alert.alert(copy.missingDetailsTitle, copy.missingDetailsBody);
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
        Alert.alert(copy.signInFailedTitle, authError?.message ?? copy.invalidCredentials);
        return;
      }

      const { data: profile, error: profileError } = await withTimeout(
        supabase
          .from("employees")
          .select("role, language_preferences")
          .eq("id", authData.user.id)
          .single()
      );

      if (profileError || !profile?.role) {
        await supabase.auth.signOut();
        Alert.alert(copy.signInFailedTitle, "Employee role record was not found.");
        return;
      }

      const route = roleRoutes[profile.role];
      if (!route) {
        await supabase.auth.signOut();
        Alert.alert(copy.signInFailedTitle, `Unsupported role: ${profile.role}`);
        return;
      }

      // English on login is treated as "no override" to preserve user's saved preference.
      const selectedLanguage = publicLanguage;
      const currentPreferredLanguage = normalizeLanguagePreference(
        profile.language_preferences
      );

      if (selectedLanguage !== "English") {
        const { error: updateByIdError } = await withTimeout(
          supabase
            .from("employees")
            .update({ language_preferences: selectedLanguage })
            .eq("id", authData.user.id)
        );

        if (updateByIdError && authData.user.email) {
          await withTimeout(
            supabase
              .from("employees")
              .update({ language_preferences: selectedLanguage })
              .eq("email", authData.user.email)
          );
        }

        setLanguagePreference(selectedLanguage);
          setPublicLanguagePreference(selectedLanguage);
      } else {
          const effectiveLanguage = currentPreferredLanguage ?? "English";
          setLanguagePreference(effectiveLanguage);
          setPublicLanguagePreference(effectiveLanguage);
      }

      router.replace(route);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : copy.unexpectedError;
      Alert.alert(copy.signInFailedTitle, message);
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

        
        <Pressable
          style={[styles.langBtn, { top: langTop, right: langRight }]}
          hitSlop={12}
          onPress={() => router.push("/translate")}
        >
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
            <Text style={[styles.welcome, { fontSize: welcomeFontSize, marginTop: welcomeMarginTop }]}>{copy.welcomeBack}</Text>
            <Text style={[styles.hint, { fontSize: hintFontSize }]}>{copy.enterDetails}</Text>

            <Text style={[styles.fieldLabel, { fontSize: labelFontSize }]}>{copy.emailAddress}</Text>
            <View style={[styles.inputWrap, { height: inputHeight }]}> 
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={copy.emailPlaceholder}
              placeholderTextColor="rgba(0,0,0,0.45)"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { fontSize: inputFontSize, height: inputHeight }]}
            />
            </View>

            <Text style={[styles.passwordLabel, { fontSize: labelFontSize }]}>{copy.password}</Text>
            <View style={[styles.inputWrap, { height: inputHeight }]}> 
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={copy.passwordPlaceholder}
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
                <Text
                  style={[styles.rememberText, authMetaTextStyle]}
                  numberOfLines={1}
                  disableDynamicFontSize
                >
                  {copy.rememberMe}
                </Text>
              </Pressable>

              <Pressable onPress={() => {}} hitSlop={10} style={styles.forgotWrap}>
                <Text
                  style={[styles.forgot, authMetaTextStyle]}
                  numberOfLines={1}
                  disableDynamicFontSize
                >
                  {copy.forgotPassword}
                </Text>
              </Pressable>
            </View>

            <Pressable onPress={onSignIn} style={[styles.signInBtn, { height: inputHeight }]}> 
              {loading ? (
                <ActivityIndicator color={BLUE} />
              ) : (
                <Text style={[styles.signInText, { fontSize: signInTextSize }]}>{copy.signIn}</Text>
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
    gap: 12,
    alignItems: "center",
  },

  rememberWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  checkbox: {
    width: 14,
    height: 14,
    borderWidth: 2,
    borderColor: ORANGE,
    borderRadius: 3,
  },
  checkboxOn: { backgroundColor: ORANGE },
  rememberText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600", flexShrink: 1 },

  forgotWrap: {
    flexShrink: 1,
    maxWidth: "45%",
    alignItems: "flex-end",
  },

  forgot: {
    color: ORANGE,
    fontSize: 16,
    textDecorationLine: "underline",
    fontWeight: "600",
    textAlign: "right",
    flexShrink: 1,
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
