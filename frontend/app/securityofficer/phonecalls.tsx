import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
  Image,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";

type Contact = {
  name: string;
  number: string;
  color: string;
  iconName: keyof typeof Ionicons.glyphMap;
  imageUrl?: string | null;
};

const GOVERNMENT: Contact[] = [
  { name: "SCDF", number: "995", color: "#DC2626", iconName: "flame-outline" },
  { name: "SPF", number: "999", color: "#2563EB", iconName: "shield-outline" },
];

async function openDialer(number: string) {
  const cleaned = (number || "").replace(/[^\d+]/g, "");
  if (!cleaned) {
    Alert.alert("No phone number", "This contact has no phone number saved.");
    return;
  }

  const url = `tel:${cleaned}`;
  const supported = await Linking.canOpenURL(url);

  if (!supported) {
    Alert.alert("Cannot open dialer", "This device cannot place phone calls.");
    return;
  }

  await Linking.openURL(url);
}

async function getProfilePhotoUrl(profilePhotoPath: string | null) {
  if (!profilePhotoPath) return null;

  const trimmed = profilePhotoPath.trim();
  if (!trimmed) return null;

  // If the DB already stores a full URL, use it directly.
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Normalize values like "/employees/<id>/x.jpg" or "profile-photos/employees/<id>/x.jpg".
  let insidePath = trimmed.replace(/^\/+/, "");
  if (insidePath.startsWith("profile-photos/")) {
    insidePath = insidePath.slice("profile-photos/".length);
  }
  if (!insidePath) return null;

  // Prefer signed URL because the bucket is commonly private.
  const { data: signed, error } = await supabase.storage
    .from("profile-photos")
    .createSignedUrl(insidePath, 60 * 60);

  if (!error && signed?.signedUrl) {
    return signed.signedUrl;
  }

  const { data: pub } = supabase.storage
    .from("profile-photos")
    .getPublicUrl(insidePath);
  return pub?.publicUrl ?? null;
}

function ContactCard({ contact }: { contact: Contact }) {
  return (
    <Pressable style={styles.card} onPress={() => openDialer(contact.number)}>
      <View style={[styles.circle, { backgroundColor: contact.color }]}>
        {contact.imageUrl ? (
          <Image source={{ uri: contact.imageUrl }} style={styles.avatar} />
        ) : (
          <Ionicons name={contact.iconName} size={34} color="#fff" />
        )}
      </View>

      <Text style={styles.cardName} numberOfLines={1}>
        {contact.name}
      </Text>
      <Text style={styles.cardNumber}>{contact.number}</Text>
    </Pressable>
  );
}

function Section({ title, contacts }: { title: string; contacts: Contact[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>

      <View style={styles.grid}>
        {contacts.map((c) => (
          <ContactCard key={`${c.name}-${c.number}`} contact={c} />
        ))}
      </View>
    </View>
  );
}

export default function PhoneCallsPage() {
  const router = useRouter();

  const [ssoContact, setSsoContact] = useState<Contact | null>(null);
  const [loadingSso, setLoadingSso] = useState(false);

  useEffect(() => {
    const loadSsoSophie = async () => {
      setLoadingSso(true);

      const { data, error } = await supabase
        .from("employees")
        .select("first_name,last_name,phone,profile_photo_path,role,emp_id")
        .eq("emp_id", "EMP002")
        .eq("role", "Senior Security Officer")
        .maybeSingle();

      if (error) {
        console.error("loadSsoSophie error:", error);
        setSsoContact(null);
        setLoadingSso(false);
        return;
      }

      if (!data) {
        setSsoContact(null);
        setLoadingSso(false);
        return;
      }

      const imageUrl = await getProfilePhotoUrl(data.profile_photo_path ?? null);

      setSsoContact({
        name: `${data.first_name || ""} ${data.last_name || ""}`.trim() || "Sophie",
        number: data.phone || "",
        color: "#7C3AED",
        iconName: "person-outline",
        imageUrl,
      });

      setLoadingSso(false);
    };

    loadSsoSophie();
  }, []);

  const companyContacts = useMemo<Contact[]>(() => {
    const supervisor: Contact =
      ssoContact ??
      (loadingSso
        ? {
            name: "Loading...",
            number: "",
            color: "#7C3AED",
            iconName: "person-outline",
          }
        : {
            name: "Supervisor",
            number: "",
            color: "#7C3AED",
            iconName: "person-outline",
          });

    const controlRoom: Contact = {
      name: "Control Room",
      number: "61231234",
      color: "#16A34A",
      iconName: "people-outline",
    };

    return [supervisor, controlRoom];
  }, [ssoContact, loadingSso]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace("/securityofficer/home")}
          style={styles.backBtn}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>

        <Text style={styles.headerTitle}>Contacts</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Government contacts" contacts={GOVERNMENT} />

        {loadingSso ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" />
            <Text style={styles.loadingText}>Loading supervisor…</Text>
          </View>
        ) : null}

        <Section title="Company contacts" contacts={companyContacts} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F7FA" },

  header: {
    backgroundColor: "#0E2D52",
    paddingTop: 40,
    paddingBottom: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },

  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    color: "#fff",
    fontSize: 23,
    fontWeight: "700",
    marginLeft: 10,
  },

  content: { padding: 16, paddingBottom: 40 },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  loadingText: { color: "#64748B", fontWeight: "700" },

  section: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    minHeight: 280,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0E2D52",
    textAlign: "center",
    marginBottom: 14,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14,
  },

  card: {
    paddingTop: 30,
    width: "48%",
    minHeight: 165,
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
  },

  circle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    overflow: "hidden",
  },

  avatar: {
    width: 74,
    height: 74,
    transform: [{ scale: 1.10 }, { translateX: 4 }, { translateY: 3 }],
  },

  cardName: {
    color: "#0E2D52",
    fontWeight: "800",
    fontSize: 13,
    textAlign: "center",
  },

  cardNumber: {
    marginTop: 4,
    color: "#0E2D52",
    fontWeight: "900",
    fontSize: 12,
    textAlign: "center",
  },
});