import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Picker } from "@react-native-picker/picker";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../../styles/securityofficer/category";

export default function CategoryPage() {
  const { category } = useLocalSearchParams();
  const router = useRouter();

  const slug = category as string;

  const categoryMap: Record<string, string> = {
    "fire-evacuation": "Fire & Evacuation",
    robbery: "Robbery",
    violence: "Violence",
    "lift-alarm": "Lift Alarm",
    medical: "Medical",
    "bomb-threat": "Bomb Threat",
    "suspicious-item": "Suspicious Item",
    "suspicious-person": "Suspicious Person",
  };

  const emojiMap: Record<string, string> = {
    "fire-evacuation": "🔥",
    robbery: "🛡️",
    violence: "🚨",
    "lift-alarm": "🛗",
    medical: "🩺",
    "bomb-threat": "💣",
    "suspicious-item": "📦",
    "suspicious-person": "🕵️",
  };

  const decodedCategory = categoryMap[slug] ?? slug;

  const [titles, setTitles] = useState<string[]>([]);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [tab, setTab] = useState("Guidelines");
  const [mediaTab, setMediaTab] = useState<"Images" | "Videos" | "Quiz">(
    "Images"
  );

  useEffect(() => {
    fetchTitles();
  }, []);

  const fetchTitles = async () => {
    const { data } = await supabase
      .from("sop")
      .select("title")
      .eq("category", decodedCategory)
      .order("title", { ascending: true });

    const uniqueTitles = [...new Set(data?.map((d: any) => d.title))];

    setTitles(uniqueTitles);

    if (uniqueTitles.length > 0) {
      setSelectedTitle(uniqueTitles[0]);
    }
  };

  useEffect(() => {
    if (selectedTitle) fetchSteps(selectedTitle);
  }, [selectedTitle]);

  const fetchSteps = async (title: string) => {
    setLoading(true);

    const { data } = await supabase
      .from("sop")
      .select("*")
      .eq("title", title)
      .order("step_no");

    setSteps(data || []);
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      {/* 🔵 HEADER */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>

          <Text style={styles.headerTitle}>Service Of Operation</Text>
        </View>

        {/* DROPDOWN */}
        <View style={styles.dropdownBox}>
          <Ionicons name="list" size={18} color="#A0B0C0" />
          <View style={styles.pickerWrap}>
            <Picker
              mode="dropdown"
              selectedValue={selectedTitle}
              onValueChange={(value) => setSelectedTitle(value)}
              style={styles.picker}
              dropdownIconColor="#A0B0C0"
            >
              {titles.map((t) => (
                <Picker.Item key={t} label={t} value={t} />
              ))}
            </Picker>
          </View>
        </View>

        {/* PILLS */}
        <View style={styles.pillRow}>
          <Pressable
            style={[styles.pill, tab === "Guidelines" && styles.pillActive]}
            onPress={() => setTab("Guidelines")}
          >
            <Text
              style={[
                styles.pillText,
                tab === "Guidelines" && styles.pillTextActive,
              ]}
            >
              Guidelines
            </Text>
          </Pressable>

          <Pressable
            style={[styles.pill, tab === "Logistics" && styles.pillActive]}
            onPress={() => setTab("Logistics")}
          >
            <Text
              style={[
                styles.pillText,
                tab === "Logistics" && styles.pillTextActive,
              ]}
            >
              Logistics
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 🔽 CONTENT CARD */}
      <View style={styles.card}>
        {/* TITLE + EMOJI */}
        <View style={styles.cardTitleRow}>
          <View style={styles.emojiBadge}>
            <Text style={styles.emojiText}>{emojiMap[slug] ?? "📋"}</Text>
          </View>

          <Text style={styles.cardTitle}>{decodedCategory}</Text>
        </View>

        {/* META */}
        <Text style={styles.metaText}>{steps.length} Steps • ~3 min read</Text>

        {/* MEDIA CHIPS (clickable like Figma) */}
        <View style={styles.mediaTabRow}>
          <Pressable
            onPress={() => setMediaTab("Images")}
            style={[
              styles.mediaChip,
              mediaTab === "Images" && styles.mediaChipActive,
            ]}
          >
            <Ionicons
              name="image-outline"
              size={14}
              color={mediaTab === "Images" ? "#2563EB" : "#64748B"}
            />
            <Text
              style={[
                styles.mediaChipText,
                mediaTab === "Images" && styles.mediaChipTextActiveBlue,
              ]}
            >
              Images
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setMediaTab("Videos")}
            style={[
              styles.mediaChip,
              mediaTab === "Videos" && styles.mediaChipActive,
            ]}
          >
            <Ionicons
              name="play-circle-outline"
              size={14}
              color={mediaTab === "Videos" ? "#EF4444" : "#64748B"}
            />
            <Text
              style={[
                styles.mediaChipText,
                mediaTab === "Videos" && styles.mediaChipTextActiveRed,
              ]}
            >
              Videos
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setMediaTab("Quiz")}
            style={[
              styles.mediaChip,
              mediaTab === "Quiz" && styles.mediaChipActive,
            ]}
          >
            <Ionicons
              name="help-circle-outline"
              size={14}
              color={mediaTab === "Quiz" ? "#F59E0B" : "#64748B"}
            />
            <Text
              style={[
                styles.mediaChipText,
                mediaTab === "Quiz" && styles.mediaChipTextActiveOrange,
              ]}
            >
              Quiz
            </Text>
          </Pressable>
        </View>

        {/* PLACEHOLDER IMAGE BOX (for UI now) */}
        {mediaTab === "Images" ? (
          <View style={styles.heroPlaceholder}>
            <Text style={styles.heroPlaceholderText}>
              Category Image Placeholder
            </Text>
          </View>
        ) : null}

        {/* STEPS */}
        {loading ? (
          <ActivityIndicator />
        ) : (
          <FlatList
            data={steps}
            keyExtractor={(item) => item.step_no.toString()}
            renderItem={({ item }) => (
              <View style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{item.step_no}</Text>
                </View>

                <View style={styles.stepContent}>
                  <Text style={styles.stepShort}>{item.step_short}</Text>
                  <Text style={styles.stepDesc}>{item.step_description}</Text>
                </View>
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}