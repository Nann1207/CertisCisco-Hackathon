import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  ImageBackground,
  Pressable,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import {
  Settings,
  Languages,
  Bell,
  CreditCard,
  FileText,
  ShieldAlert,
  Grid3X3,
} from "lucide-react-native";

import { styles } from "../../styles/securityofficer/home.styles";

type Profile = {
  id: string;
  emp_id: string;
  first_name: string;
  avatar_url: string | null;
};

type Shift = {
  id: string;
  start_at: string;
  end_at: string;
};

export default function Home() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [todayShift, setTodayShift] = useState<Shift | null>(null);
  const [todayIncidentSummary, setTodayIncidentSummary] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<Shift[]>([]);

  const AVATAR_BUCKET = "profile-photos";

  const USE_SIGNED_URL = true;

  const { dayStartISO, dayEndISO } = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { dayStartISO: start.toISOString(), dayEndISO: end.toISOString() };
  }, []);

  useEffect(() => {
    let alive = true;

    const getAvatarUrlFromFolder = async (userId: string) => {
      // Folder: employees/<authUserId>/
      const folder = `employees/${userId}`;

      const { data: files, error: listError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .list(folder, { limit: 10, sortBy: { column: "name", order: "asc" } });

      if (listError || !files || files.length === 0) return null;

      // pick the first real file (ignore folder placeholders if any)
      const file = files.find((f) => f.name && !f.name.endsWith("/")) ?? files[0];
      if (!file?.name) return null;

      const fullPath = `${folder}/${file.name}`;

      if (USE_SIGNED_URL) {
        const { data, error } = await supabase.storage
          .from(AVATAR_BUCKET)
          .createSignedUrl(fullPath, 60 * 60); // 1 hour
        if (error) return null;
        return data?.signedUrl ?? null;
      }

      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(fullPath);
      return data.publicUrl ?? null;
    };

    const getAvatarUrlFromPath = async (rawPath: string) => {
      // Accept both "employees/<id>/<file>" and "/employees/<id>/<file>".
      let path = rawPath.trim().replace(/^\/+/, "");
      // If bucket name is stored in DB path, strip it.
      if (path.startsWith(`${AVATAR_BUCKET}/`)) {
        path = path.slice(AVATAR_BUCKET.length + 1);
      }
      if (!path) return null;

      if (USE_SIGNED_URL) {
        const { data, error } = await supabase.storage
          .from(AVATAR_BUCKET)
          .createSignedUrl(path, 60 * 60);
        if (error) return null;
        return data?.signedUrl ?? null;
      }

      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      return data.publicUrl ?? null;
    };

    const load = async () => {
      setLoading(true);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      if (sessionError || !userId) {
        if (alive) setLoading(false);
        return;
      }

      // 1) Employee profile
      const { data: prof, error: profError } = await supabase
        .from("employees")
        .select("id, emp_id, first_name, profile_photo_path")
        .eq("id", userId)
        .maybeSingle();

      let avatarUrl: string | null = null;
      if (prof?.profile_photo_path) {
        avatarUrl = await getAvatarUrlFromPath(prof.profile_photo_path);
      }
      if (!avatarUrl) {
        // Fallback: list /employees/<authUserId>/ and use first file.
        avatarUrl = await getAvatarUrlFromFolder(userId);
      }

      // 2) Today shift (NOTE: your shifts table/columns may differ; adjust when ready)
      const { data: shift } = await supabase
        .from("shifts")
        .select("id, start_at, end_at")
        .eq("employee_id", userId)
        .gte("start_at", dayStartISO)
        .lte("start_at", dayEndISO)
        .order("start_at", { ascending: true })
        .maybeSingle();

      // 3) Upcoming schedule (next 5)
      const { data: upcomingShifts } = await supabase
        .from("shifts")
        .select("id, start_at, end_at")
        .eq("employee_id", userId)
        .gte("start_at", new Date().toISOString())
        .order("start_at", { ascending: true })
        .limit(5);

      // 4) Incidents: STRICT rule = no shift => no incidents section
      // Since incidents table is not ready yet, keep it simple:
      const incidentText = shift?.id ? "No incidents for today" : null;

      if (!alive) return;

      if (!profError && prof) {
        setProfile({
          id: prof.id,
          emp_id: prof.emp_id,
          first_name: prof.first_name,
          avatar_url: avatarUrl,
        });
      } else {
        setProfile(null);
      }

      setTodayShift(shift ?? null);
      setUpcoming(upcomingShifts ?? []);
      setTodayIncidentSummary(incidentText);
      setLoading(false);
    };

    load();

    return () => {
      alive = false;
    };
  }, [dayStartISO, dayEndISO]);

  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const name = profile?.first_name || "Officer";

  return (
    <View style={styles.root}>
      <ImageBackground
        source={require("./assets/header.png")}
        style={styles.header}
        imageStyle={styles.headerImage}
      >
        <View style={styles.headerTopRow}>
          <View style={styles.profileRow}>
            <Image
              source={
                profile?.avatar_url
                  ? { uri: profile.avatar_url }
                  : require("../../assets/fortis-logo.png")
              }
              style={styles.avatar}
            />
            <View>
              <Text style={styles.hiText}>Hi {name}!</Text>
              <Text style={styles.welcomeText}>Welcome Back</Text>
            </View>
          </View>

          <View style={styles.headerIcons}>
            <Pressable onPress={() => router.push("/(officer)/translate")}>
              <Languages color="#fff" size={22} />
            </Pressable>
            <Pressable onPress={() => router.push("/(officer)/notifications")}>
              <Bell color="#fff" size={22} />
            </Pressable>
            <Pressable onPress={() => router.push("/(officer)/settings")}>
              <Settings color="#fff" size={22} />
            </Pressable>
          </View>
        </View>

        <View style={styles.quickRow}>
          <QuickAction label="ID Card" Icon={CreditCard} onPress={() => router.push("/(officer)/id-card")} />
          <QuickAction label="Incidents" Icon={ShieldAlert} onPress={() => router.push("/(officer)/incidents")} />
          <QuickAction label="Reports" Icon={FileText} onPress={() => router.push("/(officer)/reports")} />
          <QuickAction label="All Services" Icon={Grid3X3} onPress={() => router.push("/(officer)/services")} />
        </View>
      </ImageBackground>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </Text>

        <Text style={styles.cardSubtitle}>
          {todayShift ? "Scheduled shift today" : "No scheduled shift today"}
        </Text>
      </View>

      {todayIncidentSummary && (
        <Pressable
          style={[styles.card, styles.incidentCard]}
          onPress={() => router.push("/(officer)/incidents")}
        >
          <Text style={[styles.cardTitle, { color: "#7C1515" }]}>Incidents</Text>
          <Text style={[styles.cardSubtitle, { color: "#7C1515" }]}>{todayIncidentSummary}</Text>
        </Pressable>
      )}

      <View style={styles.scheduleHeader}>
        <Text style={styles.sectionTitle}>Upcoming Schedule</Text>
        <Pressable onPress={() => router.push("/(officer)/schedule")}>
          <Text style={styles.viewAll}>View all &gt;</Text>
        </Pressable>
      </View>

      <FlatList
        data={upcoming}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 10, paddingBottom: 20 }}
        renderItem={({ item }) => (
          <View style={styles.shiftRow}>
            <Text style={styles.shiftDate}>
              {new Date(item.start_at).toLocaleDateString(undefined, {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </Text>
            <Text style={styles.shiftTime}>{formatTimeRange(item.start_at, item.end_at)}</Text>
          </View>
        )}
      />
    </View>
  );
}

function QuickAction({ label, Icon, onPress }: any) {
  return (
    <Pressable style={styles.quickAction} onPress={onPress}>
      <View style={styles.quickIcon}>
        <Icon color="#fff" size={22} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function formatTimeRange(startISO: string, endISO: string) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  return `${start.toLocaleTimeString([], opts)} - ${end.toLocaleTimeString([], opts)}`;
}
