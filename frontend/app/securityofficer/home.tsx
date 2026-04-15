import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");

  // Fetch user name for the currently authenticated user.
  useEffect(() => {
    let isMounted = true;

    const getProfile = async () => {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      if (sessionError || !userId) return;

      const { data, error } = await supabase
        .from("employees")
        .select("first_name")
        .eq("id", userId)
        .maybeSingle();

      if (!error && data?.first_name && isMounted) {
        setName(data.first_name);
      }
    };

    getProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <View style={styles.root}>
      {/* 🔹 Welcome */}
      <Text style={styles.title}>Welcome, {name || "Officer"}</Text>

      {/* Buttons */}
      <Pressable
        style={styles.card}
        onPress={() => router.push("/securityofficer/dashboard")}
      >
        <Text style={styles.cardText}>Dashboard</Text>
      </Pressable>

      <Pressable
        style={styles.card}
        onPress={() => router.push("/securityofficer/reports")}
      >
        <Text style={styles.cardText}>Reports</Text>
      </Pressable>

      <Pressable
        style={styles.card}
        onPress={() => router.push("/securityofficer/incidents")}
      >
        <Text style={styles.cardText}>Incidents</Text>
      </Pressable>

      {/* Logout */}
      <Pressable onPress={handleLogout} style={styles.logoutBtn}>
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    gap: 16,
    backgroundColor: "#F5F7FA",
  },

  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 20,
    textAlign: "center",
  },

  card: {
    backgroundColor: "#0E2D52",
    padding: 18,
    borderRadius: 12,
  },

  cardText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  logoutBtn: {
    marginTop: 30,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#ccc",
    alignItems: "center",
  },

  logoutText: {
    fontWeight: "600",
  },
});
