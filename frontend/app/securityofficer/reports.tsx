import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { ChevronLeft } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";

type AssignedIncident = {
	id: string;
	incident_category: string | null;
	location_unit_no: string | null;
	location_description: string | null;
	created_at: string | null;
};

type AssignedIncidentRow = {
	incident_id: string | null;
	active_status: boolean | null;
	assigned_at: string | null;
	incidents:
		| {
				incident_id: string;
				incident_category: string | null;
				location_unit_no: string | null;
				location_description: string | null;
				created_at: string | null;
		  }
		| {
				incident_id: string;
				incident_category: string | null;
				location_unit_no: string | null;
				location_description: string | null;
				created_at: string | null;
		  }[]
		| null;
};

type PastReport = {
	reportId: string;
	reportType: string;
	incidentCategory: string;
	incidentLocation: string;
	createdAt: string | null;
};

export default function ReportsScreen() {
	const router = useRouter();
	const [loading, setLoading] = useState(true);
	const [assignedIncidents, setAssignedIncidents] = useState<AssignedIncident[]>([]);
	const [pastReports, setPastReports] = useState<PastReport[]>([]);

	useEffect(() => {
		let alive = true;

		const load = async () => {
			setLoading(true);
			const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
			const userId = sessionData.session?.user.id ?? null;

			if (!userId) {
				if (alive) {
					Alert.alert("Load failed", sessionError?.message ?? "Unable to load user session.");
					setLoading(false);
				}
				return;
			}

			const { data: activeData, error: activeError } = await supabase
				.from("incident_assignments")
				.select(
					"incident_id, active_status, assigned_at, incidents(incident_id, incident_category, location_unit_no, location_description, created_at)"
				)
				.eq("officer_id", userId)
				.eq("active_status", true)
				.order("assigned_at", { ascending: false })
				.limit(120);

			const { data: reportsData, error: reportsError } = await supabase
				.from("reports")
				.select("*")
				.eq("officer_id", userId)
				.order("created_at", { ascending: false })
				.limit(120);

			if (!alive) return;

			if (activeError || reportsError) {
				Alert.alert("Load failed", activeError?.message ?? reportsError?.message ?? "Unknown error");
				setAssignedIncidents([]);
				setPastReports([]);
				setLoading(false);
				return;
			}

			const mappedIncidents = ((activeData as AssignedIncidentRow[] | null) ?? [])
				.map((row) => {
					const incident = Array.isArray(row.incidents) ? row.incidents[0] : row.incidents;
					if (!incident?.incident_id) return null;
					return {
						id: incident.incident_id,
						incident_category: incident.incident_category,
						location_unit_no: incident.location_unit_no,
						location_description: incident.location_description,
						created_at: incident.created_at,
					} satisfies AssignedIncident;
				})
				.filter((item): item is AssignedIncident => Boolean(item));

			const mappedPastReports = ((reportsData as Record<string, unknown>[] | null) ?? [])
				.map((row) => {
					const parsedReportId = toReportId(row.report_id ?? row.id);
					if (!parsedReportId) return null;

					const reportType = typeof row.report_type === "string" ? row.report_type : "Report";
					const incidentCategory =
						typeof row.incident_category === "string" && row.incident_category.trim()
							? row.incident_category
							: "Incident";
					const incidentLocation =
						typeof row.incident_location === "string" && row.incident_location.trim()
							? row.incident_location
							: "Location unavailable";
					const createdAt = typeof row.created_at === "string" ? row.created_at : null;

					return {
						reportId: parsedReportId,
						reportType,
						incidentCategory,
						incidentLocation,
						createdAt,
					} satisfies PastReport;
				})
				.filter((item): item is PastReport => Boolean(item));

			setAssignedIncidents(mappedIncidents);
			setPastReports(mappedPastReports);
			setLoading(false);
		};

		void load();
		return () => {
			alive = false;
		};
	}, []);

	useFocusEffect(
		React.useCallback(() => {
			let active = true;
			const refresh = async () => {
				const { data: sessionData } = await supabase.auth.getSession();
				const userId = sessionData.session?.user.id ?? null;
				if (!active || !userId) return;

				const { data } = await supabase
					.from("reports")
					.select("*")
					.eq("officer_id", userId)
					.order("created_at", { ascending: false })
					.limit(120);

				if (!active) return;

				const mapped = ((data as Record<string, unknown>[] | null) ?? [])
					.map((row) => {
						const parsedReportId = toReportId(row.report_id ?? row.id);
						if (!parsedReportId) return null;

						const reportType = typeof row.report_type === "string" ? row.report_type : "Report";
						const incidentCategory =
							typeof row.incident_category === "string" && row.incident_category.trim()
								? row.incident_category
								: "Incident";
						const incidentLocation =
							typeof row.incident_location === "string" && row.incident_location.trim()
								? row.incident_location
								: "Location unavailable";
						const createdAt = typeof row.created_at === "string" ? row.created_at : null;

						return {
							reportId: parsedReportId,
							reportType,
							incidentCategory,
							incidentLocation,
							createdAt,
						} satisfies PastReport;
					})
					.filter((item): item is PastReport => Boolean(item));

				setPastReports(mapped);
			};

			void refresh();
			return () => {
				active = false;
			};
		}, [])
	);

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.header}>
				<Pressable
					style={styles.backBtn}
					onPress={() =>
						router.canGoBack() ? router.back() : router.replace("/securityofficer/home")
					}
				>
					<ChevronLeft size={24} color="#FFFFFF" strokeWidth={2.6} />
				</Pressable>
				<Text style={styles.headerTitle}>Reports</Text>
			</View>
			<ScrollView contentContainerStyle={styles.content}>
				<Text style={styles.subtitle}>Write reports for active incidents and review submitted reports.</Text>

				{loading ? (
					<View style={styles.loaderWrap}>
						<ActivityIndicator color="#0E2D52" />
					</View>
				) : (
					<>
						<Text style={styles.sectionTitle}>Active Incidents</Text>
						{assignedIncidents.length === 0 ? (
							<View style={styles.emptyWrap}>
								<Text style={styles.emptyText}>No active incidents assigned to you.</Text>
								<Pressable style={styles.secondaryBtn} onPress={() => router.push("/securityofficer/incidents")}>
									<Text style={styles.secondaryBtnText}>Go To Incidents</Text>
								</Pressable>
							</View>
						) : (
							assignedIncidents.map((incident) => (
								<View key={incident.id} style={styles.card}>
									<Text style={styles.cardTitle}>{incident.incident_category ?? "Uncategorized Incident"}</Text>
									<Text style={styles.cardMeta}>{formatIncidentMeta(incident)}</Text>
									<Pressable
										style={styles.primaryBtn}
										onPress={() => router.push(`/securityofficer/createReport?incidentId=${incident.id}`)}
									>
										<Text style={styles.primaryBtnText}>Write Report</Text>
									</Pressable>
								</View>
							))
						)}

						<Text style={styles.sectionTitle}>Past Reports</Text>
						{pastReports.length === 0 ? (
							<View style={styles.emptyWrap}>
								<Text style={styles.emptyText}>No submitted reports yet.</Text>
							</View>
						) : (
							pastReports.map((report) => (
								<Pressable
									key={report.reportId}
									style={styles.card}
									onPress={() => router.push(`/securityofficer/report-summary?reportId=${report.reportId}`)}
								>
									<Text style={styles.cardTitle}>{`${report.reportType} • ${report.incidentCategory}`}</Text>
									<Text style={styles.cardMeta}>{report.incidentLocation}</Text>
									<Text style={styles.reportDateText}>{formatReportDate(report.createdAt)}</Text>
									<Text style={styles.openSummaryText}>{"View Summary >"}</Text>
								</Pressable>
							))
						)}
					</>
				)}
			</ScrollView>
		</SafeAreaView>
	);
}

