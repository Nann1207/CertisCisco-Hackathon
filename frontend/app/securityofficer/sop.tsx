import { View, Text, Pressable, SafeAreaView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../../styles/securityofficer/sop";

export default function SOPPage() {
  const router = useRouter();

  // 🔥 IMPORTANT: use SLUGS for routing (NOT labels)
  const categories = [
    {
      slug: "fire-evacuation",
      label: "Fire\n& Evacuation",
      color: "#FF3D3D",
      icon: "flame-outline" as const,
    },
    {
      slug: "robbery",
      label: "Robbery",
      color: "#3B82F6",
      icon: "shield-checkmark-outline" as const,
    },
    {
      slug: "violence",
      label: "Violence",
      color: "#EF4444",
      icon: "hand-left-outline" as const,
    },
    {
      slug: "lift-alarm",
      label: "Lift\nAlarm",
      color: "#6366F1",
      icon: "alert-circle-outline" as const,
    },
    {
      slug: "medical",
      label: "Medical\nEmergency",
      color: "#10B981",
      icon: "medkit-outline" as const,
    },
    {
      slug: "bomb-threat",
      label: "Bomb\nThreat",
      color: "#F68D2C",
      icon: "warning-outline" as const,
    },
    {
      slug: "suspicious-item",
      label: "Suspicious\nItem",
      color: "#41AAF5",
      icon: "help-circle-outline" as const,
    },
    {
      slug: "suspicious-person",
      label: "Suspicious\nPerson",
      color: "#F62CD8",
      icon: "help-circle-outline" as const,
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
        <Pressable
        onPress={() => router.replace("/securityofficer/home")}
        style={styles.backIcon}
        hitSlop={10}
        >
        <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>

          <Text style={styles.headerTitle}>Service Of Operation</Text>

          {/* spacer to keep title centered */}
          <View style={styles.rightSpacer} />
        </View>
      </View>

      {/* GRID */}
      <View style={styles.grid}>
        {categories.map((cat) => (
          <Pressable
            key={cat.slug}
            style={styles.card}
            onPress={() => router.push(`/securityofficer/${cat.slug}`)}
          >
            <View style={[styles.cardBar, { backgroundColor: cat.color }]} />

            {/* icon + title */}
            <View style={styles.cardTitleRow}>
              <Ionicons name={cat.icon} size={33} color={cat.color} />
              <Text style={styles.cardTitle}>{cat.label}</Text>
            </View>

            <Text style={styles.cardSubtitle}>Guidelines & Procedure</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}