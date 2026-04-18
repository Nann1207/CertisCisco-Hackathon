import React, { useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	ImageBackground,
	Modal,
	Pressable,
	SafeAreaView,
	ScrollView,
	StyleSheet,
	TextInput,
	View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronDown, ChevronLeft } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";

type ReportType = "Handover" | "Resolved";

type IncidentRow = {
	id: string;
	incident_category: string | null;
	location_unit_no: string | null;
	location_description: string | null;
	created_at: string | null;
};

type IncidentAssignmentRow = {
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

type ShiftRow = {
	supervisor_id: string | null;
	shift_start: string;
};

type EmployeeName = {
	first_name: string | null;
	last_name: string | null;
};

const INCIDENT_CATEGORIES = [
	"Fire & Evacuation",
	"Robbery",
	"Violence",
	"Lift Alarm",
	"Medical",
	"Bomb Threat",
	"Suspicious Item/Vehicle",
	"Suspicious Person",
] as const;

export default function CreateReportScreen() {
	const router = useRouter();
	const { incidentId, reportType: routeReportType } = useLocalSearchParams<{ incidentId?: string; reportType?: string }>();

	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	const [reportType, setReportType] = useState<ReportType>(
		routeReportType === "Resolved" ? "Resolved" : "Handover"
	);
	const [showSubmitSuccessModal, setShowSubmitSuccessModal] = useState(false);
	const [submittedReportType, setSubmittedReportType] = useState<ReportType>("Handover");

	const [incidents, setIncidents] = useState<IncidentRow[]>([]);
	const [selectedCategory, setSelectedCategory] = useState<string>(INCIDENT_CATEGORIES[0]);
	const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

	const [dutyOfficerName, setDutyOfficerName] = useState("-");
	const [supervisorName, setSupervisorName] = useState("-");

	const [incidentDescription, setIncidentDescription] = useState("");
	const [handoverInstructions, setHandoverInstructions] = useState("");

	const [now, setNow] = useState(new Date());

	useEffect(() => {
		const timer = setInterval(() => {
			setNow(new Date());
		}, 30 * 1000);

		return () => clearInterval(timer);
	}, []);

	useEffect(() => {
		if (routeReportType === "Resolved") {
			setReportType("Resolved");
		} else if (routeReportType === "Handover") {
			setReportType("Handover");
		}
	}, [routeReportType]);

	useEffect(() => {
		let alive = true;

		const loadData = async () => {
			setLoading(true);

			const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
			let userId = sessionData.session?.user.id ?? null;
			let userEmail = sessionData.session?.user.email ?? null;

			if (!userId || !userEmail) {
				const { data: userData } = await supabase.auth.getUser();
				userId = userId ?? userData.user?.id ?? null;
				userEmail = userEmail ?? userData.user?.email ?? null;
			}

			if (!userId) {
				if (alive) {
					setLoading(false);
					Alert.alert("Load failed", sessionError?.message ?? "Unable to load user session.");
				}
				return;
			}

			// Duty officer name from employees table (id match first, then email fallback).
			const { data: officerById } = await supabase
				.from("employees")
				.select("first_name, last_name")
				.eq("id", userId)
				.maybeSingle<EmployeeName>();

			let officer = officerById;
			if (!officer && userEmail) {
				const { data: officerByEmail } = await supabase
					.from("employees")
					.select("first_name, last_name")
					.eq("email", userEmail)
					.maybeSingle<EmployeeName>();
				officer = officerByEmail;
			}

			if (alive) {
				const name = `${(officer?.first_name ?? "").trim()} ${(officer?.last_name ?? "").trim()}`.trim();
				setDutyOfficerName(name || "-");
			}

			// Only incidents currently assigned (active assignment) to this officer can be reported by this officer.
			const assignmentsResult = await supabase
				.from("incident_assignments")
				.select(
					"incident_id, active_status, assigned_at, incidents(incident_id, incident_category, location_unit_no, location_description, created_at)"
				)
				.eq("officer_id", userId)
				.eq("active_status", true)
				.order("assigned_at", { ascending: false })
				.limit(120);

			const incidentsData = ((assignmentsResult.data as IncidentAssignmentRow[] | null) ?? [])
				.map((row) => {
					const incident = Array.isArray(row.incidents) ? row.incidents[0] : row.incidents;
					if (!incident?.incident_id) return null;
					return {
						id: incident.incident_id,
						incident_category: incident.incident_category,
						location_unit_no: incident.location_unit_no,
						location_description: incident.location_description,
						created_at: incident.created_at,
					} satisfies IncidentRow;
				})
				.filter((item): item is IncidentRow => Boolean(item));

			if (alive) {
				const safeIncidents = incidentsData ?? [];
				setIncidents(safeIncidents);
				if (incidentId) {
					const selectedById = safeIncidents.find((item) => item.id === incidentId);
					if (selectedById?.incident_category) {
						setSelectedCategory(selectedById.incident_category);
					}
				}
			}

			// Supervisor name from shifts.supervisor_id -> employees.id.
			const { data: shiftRows } = await supabase
				.from("shifts")
				.select("supervisor_id, shift_start")
				.eq("officer_id", userId)
				.order("shift_start", { ascending: false })
				.limit(20);

			const chosenShift = ((shiftRows ?? []) as ShiftRow[]).find((s) => Boolean(s.supervisor_id)) ?? null;

			if (chosenShift?.supervisor_id) {
				const { data: supervisor } = await supabase
					.from("employees")
					.select("first_name, last_name")
					.eq("id", chosenShift.supervisor_id)
					.maybeSingle<EmployeeName>();

				if (alive) {
					const name = `${(supervisor?.first_name ?? "").trim()} ${(supervisor?.last_name ?? "").trim()}`.trim();
					setSupervisorName(name || "-");
				}
			}

			if (alive) setLoading(false);
		};

		void loadData();

		return () => {
			alive = false;
		};
	}, [incidentId]);

	const selectedIncident = useMemo(() => {
		if (incidentId) {
			const byId = incidents.find((incident) => incident.id === incidentId);
			if (byId) return byId;
		}

		if (selectedCategory) {
			const byCategory = incidents.find((incident) => (incident.incident_category ?? "") === selectedCategory);
			if (byCategory) return byCategory;
		}
		return incidents[0] ?? null;
	}, [incidents, incidentId, selectedCategory]);

	const locationText = useMemo(() => {
		if (!selectedIncident) return "-";
		const unit = selectedIncident.location_unit_no?.trim() ?? "";
		const desc = selectedIncident.location_description?.trim() ?? "";
		return [unit, desc].filter(Boolean).join(" ") || "-";
	}, [selectedIncident]);

	const createdAtDate = selectedIncident?.created_at ? new Date(selectedIncident.created_at) : null;
	const incidentDateText = createdAtDate ? formatDate(createdAtDate) : "-";
	const startTimeText = createdAtDate ? formatTime(createdAtDate) : "-";
	const nowTimeText = formatTime(now);

	const onSubmit = async () => {
		if (saving) return;

		const descriptionValue = incidentDescription.trim();
		const instructionsValue = handoverInstructions.trim();

		if (!selectedIncident) {
			Alert.alert("Submit failed", "No incident found to create report from.");
			return;
		}
		if (!descriptionValue) {
			Alert.alert("Submit failed", "Incident description is required.");
			return;
		}
		if (reportType === "Handover" && !instructionsValue) {
			Alert.alert("Submit failed", "Handover instructions are required.");
			return;
		}

		const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
		const authUserId = sessionData.session?.user.id ?? null;
		if (!authUserId) {
			Alert.alert("Submit failed", sessionError?.message ?? "Unable to validate your session.");
			return;
		}

		setSaving(true);

		const nowIso = new Date().toISOString();
		const startIso = selectedIncident.created_at ?? nowIso;

		const payload = {
			report_type: reportType,
			incident_id: selectedIncident.id,
			officer_id: authUserId,
			incident_category: selectedCategory,
			incident_location: locationText,
			incident_date: selectedIncident.created_at,
			start_time: startIso,
			handover_time: reportType === "Handover" ? nowIso : null,
			resolved_time: reportType === "Resolved" ? nowIso : null,
			duty_officer_name: dutyOfficerName,
			incident_description: descriptionValue,
			handover_instructions: reportType === "Handover" ? instructionsValue : null,
			supervisor_incharge_name: supervisorName,
		};

		const { error } = await supabase.from("reports").insert(payload);

		if (error) {
			setSaving(false);
			Alert.alert("Submit failed", error.message);
			return;
		}

		const { error: closeAssignmentError } = await supabase
			.from("incident_assignments")
			.update({ active_status: false })
			.eq("officer_id", authUserId)
			.eq("incident_id", selectedIncident.id)
			.eq("active_status", true);

		setSaving(false);

		if (closeAssignmentError) {
			Alert.alert(
				"Submitted with warning",
				"Report was submitted, but the assignment could not be closed automatically. Please refresh and try again."
			);
		}

		setSubmittedReportType(reportType);
		setShowSubmitSuccessModal(true);
	};

	const onCloseSubmitSuccess = () => {
		setShowSubmitSuccessModal(false);
		router.replace("/securityofficer/reports");
	};

	return (
		<ImageBackground
			source={require("../../assets/srbackground.png")}
			style={styles.bgImage}
			resizeMode="cover"
		>
			<SafeAreaView style={styles.root}>
				<View style={styles.headerRow}>
					<Pressable
						style={styles.backButton}
						onPress={() =>
							router.canGoBack() ? router.back() : router.replace("/securityofficer/home")
						}
					>
						<ChevronLeft color="#FFFFFF" size={24} strokeWidth={2.4} />
					</Pressable>
					<Text style={styles.headerTitle}>Incident Report</Text>
				</View>

				{loading ? (
					<View style={styles.loaderWrap}>
						<ActivityIndicator color="#FFFFFF" />
					</View>
				) : (
					<ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
						<View style={styles.card}>
						<View style={styles.toggleRow}>
							<Pressable
								style={[styles.toggleBtn, reportType === "Handover" ? styles.toggleBtnActive : null]}
								onPress={() => setReportType("Handover")}
							>
								<Text style={[styles.toggleText, reportType === "Handover" ? styles.toggleTextActive : null]}>
									Handover
								</Text>
							</Pressable>
							<Pressable
								style={[styles.toggleBtn, reportType === "Resolved" ? styles.toggleBtnActive : null]}
								onPress={() => setReportType("Resolved")}
							>
								<Text style={[styles.toggleText, reportType === "Resolved" ? styles.toggleTextActive : null]}>
									Resolved
								</Text>
							</Pressable>
						</View>

						<Text style={styles.label}>Incident Category:</Text>
						<Pressable
							style={styles.categoryDropdownTrigger}
							onPress={() => setShowCategoryDropdown(true)}
						>
							<Text style={styles.categoryDropdownText}>{selectedCategory}</Text>
							<ChevronDown size={20} color="#6B7280" />
						</Pressable>

						<Text style={styles.label}>Location of Incident:</Text>
						<FieldBox value={locationText} />

						<Text style={styles.label}>Date:</Text>
						<FieldBox value={incidentDateText} />

						<View style={styles.timeRow}>
							<View style={styles.timeCol}>
								<Text style={styles.label}>Start Time:</Text>
								<FieldBox value={startTimeText} />
							</View>

							<Text style={styles.arrowText}>{"\u2192"}</Text>

							<View style={styles.timeCol}>
								<Text style={styles.label}>
									{reportType === "Handover" ? "Handover Time:" : "Resolved Time:"}
								</Text>
								<FieldBox value={nowTimeText} />
							</View>
						</View>

						<View style={styles.separator} />

						<Text style={styles.label}>Duty Officer Name:</Text>
						<FieldBox value={dutyOfficerName} />

						<Text style={styles.label}>Incident Description:</Text>
						<TextInput
							value={incidentDescription}
							onChangeText={setIncidentDescription}
							placeholder="Enter incident description"
							placeholderTextColor="#9CA3AF"
							style={[styles.inputBox, styles.multilineInput]}
							multiline
							textAlignVertical="top"
						/>

						{reportType === "Handover" ? (
							<>
								<Text style={styles.label}>Handover Instructions:</Text>
								<TextInput
									value={handoverInstructions}
									onChangeText={setHandoverInstructions}
									placeholder="Enter handover instructions"
									placeholderTextColor="#9CA3AF"
									style={[styles.inputBox, styles.multilineInput]}
									multiline
									textAlignVertical="top"
								/>
							</>
						) : null}

						<Text style={styles.label}>Supervisor Incharge Name:</Text>
						<FieldBox value={supervisorName} />

						<Pressable
							style={[styles.submitBtn, saving ? styles.submitBtnDisabled : null]}
							onPress={() => {
								void onSubmit();
							}}
							disabled={saving}
						>
							<Text style={styles.submitText}>{saving ? "Submitting..." : "Submit"}</Text>
						</Pressable>
						</View>
					</ScrollView>
				)}

				<Modal
					visible={showCategoryDropdown}
					transparent
					animationType="fade"
					onRequestClose={() => setShowCategoryDropdown(false)}
				>
					<View style={styles.dropdownOverlay}>
						<Pressable style={styles.dropdownBackdrop} onPress={() => setShowCategoryDropdown(false)} />
						<View style={styles.dropdownCard}>
							<Text style={styles.dropdownTitle}>Select Incident Category</Text>
							<ScrollView style={styles.dropdownList}>
								{INCIDENT_CATEGORIES.map((category) => {
									const active = selectedCategory === category;
									return (
										<Pressable
											key={category}
											style={[styles.dropdownItem, active ? styles.dropdownItemActive : null]}
											onPress={() => {
												setSelectedCategory(category);
												setShowCategoryDropdown(false);
											}}
										>
											<Text style={[styles.dropdownItemText, active ? styles.dropdownItemTextActive : null]}>
												{category}
											</Text>
										</Pressable>
									);
								})}
							</ScrollView>
						</View>
					</View>
				</Modal>

				<Modal
					visible={showSubmitSuccessModal}
					transparent
					animationType="fade"
					onRequestClose={onCloseSubmitSuccess}
				>
					<View style={styles.submitSuccessBackdrop}>
						<LinearGradient
							colors={["#FFF7E6", "#FFEBD0", "#FDE2B8"]}
							start={{ x: 0, y: 0 }}
							end={{ x: 1, y: 1 }}
							style={styles.submitSuccessCard}
						>
							<View style={styles.submitSuccessBadgeWrap}>
								<View style={styles.submitSuccessBadge}>
									<Text style={styles.submitSuccessBadgeText}>SUCCESS</Text>
								</View>
							</View>

							<Text style={styles.submitSuccessTitle}>Report Submitted</Text>
							<Text style={styles.submitSuccessBody}>
								{`${submittedReportType} report has been submitted.`}
							</Text>

							<Pressable style={styles.submitSuccessAction} onPress={onCloseSubmitSuccess}>
								<Text style={styles.submitSuccessActionText}>Back to Reports</Text>
							</Pressable>
						</LinearGradient>
					</View>
				</Modal>
			</SafeAreaView>
		</ImageBackground>
	);
}

function FieldBox({ value }: { value: string }) {
	return (
		<View style={[styles.inputBox, styles.readOnlyBox]}>
			<Text style={[styles.inputText, styles.readOnlyText]}>{value || "-"}</Text>
		</View>
	);
}

function formatDate(value: Date) {
	if (!Number.isFinite(value.getTime())) return "-";
	return value.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

function formatTime(value: Date) {
	if (!Number.isFinite(value.getTime())) return "-";
	return value.toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

const styles = StyleSheet.create({
	bgImage: {
		flex: 1,
		backgroundColor: "#1C4370",
	},
	root: {
		flex: 1,
		backgroundColor: "transparent",
	},
	headerRow: {
		paddingTop: 44,
		paddingHorizontal: 16,
		paddingBottom: 6,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	backButton: {
		width: 36,
		height: 36,
		borderRadius: 9,
		backgroundColor: "rgba(255,255,255,0.12)",
		alignItems: "center",
		justifyContent: "center",
	},
	headerTitle: {
		color: "#FFFFFF",
		fontSize: 26,
		fontWeight: "700",
	},
	loaderWrap: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	scrollContent: {
		paddingHorizontal: 16,
		paddingBottom: 20,
	},
	card: {
		backgroundColor: "rgba(110, 130, 155, 0.92)",
		borderRadius: 30,
		paddingHorizontal: 18,
		paddingTop: 14,
		paddingBottom: 16,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.16)",
	},
	toggleRow: {
		flexDirection: "row",
		gap: 8,
		marginBottom: 10,
	},
	toggleBtn: {
		flex: 1,
		height: 42,
		borderRadius: 999,
		backgroundColor: "#F8FAFC",
		borderWidth: 2,
		borderColor: "#F59E0B",
		alignItems: "center",
		justifyContent: "center",
	},
	toggleBtnActive: {
		backgroundColor: "#F59E0B",
	},
	toggleText: {
		fontSize: 15,
		fontWeight: "600",
		color: "#111827",
	},
	toggleTextActive: {
		fontWeight: "700",
	},
	label: {
		marginTop: 6,
		marginBottom: 4,
		fontSize: 15,
		fontWeight: "600",
		color: "#0F172A",
	},
	categoryDropdownTrigger: {
		height: 44,
		borderRadius: 14,
		borderWidth: 2,
		borderColor: "#F59E0B",
		backgroundColor: "#FFFFFF",
		paddingHorizontal: 14,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	categoryDropdownText: {
		fontSize: 14,
		fontWeight: "600",
		color: "#111827",
	},
	dropdownOverlay: {
		flex: 1,
		backgroundColor: "rgba(15, 23, 42, 0.45)",
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 18,
	},
	dropdownBackdrop: {
		...StyleSheet.absoluteFillObject,
	},
	dropdownCard: {
		width: "100%",
		maxWidth: 390,
		maxHeight: "68%",
		backgroundColor: "#FFFFFF",
		borderRadius: 16,
		borderWidth: 1,
		borderColor: "#E5E7EB",
		paddingHorizontal: 14,
		paddingTop: 14,
		paddingBottom: 10,
	},
	dropdownTitle: {
		fontSize: 17,
		fontWeight: "700",
		color: "#0F172A",
		marginBottom: 8,
	},
	dropdownList: {
		maxHeight: 360,
	},
	dropdownItem: {
		paddingVertical: 11,
		paddingHorizontal: 14,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#E5E7EB",
		backgroundColor: "#F8FAFC",
		marginBottom: 7,
	},
	dropdownItemActive: {
		borderColor: "#F59E0B",
		backgroundColor: "#FFF7ED",
	},
	dropdownItemText: {
		fontSize: 13,
		fontWeight: "600",
		color: "#111827",
	},
	dropdownItemTextActive: {
		fontWeight: "700",
		color: "#9A3412",
	},
	inputBox: {
		minHeight: 40,
		borderRadius: 14,
		backgroundColor: "#FFFFFF",
		borderWidth: 2,
		borderColor: "#F59E0B",
		paddingHorizontal: 14,
		paddingVertical: 7,
		justifyContent: "center",
	},
	readOnlyBox: {
		backgroundColor: "#E5E7EB",
		borderColor: "#D1D5DB",
	},
	inputText: {
		fontSize: 14,
		fontWeight: "500",
		color: "#111827",
	},
	readOnlyText: {
		color: "#1F2937",
	},
	multilineInput: {
		minHeight: 84,
		borderRadius: 14,
		fontSize: 14,
		lineHeight: 20,
		fontWeight: "500",
		color: "#111827",
	},
	timeRow: {
		marginTop: 2,
		flexDirection: "row",
		alignItems: "flex-end",
		justifyContent: "space-between",
		gap: 6,
	},
	timeCol: {
		flex: 1,
	},
	arrowText: {
		fontSize: 32,
		lineHeight: 42,
		fontWeight: "600",
		color: "#E2E8F0",
		paddingBottom: 2,
	},
	separator: {
		marginTop: 10,
		marginBottom: 4,
		height: 1,
		backgroundColor: "rgba(255,255,255,0.3)",
	},
	submitBtn: {
		marginTop: 12,
		alignSelf: "center",
		minWidth: 140,
		height: 46,
		paddingHorizontal: 30,
		borderRadius: 999,
		backgroundColor: "#F59E0B",
		alignItems: "center",
		justifyContent: "center",
	},
	submitBtnDisabled: {
		opacity: 0.6,
	},
	submitText: {
		fontSize: 19,
		fontWeight: "700",
		color: "#111827",
	},
	submitSuccessBackdrop: {
		flex: 1,
		backgroundColor: "rgba(12, 25, 44, 0.55)",
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 18,
	},
	submitSuccessCard: {
		width: "100%",
		maxWidth: 360,
		borderRadius: 24,
		borderWidth: 2,
		borderColor: "#F0B146",
		paddingHorizontal: 18,
		paddingTop: 20,
		paddingBottom: 18,
		shadowColor: "#121826",
		shadowOpacity: 0.28,
		shadowRadius: 14,
		shadowOffset: { width: 0, height: 8 },
		elevation: 10,
	},
	submitSuccessBadgeWrap: {
		alignItems: "center",
		marginBottom: 8,
	},
	submitSuccessBadge: {
		paddingHorizontal: 12,
		height: 28,
		borderRadius: 999,
		backgroundColor: "#00a745",
		alignItems: "center",
		justifyContent: "center",
	},
	submitSuccessBadgeText: {
		color: "#FFFFFF",
		fontSize: 12,
		fontWeight: "800",
		letterSpacing: 0.4,
	},
	submitSuccessTitle: {
		textAlign: "center",
		fontSize: 28,
		lineHeight: 32,
		fontWeight: "900",
		color: "#163A67",
	},
	submitSuccessBody: {
		marginTop: 8,
		textAlign: "center",
		fontSize: 15,
		lineHeight: 21,
		fontWeight: "700",
		color: "#334155",
	},
	submitSuccessAction: {
		marginTop: 16,
		height: 44,
		borderRadius: 12,
		backgroundColor: "#0E2D52",
		alignItems: "center",
		justifyContent: "center",
	},
	submitSuccessActionText: {
		fontSize: 15,
		fontWeight: "800",
		color: "#FFFFFF",
	},
});
