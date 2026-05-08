import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";

export default function PayslipScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [payslips, setPayslips] = useState<
    { id: string; pay_period_start: string; pay_period_end: string; gross_salary: number; net_salary: number; payment_date: string | null }[]
  >([]);

  const formatMonthLabel = useCallback((startDate: string) => {
    const date = new Date(startDate);
    if (Number.isNaN(date.getTime())) return startDate;
    return date.toLocaleString(undefined, { month: "long", year: "numeric" });
  }, []);

  const formatMoney = useCallback((amount: number) => {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: "SGD" }).format(amount);
    } catch {
      return `$${amount.toFixed(2)}`;
    }
  }, []);

  const load = useCallback(async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id ?? null;
    if (!userId) {
      Alert.alert("Load failed", sessionError?.message ?? "Unable to validate your session.");
      return;
    }

    const { data, error } = await supabase
      .from("payslips")
      .select("id, pay_period_start, pay_period_end, gross_salary, net_salary, payment_date")
      .eq("employee_id", userId)
      .order("pay_period_start", { ascending: false });

    if (error) {
      Alert.alert("Load failed", error.message);
      setPayslips([]);
      return;
    }

    setPayslips((data as any[]) ?? []);
  }, []);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      setLoading(true);
      await load();
      if (alive) setLoading(false);
    };
    void run();
    return () => {
      alive = false;
    };
  }, [load]);

  const hasPayslips = useMemo(() => payslips.length > 0, [payslips.length]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <ChevronLeft size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>Payslip</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Recent Payslips</Text>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : hasPayslips ? (
          payslips.map((slip) => (
            <Pressable
              key={slip.id}
              style={styles.card}
              onPress={() =>
                router.push({
                  pathname: "/securityofficer/payslip-details",
                  params: { id: slip.id },
                })
              }
            >
              <Text style={styles.cardTitle}>{formatMonthLabel(slip.pay_period_start)}</Text>
              <Text style={styles.cardMeta}>Net Pay: {formatMoney(Number(slip.net_salary ?? 0))}</Text>
              <Text style={styles.cardMeta}>Gross Pay: {formatMoney(Number(slip.gross_salary ?? 0))}</Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.bodyText}>No payslips yet.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backBtn: { width: 40, height: 40, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  headerSpacer: { width: 40, height: 40 },
  content: { padding: 16, paddingBottom: 28 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A", marginBottom: 8 },
  bodyText: { color: "#334155", lineHeight: 20, marginBottom: 14 },
  center: { paddingVertical: 24, alignItems: "center" },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  cardMeta: { marginTop: 4, color: "#475569" },
});