function formatIncidentMeta(incident: AssignedIncident) {
	const unit = incident.location_unit_no?.trim() ?? "";
	const desc = incident.location_description?.trim() ?? "";
	const createdAt = incident.created_at ? new Date(incident.created_at) : null;
	const timeLabel =
		createdAt && Number.isFinite(createdAt.getTime())
			? createdAt.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
			: "Unknown time";
	return [unit, desc, timeLabel].filter(Boolean).join(" • ");
}

function formatReportDate(value: string | null) {
	if (!value) return "Unknown time";
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return "Unknown time";
	return date.toLocaleString("en-GB", {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function toReportId(value: unknown) {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}
	return null;
}

const styles = StyleSheet.create({
	container: {
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
		fontSize: 27,
		fontWeight: "700",
		color: "#FFFFFF",
		marginLeft: 10,
	},
	content: {
		paddingHorizontal: 16,
		paddingTop: 16,
		paddingBottom: 24,
	},
	subtitle: {
		fontSize: 15,
		color: "#5E6A78",
		marginBottom: 12,
	},
	sectionTitle: {
		fontSize: 17,
		fontWeight: "700",
		color: "#0F2A46",
		marginTop: 6,
		marginBottom: 8,
	},
	loaderWrap: {
		height: 180,
		alignItems: "center",
		justifyContent: "center",
	},
	emptyWrap: {
		paddingVertical: 12,
		alignItems: "flex-start",
	},
	emptyText: {
		fontSize: 14,
		color: "#5E6A78",
		marginBottom: 10,
	},
	card: {
		backgroundColor: "#FFFFFF",
		borderWidth: 1,
		borderColor: "#E3E8EF",
		borderRadius: 14,
		paddingHorizontal: 12,
		paddingTop: 10,
		paddingBottom: 12,
		marginBottom: 10,
	},
	cardTitle: {
		fontSize: 15,
		fontWeight: "700",
		color: "#1E2A38",
		marginBottom: 4,
	},
	cardMeta: {
		fontSize: 13,
		color: "#5E6A78",
		marginBottom: 8,
	},
	reportDateText: {
		fontSize: 12,
		color: "#64748B",
		fontWeight: "600",
	},
	openSummaryText: {
		marginTop: 8,
		fontSize: 13,
		fontWeight: "700",
		color: "#0E2D52",
	},
	primaryBtn: {
		height: 38,
		borderRadius: 10,
		backgroundColor: "#0E2D52",
		paddingHorizontal: 16,
		alignItems: "center",
		justifyContent: "center",
		alignSelf: "flex-start",
	},
	primaryBtnText: {
		color: "#FFFFFF",
		fontWeight: "700",
		fontSize: 14,
	},
	secondaryBtn: {
		height: 36,
		borderRadius: 10,
		backgroundColor: "#0E2D52",
		paddingHorizontal: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	secondaryBtnText: {
		color: "#FFFFFF",
		fontWeight: "700",
		fontSize: 14,
	},
});
