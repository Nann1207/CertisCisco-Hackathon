import React from "react";
import { Pressable, SafeAreaView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, PhoneCall } from "lucide-react-native";
import Text from "../../components/TranslatedText";

export default function SsoPhoneCallsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/sso/home"))}
        >
          <ChevronLeft size={24} color="#FFFFFF" strokeWidth={2.6} />
        </Pressable>
        <Text style={styles.headerTitle}>Phone Calls</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <PhoneCall size={32} color="#0E2D52" />
        </View>
        <Text style={styles.title}>Phone-call page is connected for SSO.</Text>
        <Text style={styles.body}>We can wire the actual calling workflow next.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    paddingHorizontal: 12,
    paddingTop: 40,
    paddingBottom: 12,
    backgroundColor: "#0E2D52",
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 27,
    fontWeight: "700",
    color: "#FFFFFF",
    marginLeft: 10,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  body: {
    color: "#64748B",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
});
