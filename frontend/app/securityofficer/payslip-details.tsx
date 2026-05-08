import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, FileText, Minus } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

type PayslipSectionRow = { label: string; value: string; sublabel?: string };
type PayslipSection = { title: string; rows: PayslipSectionRow[]; totalLabel: string; totalValue: string };

type Employee = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  payment_mode: string | null;
  payment_bank_name: string | null;
  payment_bank_account: string | null;
  payment_paynow_id: string | null;
};

type PayslipRow = {
  id: string;
  employee_id: string;
  pay_period_start: string;
  pay_period_end: string;
  payment_date: string | null;
  gross_salary: number;
  net_salary: number;
  currency: string | null;
};

type PayslipItemRow = {
  id: string;
  category: "earnings" | "employer_contribution" | "cpf" | "deductions";
  label: string;
  sublabel: string | null;
  amount: number;
  sort_order: number;
};

const Divider = () => <View style={styles.divider} />;

export default function PayslipDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const payslipId = typeof id === "string" ? id : "";
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [payslip, setPayslip] = useState<PayslipRow | null>(null);
  const [items, setItems] = useState<PayslipItemRow[]>([]);

  const formatMoney = useCallback((amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
    } catch {
      return `$${amount.toFixed(2)}`;
    }
  }, []);

  const formatDdMmYyyy = useCallback((raw: string | null) => {
    if (!raw) return "-";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }, []);

  const load = useCallback(async () => {
    if (!payslipId) return;

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id ?? null;
    if (!userId) {
      Alert.alert("Load failed", sessionError?.message ?? "Unable to validate your session.");
      return;
    }

    const { data: slipRow, error: slipError } = await supabase
      .from("payslips")
      .select("id, employee_id, pay_period_start, pay_period_end, payment_date, gross_salary, net_salary, currency")
      .eq("id", payslipId)
      .maybeSingle();

    if (slipError) {
      Alert.alert("Load failed", slipError.message);
      return;
    }

    const slip = (slipRow as PayslipRow | null) ?? null;
    if (!slip) {
      Alert.alert("Load failed", "Payslip not found.");
      return;
    }

    if (slip.employee_id !== userId) {
      Alert.alert("Load failed", "You do not have access to this payslip.");
      return;
    }

    setPayslip(slip);

    const { data: empRow, error: empError } = await supabase
      .from("employees")
      .select(
        "id, first_name, last_name, role, payment_mode, payment_bank_name, payment_bank_account, payment_paynow_id"
      )
      .eq("id", slip.employee_id)
      .maybeSingle();

    if (empError) {
      Alert.alert("Load failed", empError.message);
      return;
    }

    setEmployee((empRow as Employee | null) ?? null);

    const { data: itemRows, error: itemError } = await supabase
      .from("payslip_items")
      .select("id, category, label, sublabel, amount, sort_order")
      .eq("payslip_id", payslipId)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });

    if (itemError) {
      Alert.alert("Load failed", itemError.message);
      setItems([]);
      return;
    }

    setItems(((itemRows as PayslipItemRow[] | null) ?? []).filter(Boolean));
  }, [payslipId]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!payslipId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      await load();
      if (alive) setLoading(false);
    };
    void run();
    return () => {
      alive = false;
    };
  }, [load, payslipId]);

  const fullName = useMemo(() => {
    const first = employee?.first_name?.trim() ?? "";
    const last = employee?.last_name?.trim() ?? "";
    return `${first} ${last}`.trim() || "Employee";
  }, [employee?.first_name, employee?.last_name]);

  const roleText = employee?.role?.trim() || "Security Officer";

  const currency = payslip?.currency?.trim() || "SGD";

  const payPeriod = payslip
    ? `${formatDdMmYyyy(payslip.pay_period_start)} – ${formatDdMmYyyy(payslip.pay_period_end)}`
    : "-";

  const paymentDate = payslip?.payment_date ? formatDdMmYyyy(payslip.payment_date) : "-";

  const method = useMemo(() => {
    const mode = employee?.payment_mode?.trim();
    if (!mode) return "-";
    if (mode === "paynow") {
      return employee?.payment_paynow_id?.trim() ? `PayNow – ${employee.payment_paynow_id.trim()}` : "PayNow";
    }
    if (mode === "bank_transfer") {
      const bank = employee?.payment_bank_name?.trim() ?? "Bank Transfer";
      const acct = employee?.payment_bank_account?.trim() ?? "";
      const masked = acct.length >= 4 ? `****${acct.slice(-4)}` : acct;
      return acct ? `${bank} – ${masked}` : bank;
    }
    return mode;
  }, [employee?.payment_bank_account, employee?.payment_bank_name, employee?.payment_mode, employee?.payment_paynow_id]);

  const buildPayslipHtml = useCallback(() => {
    if (!payslip) return "";

    const escape = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const pdfSections: { key: PayslipItemRow["category"]; title: string; totalLabel: string }[] = [
      { key: "earnings", title: "Earnings", totalLabel: "Total earnings" },
      { key: "employer_contribution", title: "Employer contribution", totalLabel: "Total employer contribution" },
      { key: "cpf", title: "Total CPF", totalLabel: "Total CPF" },
      { key: "deductions", title: "Deductions", totalLabel: "Total deductions" },
    ];

    const sectionBlocks = pdfSections
      .map((section) => {
        const sectionItems = items.filter((it) => it.category === section.key);
        const total = sectionItems.reduce((sum, it) => sum + Number(it.amount ?? 0), 0);

        const rows =
          sectionItems.length === 0
            ? `<div class="empty">No items.</div>`
            : sectionItems
                .map((row) => {
                  const sub = row.sublabel ? `<div class="sub">${escape(row.sublabel)}</div>` : "";
                  return `<div class="row">
  <div class="left">
    <div class="label">${escape(row.label)}</div>
    ${sub}
  </div>
  <div class="val">${escape(formatMoney(Number(row.amount ?? 0), currency))}</div>
</div>`;
                })
                .join("");

        return `<div class="card">
  <div class="cardTitle">${escape(section.title)}</div>
  ${rows}
  <div class="hr"></div>
  <div class="total">
    <div class="tLabel">${escape(section.totalLabel)}</div>
    <div class="tVal">${escape(formatMoney(total, currency))}</div>
  </div>
</div>`;
      })
      .join("");

    const netSalary = formatMoney(Number(payslip.net_salary ?? 0), currency);
    const grossSalary = formatMoney(Number(payslip.gross_salary ?? 0), currency);
    const generatedAt = new Date().toLocaleString();

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root { --bg:#F1F5F9; --card:#ffffff; --ink:#0F172A; --muted:#475569; --blue:#1E64A6; --blue2:#0B3D73; }
      *{ box-sizing:border-box; }
      @page { margin: 18px; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; background:var(--bg); color:var(--ink); }
      .wrap{ padding:18px; }
      .topMeta{ display:flex; justify-content:space-between; color:#64748B; font-size:12px; margin-bottom:10px; }
      .hero{ background:var(--blue); color:#fff; border-radius:18px; padding:18px; }
      .name{ font-weight:900; font-size:20px; }
      .pill{ display:inline-block; margin-top:10px; background:rgba(255,255,255,.88); color:var(--blue2); border-radius:999px; padding:6px 12px; font-weight:900; font-size:13px; }
      .heroHr{ height:1px; background:rgba(255,255,255,.22); margin:14px 0; }
      .heroRow{ display:flex; justify-content:space-between; gap:14px; margin-bottom:8px; font-size:13px; }
      .heroLbl{ opacity:.85; font-weight:700; }
      .heroVal{ font-weight:900; text-align:right; }
      .card{ background:var(--card); border-radius:18px; padding:16px; margin-top:14px; }
      .cardTitle{ font-weight:900; font-size:18px; margin-bottom:12px; display:flex; gap:10px; align-items:center; }
      .row{ display:flex; justify-content:space-between; gap:14px; margin-bottom:12px; }
      .left{ flex:1; }
      .label{ color:var(--muted); font-weight:700; }
      .sub{ margin-top:6px; color:#94A3B8; font-style:italic; font-size:12px; }
      .val{ font-weight:900; }
      .hr{ height:1px; background:#E2E8F0; margin:12px 0; }
      .total{ display:flex; justify-content:space-between; gap:14px; font-size:18px; font-weight:900; }
      .empty{ color:#94A3B8; font-style:italic; padding:6px 0 2px; }
      .net{ margin-top:14px; background:#E8F4FF; border:1px solid #B8DCFF; border-radius:18px; padding:16px; display:flex; justify-content:space-between; align-items:center; }
      .netLbl{ color:var(--blue); font-weight:800; }
      .netVal{ color:var(--blue2); font-weight:900; font-size:34px; margin-top:8px; }
      .summary{ margin-top:14px; background:#ffffff; border-radius:18px; padding:16px; }
      .summaryRow{ display:flex; justify-content:space-between; color:#0F172A; font-weight:800; margin-bottom:8px; }
      .summaryRow span:first-child{ color:#475569; font-weight:700; }
      .footer{ margin-top:14px; color:#94A3B8; font-size:11px; text-align:center; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="topMeta">
        <div>Payslip</div>
        <div>Generated: ${escape(generatedAt)}</div>
      </div>
      <div class="hero">
        <div class="name">${escape(fullName)}</div>
        <div class="pill">${escape(roleText)}</div>
        <div class="heroHr"></div>
        <div class="heroRow"><div class="heroLbl">Pay period</div><div class="heroVal">${escape(payPeriod)}</div></div>
        <div class="heroRow"><div class="heroLbl">Payment date</div><div class="heroVal">${escape(paymentDate)}</div></div>
        <div class="heroRow"><div class="heroLbl">Method</div><div class="heroVal">${escape(method)}</div></div>
      </div>
      <div class="summary">
        <div class="summaryRow"><span>Gross salary</span><span>${escape(grossSalary)}</span></div>
        <div class="summaryRow"><span>Net salary</span><span>${escape(netSalary)}</span></div>
      </div>
      ${sectionBlocks}
      <div class="net">
        <div>
          <div class="netLbl">Net salary</div>
          <div class="netVal">${escape(netSalary)}</div>
        </div>
      </div>
      <div class="footer">For reference only. Amounts are based on the records in the system.</div>
    </div>
  </body>
</html>`;
  }, [currency, formatMoney, fullName, items, method, payPeriod, paymentDate, payslip, roleText]);

  const generatePdf = useCallback(async () => {
    if (!payslip) return;
    const html = buildPayslipHtml();
    if (!html) return;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Payslip PDF" });
      } else {
        Alert.alert("PDF generated", `Saved to: ${uri}`);
      }
    } catch (e: any) {
      Alert.alert("Generate PDF failed", e?.message ?? "Unable to generate PDF.");
    }
  }, [buildPayslipHtml, payslip]);

  const sections: PayslipSection[] = useMemo(() => {
    const byCategory = new Map<PayslipItemRow["category"], PayslipItemRow[]>();
    items.forEach((item) => {
      const arr = byCategory.get(item.category) ?? [];
      arr.push(item);
      byCategory.set(item.category, arr);
    });

    const makeSection = (
      category: PayslipItemRow["category"],
      title: string,
      totalLabel: string
    ): PayslipSection | null => {
      const rows = byCategory.get(category) ?? [];
      if (rows.length === 0) return null;
      const total = rows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
      return {
        title,
        rows: rows.map((r) => ({
          label: r.label,
          value: formatMoney(Number(r.amount ?? 0), currency),
          sublabel: r.sublabel ?? undefined,
        })),
        totalLabel,
        totalValue: formatMoney(total, currency),
      };
    };

    return [
      makeSection("earnings", "Earnings", "Total earnings"),
      makeSection("employer_contribution", "Employer contribution", "Total employer contribution"),
      makeSection("cpf", "Total CPF", "Total CPF"),
      makeSection("deductions", "Deductions", "Total deductions"),
    ].filter(Boolean) as PayslipSection[];
  }, [currency, formatMoney, items]);

  if (!payslipId) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <ChevronLeft size={22} color="#0F172A" />
          </Pressable>
          <Text style={styles.headerTitle}>Payslip</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.center}>
          <Text style={styles.bodyText}>Missing payslip id.</Text>
        </View>
      </SafeAreaView>
    );
  }

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
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : !payslip ? (
          <Text style={styles.bodyText}>Payslip not found.</Text>
        ) : (
          <>
            <View style={styles.heroCard}>
              <Text style={styles.heroName}>{fullName}</Text>
              <View style={styles.heroPill}>
                <Text style={styles.heroPillText}>{roleText}</Text>
              </View>
              <Divider />
              <View style={styles.heroRow}>
                <Text style={styles.heroLabel}>Pay period</Text>
                <Text style={styles.heroValue}>{payPeriod}</Text>
              </View>
              <View style={styles.heroRow}>
                <Text style={styles.heroLabel}>Payment date</Text>
                <Text style={styles.heroValue}>{paymentDate}</Text>
              </View>
              <View style={styles.heroRow}>
                <Text style={styles.heroLabel}>Method</Text>
                <Text style={styles.heroValue} numberOfLines={2}>
                  {method}
                </Text>
              </View>
            </View>

            {sections.map((section) => (
              <View key={section.title} style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  {section.title === "Deductions" ? (
                    <View style={styles.sectionDeductionBadge}>
                      <Minus size={14} color="#1E64A6" strokeWidth={3} />
                    </View>
                  ) : null}
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                </View>
                {section.rows.map((row) => (
                  <View key={`${section.title}-${row.label}`} style={styles.itemRow}>
                    <View style={styles.itemLeft}>
                      <Text style={styles.itemLabel}>{row.label}</Text>
                      {row.sublabel ? <Text style={styles.itemSubLabel}>{row.sublabel}</Text> : null}
                    </View>
                    <Text style={styles.itemValue}>{row.value}</Text>
                  </View>
                ))}
                <Divider />
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{section.totalLabel}</Text>
                  <Text style={styles.totalValue}>{section.totalValue}</Text>
                </View>
              </View>
            ))}

            <View style={styles.netCard}>
              <View style={styles.netLeft}>
                <Text style={styles.netLabel}>Net salary</Text>
                <Text style={styles.netValue}>{formatMoney(Number(payslip.net_salary ?? 0), currency)}</Text>
              </View>
            </View>

            <Pressable
              style={styles.pdfBtn}
              onPress={() => void generatePdf()}
            >
              <FileText size={18} color="#FFFFFF" />
              <Text style={styles.pdfBtnText}>Generate PDF</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F1F5F9" },
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
  center: { padding: 24, alignItems: "center" },
  bodyText: { color: "#334155", lineHeight: 20 },
  heroCard: {
    backgroundColor: "#1E64A6",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  heroName: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  heroPill: {
    alignSelf: "flex-start",
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroPillText: { color: "#0B3D73", fontWeight: "900" },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.22)", marginVertical: 14 },
  heroRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8, gap: 14 },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontWeight: "700" },
  heroValue: { color: "#FFFFFF", fontWeight: "900", flexShrink: 1, textAlign: "right" },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 10 },
  sectionDeductionBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#E8F4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: "#0F172A" },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 14 },
  itemLeft: { flex: 1 },
  itemLabel: { color: "#475569", fontWeight: "700", fontSize: 16 },
  itemSubLabel: { marginTop: 6, color: "#94A3B8", fontStyle: "italic" },
  itemValue: { color: "#0F172A", fontWeight: "900", fontSize: 16 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 14 },
  totalLabel: { color: "#0F172A", fontWeight: "900", fontSize: 18 },
  totalValue: { color: "#0F172A", fontWeight: "900", fontSize: 18 },
  netCard: {
    backgroundColor: "#E8F4FF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#B8DCFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  netLeft: {},
  netLabel: { color: "#1E64A6", fontWeight: "800" },
  netValue: { color: "#0B3D73", fontWeight: "900", fontSize: 36, marginTop: 8 },
  pdfBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: "#1E64A6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  pdfBtnText: { color: "#FFFFFF", fontWeight: "900", fontSize: 16 },
});
