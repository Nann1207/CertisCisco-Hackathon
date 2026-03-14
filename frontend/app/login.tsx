import React, { useState } from "react";
import {
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Eye, EyeOff } from "lucide-react-native";

const ORANGE = "#F68D2C";
const BLUE = "#0E2D52";

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function onSignIn() {
    
    router.replace("/home");
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

        
        <Pressable style={styles.langBtn} hitSlop={12} onPress={() => {}}>
          <Image
            source={require("../assets/translation.png")}
            style={styles.langIcon}
            resizeMode="contain"
          />
        </Pressable>

        <View style={styles.content}>
          <Text style={styles.welcome}>WELCOME BACK</Text>
          <Text style={styles.hint}>Please enter your details</Text>

          <Text style={styles.fieldLabel}>Email Address:</Text>
          <View style={styles.inputWrap}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email address ..."
              placeholderTextColor="rgba(0,0,0,0.45)"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </View>

          <Text style={styles.passwordLabel}>Password:</Text>
          <View style={styles.inputWrap}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password ..."
              placeholderTextColor="rgba(0,0,0,0.45)"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              style={[styles.input, { paddingRight: 64 }]}
            />
            <Pressable
              onPress={() => setShowPassword((s) => !s)}
              style={styles.eyeBtn}
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
              <Text style={styles.rememberText}>Remember me</Text>
            </Pressable>

            <Pressable onPress={() => {}} hitSlop={10}>
              <Text style={styles.forgot}>Forgot password?</Text>
            </Pressable>
          </View>

          <Pressable onPress={onSignIn} style={styles.signInBtn}>
            <Text style={styles.signInText}>SIGN IN</Text>
          </Pressable>
        </View>

        
        <View style={styles.bottomBrand}>
          <Image
            source={require("../assets/fortis-logo.png")}
            style={styles.bottomMark}
            resizeMode="contain"
          />
          <Text style={styles.bottomCertis}>Certis Cisco</Text>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BLUE },
  bg: { flex: 1 },

  langBtn: { position: "absolute", right: 18, top: 54, zIndex: 10 },
  langIcon: { width: 48, height: 48 },

  content: { paddingTop: 120, paddingHorizontal: 28 },

  welcome: { color: "#FFFFFF", fontSize: 40, fontWeight: "600",textAlign: "center", marginTop: 90, },
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
  rememberText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600", },

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
    marginBottom: 25,
  },
});
