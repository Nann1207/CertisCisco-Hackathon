import React, { useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	RefreshControl,
	SafeAreaView,
	ScrollView,
	StyleSheet,
	View,
} from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, FileText, MapPin, NotebookPen, ShieldCheck } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";

type IncidentRow = {
	incident_id: string;
	incident_category?: string | null;
	location_name?: string | null;
	location_unit_no?: string | null;
	location_description?: string | null;
	created_at?: string | null;
	active_status?: boolean | null;
};

type ReportRow = {
	id?: string | null;
	incident_id?: string | null;
	report_type?: string | null;
	incident_category?: string | null;
	incident_location?: string | null;
	duty_officer_name?: string | null;
	supervisor_incharge_name?: string | null;
	created_at?: string | null;
	handover_time?: string | null;
	resolved_time?: string | null;
};

export default function SsoReportsScreen() {
	const router = useRouter();

	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [incidents, setIncidents] = useState<IncidentRow[]>([]);
	const [reports, setReports] = useState<ReportRow[]>([]);

	const load = async (isRefresh = false) => {
		if (!isRefresh) setLoading(true);
		if (isRefresh) setRefreshing(true);

		const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
		const userId = sessionData.session?.user.id ?? null;

		if (!userId) {
			if (!isRefresh) setLoading(false);
			if (isRefresh) setRefreshing(false);
			Alert.alert("Load failed", sessionError?.message ?? "Unable to load user session.");
			return;
		}

		const { data: incidentRows, error: incidentError } = await supabase
			.from("incidents")
			.select(
				"incident_id, incident_category, location_name, location_unit_no, location_description, created_at, active_status"
			)
			.eq("supervisor_id", userId)
			.order("created_at", { ascending: false })
			.limit(500);

		if (incidentError) {
			if (!isRefresh) setLoading(false);
			if (isRefresh) setRefreshing(false);
			Alert.alert("Load failed", incidentError.message);
			return;
		}

		const nextIncidents = (incidentRows as IncidentRow[] | null) ?? [];
		setIncidents(nextIncidents);

		const incidentIds = nextIncidents
			.map((item) => item.incident_id)
			.filter(Boolean);

		if (incidentIds.length === 0) {
			setReports([]);
			if (!isRefresh) setLoading(false);
			if (isRefresh) setRefreshing(false);
			return;
		}

		const { data: reportRows, error: reportError } = await supabase
			.from("reports")
			.select(
				"id, incident_id, report_type, incident_category, incident_location, duty_officer_name, supervisor_incharge_name, created_at, handover_time, resolved_time"
			)
			.in("incident_id", incidentIds)
			.order("created_at", { ascending: false })
			.limit(500);

		if (reportError) {
			if (!isRefresh) setLoading(false);
			if (isRefresh) setRefreshing(false);
			Alert.alert("Load failed", reportError.message);
			return;
		}

		setReports((reportRows as ReportRow[] | null) ?? []);
		if (!isRefresh) setLoading(false);
		if (isRefresh) setRefreshing(false);
	};

	useEffect(() => {
		void load();
	}, []);

	const documentedIncidentIds = useMemo(
		() => new Set(reports.map((item) => item.incident_id).filter((id): id is string => Boolean(id))),
		[reports]
	);

	const pendingReports = useMemo(
		() => incidents.filter((incident) => !documentedIncidentIds.has(incident.incident_id)),
		[documentedIncidentIds, incidents]
	);

	const totalResolved = useMemo(
		() => reports.filter((item) => (item.report_type ?? "").toLowerCase() === "resolved").length,
		[reports]
	);

	return (
		<SafeAreaView style={styles.root}>
			<View style={styles.header}>
				<Pressable
					style={styles.backButton}
					onPress={() => (router.canGoBack() ? router.back() : router.replace("/sso/home"))}
				>
					<ChevronLeft size={24} color="#FFFFFF" strokeWidth={2.6} />
				</Pressable>
				<Text style={styles.headerTitle}>Reports</Text>
			</View>

			{loading ? (
				<View style={styles.loaderWrap}>
					<ActivityIndicator color="#0E2D52" />
				</View>
			) : (
				<ScrollView
					contentContainerStyle={styles.content}
					refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
				>
					<View style={styles.summaryCard}>
						<View style={styles.summaryItem}>
							<NotebookPen size={18} color="#B45309" />
							<Text style={[styles.summaryValue, { color: "#B45309" }]}>{pendingReports.length}</Text>
							<Text style={styles.summaryLabel}>To Be Made</Text>
						</View>
						<View style={styles.summaryDivider} />
						<View style={styles.summaryItem}>
							<FileText size={18} color="#0E2D52" />
							<Text style={styles.summaryValue}>{reports.length}</Text>
							<Text style={styles.summaryLabel}>Past Reports</Text>
						</View>
						<View style={styles.summaryDivider} />
						<View style={styles.summaryItem}>
							<ShieldCheck size={18} color="#1D7A3E" />
							<Text style={[styles.summaryValue, { color: "#1D7A3E" }]}>{totalResolved}</Text>
							<Text style={styles.summaryLabel}>Resolved</Text>
						</View>
					</View>

					<Text style={styles.sectionTitle}>Reports To Be Made</Text>
					{pendingReports.length === 0 ? (
						<Text style={styles.emptyText}>All incidents already have documentation.</Text>
					) : (
						pendingReports.map((incident) => {
							const location = [
								incident.location_name?.trim() ?? "",
								incident.location_unit_no?.trim() ? `#${incident.location_unit_no.trim()}` : "",
								incident.location_description?.trim() ?? "",
							]
								.filter(Boolean)
								.join(" ");

							const reportType = incident.active_status ? "Handover" : "Resolved";

							return (
								<View key={`pending-${incident.incident_id}`} style={styles.card}>
									<View style={styles.cardTopRow}>
										<View style={[styles.typeBadge, styles.pendingBadge]}>
											<Text style={styles.typeBadgeText}>{reportType.toUpperCase()}</Text>
										</View>
										<Text style={styles.dateText}>{formatDateTime(incident.created_at)}</Text>
									</View>

									<Text style={styles.titleText}>{incident.incident_category?.trim() || "Incident"}</Text>

									<View style={styles.locationRow}>
										<MapPin size={14} color="#6B7280" />
										<Text style={styles.locationText} numberOfLines={2}>
											{location || "Location unavailable"}
										</Text>
									</View>

									<View style={styles.metaRow}>
										<Text style={styles.metaLabel}>Documentation:</Text>
										<Text style={styles.metaValue}>
											{incident.active_status ? "Current incident needs handover/current report." : "Past incident needs final report."}
										</Text>
									</View>

									<Pressable
										style={styles.primaryBtn}
										onPress={() =>
											router.push(`/sso/createReport?incidentId=${incident.incident_id}&reportType=${reportType}`)
										}
									>
										<Text style={styles.primaryBtnText}>Create Report</Text>
									</Pressable>
								</View>
							);
						})
					)}

					<Text style={styles.sectionTitle}>Past Reports</Text>
					{reports.length === 0 ? (
						<Text style={styles.emptyText}>No past reports found.</Text>
					) : (
						reports.map((report, index) => (
							<View key={report.id ?? `${report.incident_id ?? "unknown"}-${index}`} style={styles.card}>
								<View style={styles.cardTopRow}>
									<View style={[styles.typeBadge, getTypeBadgeStyle(report.report_type)]}>
										<Text style={styles.typeBadgeText}>{(report.report_type ?? "REPORT").toUpperCase()}</Text>
									</View>
									<Text style={styles.dateText}>{formatDateTime(report.created_at)}</Text>
								</View>

								<Text style={styles.titleText}>{report.incident_category?.trim() || "Incident"}</Text>

								<View style={styles.locationRow}>
									<MapPin size={14} color="#6B7280" />
									<Text style={styles.locationText} numberOfLines={2}>{report.incident_location?.trim() || "Location unavailable"}</Text>
								</View>

								<View style={styles.metaRow}>
									<Text style={styles.metaLabel}>Duty Officer:</Text>
									<Text style={styles.metaValue}>{report.duty_officer_name?.trim() || "-"}</Text>
								</View>
								<View style={styles.metaRow}>
									<Text style={styles.metaLabel}>Supervisor:</Text>
									<Text style={styles.metaValue}>{report.supervisor_incharge_name?.trim() || "-"}</Text>
								</View>

								<View style={styles.metaRow}>
									<Text style={styles.metaLabel}>Final Time:</Text>
									<Text style={styles.metaValue}>{formatDateTime(report.resolved_time ?? report.handover_time ?? report.created_at)}</Text>
								</View>
							</View>
						))
					)}
				</ScrollView>
			)}
		</SafeAreaView>
	);
}

