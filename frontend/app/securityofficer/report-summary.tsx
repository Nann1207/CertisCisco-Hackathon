import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";

type ReportRecord = Record<string, unknown>;

export default function ReportSummaryScreen() {
	const router = useRouter();
	const { reportId } = useLocalSearchParams<{ reportId?: string }>();

	const [loading, setLoading] = useState(true);
	const [report, setReport] = useState<ReportRecord | null>(null);

	useEffect(() => {
		let alive = true;

		const load = async () => {
			if (!reportId) {
				if (alive) {
					setLoading(false);
					Alert.alert("Missing report", "Unable to load report summary.");
				}
				return;
			}

			setLoading(true);
			const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
			const userId = sessionData.session?.user.id ?? null;
			if (!userId) {
				if (alive) {
					setLoading(false);
					Alert.alert("Load failed", sessionError?.message ?? "Unable to load user session.");
				}
				return;
			}

			let result = await supabase
				.from("reports")
				.select("*")
				.eq("officer_id", userId)
				.eq("report_id", reportId)
				.maybeSingle();

			if (result.error || !result.data) {
				result = await supabase
					.from("reports")
					.select("*")
					.eq("officer_id", userId)
					.eq("id", reportId)
					.maybeSingle();
			}

			if (!alive) return;

			if (result.error || !result.data) {
				setLoading(false);
				Alert.alert("Load failed", result.error?.message ?? "Report not found.");
				return;
			}

			setReport(result.data as ReportRecord);
			setLoading(false);
		};

		void load();
		return () => {
			alive = false;
		};
	}, [reportId]);

	const summaryRows = useMemo(() => {
		if (!report) return [] as { label: string; value: string }[];
		return [
			{ label: "Report Type", value: readString(report.report_type) },
			{ label: "Incident Category", value: readString(report.incident_category) },
			{ label: "Incident Location", value: readString(report.incident_location) },
			{ label: "Incident Date", value: formatDateTime(report.incident_date) },
			{ label: "Start Time", value: formatDateTime(report.start_time) },
			{ label: "Handover Time", value: formatDateTime(report.handover_time) },
			{ label: "Resolved Time", value: formatDateTime(report.resolved_time) },
			{ label: "Duty Officer", value: readString(report.duty_officer_name) },
			{ label: "Supervisor Incharge", value: readString(report.supervisor_incharge_name) },
			{ label: "Submitted At", value: formatDateTime(report.created_at) },
			{ label: "Incident Description", value: readString(report.incident_description) },
			{ label: "Handover Instructions", value: readString(report.handover_instructions) },
		];
	}, [report]);

	return (
		<SafeAreaView style={styles.root}>
			<View style={styles.header}>
				<Pressable
					style={styles.backBtn}
					onPress={() =>
						router.canGoBack() ? router.back() : router.replace("/securityofficer/reports")
					}
				>
					<ChevronLeft size={24} color="#FFFFFF" strokeWidth={2.6} />
				</Pressable>
				<Text style={styles.headerTitle}>Report Summary</Text>
				<View style={styles.headerSpacer} />
			</View>

			{loading ? (
				<View style={styles.loaderWrap}>
					<ActivityIndicator color="#0E2D52" />
				</View>
			) : (
				<ScrollView contentContainerStyle={styles.content}>
					{summaryRows.map((row) => (
						<View key={row.label} style={styles.rowCard}>
							<Text style={styles.rowLabel}>{row.label}</Text>
							<Text style={styles.rowValue}>{row.value}</Text>
						</View>
					))}
				</ScrollView>
			)}
		</SafeAreaView>
	);
}

function readString(value: unknown) {
	if (typeof value !== "string") return "-";
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : "-";
}

function formatDateTime(value: unknown) {
	if (typeof value !== "string") return "-";
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return "-";
	return date.toLocaleString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: "#F3F6FA",
	},
	header: {
		paddingTop: 40,
		paddingBottom: 12,
		paddingHorizontal: 12,
		backgroundColor: "#0E2D52",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
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
		fontSize: 27,
		fontWeight: "700",
		color: "#FFFFFF",
	},
	headerSpacer: {
		width: 40,
		height: 40,
	},
	loaderWrap: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	content: {
		paddingHorizontal: 14,
		paddingTop: 14,
		paddingBottom: 24,
		gap: 10,
	},
	rowCard: {
		backgroundColor: "#FFFFFF",
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#DCE3EC",
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	rowLabel: {
		fontSize: 12,
		fontWeight: "700",
		color: "#4B5563",
		marginBottom: 4,
	},
	rowValue: {
		fontSize: 14,
		lineHeight: 20,
		fontWeight: "600",
		color: "#0F172A",
	},
});