function getTypeBadgeStyle(reportType: string | null | undefined) {
	const type = (reportType ?? "").toLowerCase();
	if (type === "resolved") return { backgroundColor: "#1D7A3E" };
	if (type === "handover") return { backgroundColor: "#A65B00" };
	return { backgroundColor: "#334155" };
}

function formatDateTime(value: string | null | undefined) {
	if (!value) return "-";
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
		backgroundColor: "#F4F7FB",
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
		fontSize: 30,
		fontWeight: "800",
		color: "#FFFFFF",
		marginLeft: 10,
	},
	loaderWrap: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	content: {
		paddingHorizontal: 12,
		paddingVertical: 12,
		gap: 10,
	},
	summaryCard: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-evenly",
		backgroundColor: "#FFFFFF",
		borderWidth: 1,
		borderColor: "#E2E8F0",
		borderRadius: 14,
		minHeight: 88,
	},
	summaryItem: {
		alignItems: "center",
		justifyContent: "center",
		gap: 3,
		minWidth: 120,
	},
	summaryDivider: {
		width: 1,
		alignSelf: "stretch",
		backgroundColor: "#E2E8F0",
	},
	summaryValue: {
		color: "#0E2D52",
		fontSize: 24,
		fontWeight: "900",
	},
	summaryLabel: {
		color: "#64748B",
		fontSize: 12,
		fontWeight: "600",
	},
	emptyText: {
		color: "#64748B",
		fontSize: 14,
		fontWeight: "600",
		marginTop: 4,
	},
	sectionTitle: {
		marginTop: 6,
		color: "#163A67",
		fontSize: 22,
		fontWeight: "800",
	},
	card: {
		borderRadius: 16,
		backgroundColor: "#FFFFFF",
		borderWidth: 1,
		borderColor: "#E2E8F0",
		paddingHorizontal: 12,
		paddingTop: 10,
		paddingBottom: 12,
	},
	cardTopRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	typeBadge: {
		minHeight: 24,
		borderRadius: 999,
		paddingHorizontal: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	typeBadgeText: {
		color: "#FFFFFF",
		fontSize: 12,
		fontWeight: "800",
		letterSpacing: 0.5,
	},
	pendingBadge: {
		backgroundColor: "#B45309",
	},
	dateText: {
		color: "#6B7280",
		fontSize: 12,
		fontWeight: "600",
	},
	titleText: {
		marginTop: 10,
		color: "#0F172A",
		fontSize: 22,
		fontWeight: "800",
	},
	locationRow: {
		marginTop: 6,
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 6,
	},
	locationText: {
		color: "#4B5563",
		fontSize: 13,
		fontWeight: "600",
		flex: 1,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 6,
		gap: 6,
	},
	metaLabel: {
		color: "#64748B",
		fontSize: 12,
		fontWeight: "700",
	},
	metaValue: {
		color: "#0F172A",
		fontSize: 12,
		fontWeight: "700",
		flex: 1,
	},
	primaryBtn: {
		marginTop: 12,
		alignSelf: "flex-end",
		minHeight: 34,
		borderRadius: 999,
		backgroundColor: "#0E2D52",
		paddingHorizontal: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	primaryBtnText: {
		color: "#FFFFFF",
		fontSize: 13,
		fontWeight: "700",
	},
});
