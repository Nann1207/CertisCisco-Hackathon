import React, { useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	ActivityIndicator,
	Alert,
	Image,
	Linking,
	Modal,
	Pressable,
	SafeAreaView,
	ScrollView,
	StyleSheet,
	TextInput,
	View,
} from "react-native";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";
import * as Location from "expo-location";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BellRing, ChevronLeft, ClipboardPen, PhoneCall } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { resolveIncidentFrameUrls } from "../../lib/incidentFrames";
import { supabase } from "../../lib/supabase";

type IncidentRow = {
	id: string;
	incident_category?: string | null;
	location_name?: string | null;
	location_unit_no?: string | null;
	location_description?: string | null;
	latitude?: number | null;
	longitude?: number | null;
	prediction_correct?: boolean | null;
	cctv_image_1_path?: string | null;
	cctv_image_2_path?: string | null;
	cctv_image_3_path?: string | null;
	cctv_image_4?: string | null;
	ai_assessment?: string | null;
};

type AssignmentGuardRow = {
	assignment_id: string;
	incident_id: string | null;
	active_status: boolean | null;
	shift_id?: string | null;
	supervisor_id?: string | null;
};

type ShiftSupervisorRow = {
	supervisor_id: string | null;
	shift_start: string | null;
};

type SupervisorContactRow = {
	phone?: string | null;
};

type IncidentProgressState = {
	isArrived: boolean;
	predictionAnswer: "TRUE" | "FALSE" | null;
	earlyChecked: Record<string, true>;
	sopChecked: Record<string, true>;
};

const NEARBY_DISTANCE_METERS = 120;
const INCIDENT_PROGRESS_STORAGE_PREFIX = "current_incident_progress";
const DEFAULT_EARLY_CHECKLIST = [
	"Acknowledge - Confirm via radio you are responding",
	"Visual Scan - Watch for suspects blending into the crowd",
	"Safe Entry - Observe through windows before entering",
];
const DEFAULT_SOP_CHECKLIST = [
	"Check for Trauma - Check for shock or injury; call EMS",
	"Freeze the Scene - Do not let anyone touch the point of contact",
	"Lock Down - Close doors/gates to preserve the scene",
	"Query - Get weapon, description, and exit route",
	"Alert - Radio suspect details to all units immediately",
	"Identify - Collect names and contact info",
	"Isolate - Separate witnesses to prevent story-merging",
	"Notes - Leave demand notes untouched; cover them",
	"Log - Record all entry/exit times and names",
];

function getDefaultChecklistApiUrl() {
	const hostUri = (Constants.expoConfig as { hostUri?: string } | null)?.hostUri;
	const host = hostUri?.split(":")[0] ?? "localhost";
	return `http://${host}:5001/incident/checklist/generate`;
}

const INCIDENT_CHECKLIST_API_URL =
	process.env.EXPO_PUBLIC_INCIDENT_CHECKLIST_API_URL ?? getDefaultChecklistApiUrl();

function normalizeChecklistItems(raw: unknown, fallback: string[], minimumCount: number) {
	if (!Array.isArray(raw)) return fallback;
	const normalized = raw
		.map((item) => {
			if (typeof item === "string") return item.trim();
			if (item && typeof item === "object" && "text" in item) {
				const value = (item as { text?: unknown }).text;
				return typeof value === "string" ? value.trim() : "";
			}
			return "";
		})
		.filter((item) => item.length > 0);
	if (normalized.length < minimumCount) return fallback;
	return normalized;
}

export default function CurrentIncidentScreen() {
	const router = useRouter();
	const { incidentId } = useLocalSearchParams<{ incidentId?: string }>();

	const [loading, setLoading] = useState(true);
	const [incident, setIncident] = useState<IncidentRow | null>(null);
	const [currentUserId, setCurrentUserId] = useState<string | null>(null);
	const [currentSupervisorId, setCurrentSupervisorId] = useState<string | null>(null);
	const [supervisorPhone, setSupervisorPhone] = useState<string>("999");
	const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number } | null>(null);
	const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
	const [isArrived, setIsArrived] = useState(false);
	const [predictionAnswer, setPredictionAnswer] = useState<"TRUE" | "FALSE" | null>(null);
	const [earlyChecked, setEarlyChecked] = useState<Record<string, true>>({});
	const [sopChecked, setSopChecked] = useState<Record<string, true>>({});
	const [testingMode, setTestingMode] = useState(__DEV__);
	const [earlyChecklist, setEarlyChecklist] = useState<string[]>([]);
	const [sopChecklist, setSopChecklist] = useState<string[]>([]);
	const [checklistLoading, setChecklistLoading] = useState(true);

	const [showBackupModal, setShowBackupModal] = useState(false);
	const [showBackupSuccessModal, setShowBackupSuccessModal] = useState(false);
	const [backupSuccessCount, setBackupSuccessCount] = useState<number>(1);
	const [backupCount, setBackupCount] = useState("1");
	const [backupReason, setBackupReason] = useState("");
	const [showReportModeModal, setShowReportModeModal] = useState(false);
	const [showMapModal, setShowMapModal] = useState(false);
	const [modalMapRegion, setModalMapRegion] = useState<Region | null>(null);
	const modalMapRef = useRef<MapView | null>(null);
	const [cctvUris, setCctvUris] = useState<string[]>([]);
	const hasHydratedProgressRef = useRef(false);

	const progressStorageKey = useMemo(() => {
		if (!currentUserId || !incidentId) return null;
		return `${INCIDENT_PROGRESS_STORAGE_PREFIX}:${currentUserId}:${incidentId}`;
	}, [currentUserId, incidentId]);

	useEffect(() => {
		let alive = true;

		const loadData = async () => {
			if (!incidentId) {
				if (alive) {
					setLoading(false);
					Alert.alert("Incident missing", "Please open an incident from the incidents page.");
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

			setCurrentUserId(userId);

			const { data: assignmentData, error: assignmentError } = await supabase
				.from("incident_assignments")
				.select("assignment_id, incident_id, active_status, shift_id, supervisor_id")
				.eq("incident_id", incidentId)
				.eq("officer_id", userId)
				.eq("active_status", true)
				.limit(1)
				.maybeSingle<AssignmentGuardRow>();

			if (!alive) return;

			if (assignmentError || !assignmentData) {
				setLoading(false);
				Alert.alert("Not assigned", "This incident is not currently assigned to your account.");
				router.replace("/securityofficer/incidents");
				return;
			}

			const { data: incidentData, error: incidentError } = await supabase
				.from("incidents")
				.select(
					"id:incident_id, incident_category, location_name, location_unit_no, location_description, latitude, longitude, prediction_correct, cctv_image_1_path, cctv_image_2_path, cctv_image_3_path, cctv_image_4, ai_assessment"
				)
				.eq("incident_id", incidentId)
				.maybeSingle();

			if (!alive) return;

			if (incidentError || !incidentData) {
				setLoading(false);
				Alert.alert("Load failed", incidentError?.message ?? "Unable to load incident.");
				return;
			}

			setIncident(incidentData as IncidentRow);

			let supervisorId = assignmentData?.supervisor_id ?? null;
			if (!supervisorId && assignmentData?.shift_id) {
				const { data: assignedShift } = await supabase
					.from("shifts")
					.select("supervisor_id, shift_start")
					.eq("shift_id", assignmentData.shift_id)
					.maybeSingle<ShiftSupervisorRow>();

				supervisorId = assignedShift?.supervisor_id ?? null;
			}

			if (!supervisorId) {
				const { data: shiftRows } = await supabase
					.from("shifts")
					.select("supervisor_id, shift_start")
					.eq("officer_id", userId)
					.order("shift_start", { ascending: false })
					.limit(10);

				supervisorId =
					((shiftRows ?? []) as ShiftSupervisorRow[]).find((shift) => Boolean(shift.supervisor_id))
						?.supervisor_id ?? null;
			}

			if (supervisorId) {
				setCurrentSupervisorId(supervisorId);
				const { data: supervisor } = await supabase
					.from("employees")
					.select("phone")
					.eq("id", supervisorId)
					.maybeSingle();

				const maybePhone =
					(supervisor as SupervisorContactRow | null)?.phone ??
					null;
				if (maybePhone) setSupervisorPhone(maybePhone);
			}

			setLoading(false);
		};

		void loadData();
		return () => {
			alive = false;
		};
	}, [incidentId, router]);

	useEffect(() => {
		let watcher: Location.LocationSubscription | null = null;
		let active = true;

		const setupTracking = async () => {
			const { status } = await Location.requestForegroundPermissionsAsync();
			if (status !== "granted") return;

			watcher = await Location.watchPositionAsync(
				{ accuracy: Location.Accuracy.Balanced, timeInterval: 6000, distanceInterval: 5 },
				(pos) => {
					if (!active) return;
					setCurrentCoords({
						latitude: pos.coords.latitude,
						longitude: pos.coords.longitude,
					});
				}
			);
		};

		void setupTracking();
		return () => {
			active = false;
			watcher?.remove();
		};
	}, []);

	useEffect(() => {
		if (!incident?.latitude || !incident?.longitude || !currentCoords) {
			setDistanceMeters(null);
			return;
		}
		setDistanceMeters(
			getDistanceMeters(
				currentCoords.latitude,
				currentCoords.longitude,
				incident.latitude,
				incident.longitude
			)
		);
	}, [currentCoords, incident?.latitude, incident?.longitude]);

	useEffect(() => {
		let alive = true;

		const loadCctvUris = async () => {
			if (!incident) {
				if (alive) setCctvUris([]);
				return;
			}

			const uris = await resolveIncidentFrameUrls([
				incident.cctv_image_1_path,
				incident.cctv_image_2_path,
				incident.cctv_image_3_path,
				incident.cctv_image_4,
			]);

			if (alive) {
				setCctvUris(uris);
			}
		};

		void loadCctvUris();
		return () => {
			alive = false;
		};
	}, [incident]);

	useEffect(() => {
		let active = true;

		const generateChecklists = async () => {
			if (!incident) return;
			setChecklistLoading(true);
			setEarlyChecklist([]);
			setSopChecklist([]);

			try {
				const response = await fetch(INCIDENT_CHECKLIST_API_URL, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						incident: {
							incident_id: incident.id,
							incident_category: incident.incident_category ?? null,
							location_name: incident.location_name ?? null,
							location_unit_no: incident.location_unit_no ?? null,
							location_description: incident.location_description ?? null,
							ai_assessment: incident.ai_assessment ?? null,
						},
					}),
				});

				const body = (await response.json().catch(() => ({}))) as {
					early_checklist?: unknown;
					sop_checklist?: unknown;
				};

				if (!response.ok) {
					const errorMessage =
						typeof (body as { error?: unknown }).error === "string"
							? (body as { error: string }).error
							: `Checklist API failed (${response.status})`;
					throw new Error(errorMessage);
				}

				if (!active) return;

				setEarlyChecklist(normalizeChecklistItems(body.early_checklist, DEFAULT_EARLY_CHECKLIST, 3));
				setSopChecklist(normalizeChecklistItems(body.sop_checklist, DEFAULT_SOP_CHECKLIST, 3));
			} catch (error) {
				console.warn("[currentIncident] checklist generation fallback:", error);
				if (!active) return;
				setEarlyChecklist(DEFAULT_EARLY_CHECKLIST);
				setSopChecklist(DEFAULT_SOP_CHECKLIST);
			} finally {
				if (active) setChecklistLoading(false);
			}
		};

		void generateChecklists();
		return () => {
			active = false;
		};
	}, [incident]);

	useEffect(() => {
		setEarlyChecked((prev) =>
			Object.fromEntries(
				Object.entries(prev).filter(([item]) => earlyChecklist.includes(item))
			) as Record<string, true>
		);
	}, [earlyChecklist]);

	useEffect(() => {
		setSopChecked((prev) =>
			Object.fromEntries(
				Object.entries(prev).filter(([item]) => sopChecklist.includes(item))
			) as Record<string, true>
		);
	}, [sopChecklist]);

	useEffect(() => {
		hasHydratedProgressRef.current = false;

		if (!progressStorageKey) {
			setIsArrived(false);
			setPredictionAnswer(null);
			setEarlyChecked({});
			setSopChecked({});
			return;
		}

		let active = true;

		const loadSavedProgress = async () => {
			try {
				const stored = await AsyncStorage.getItem(progressStorageKey);
				if (!active) return;

				if (stored) {
					const parsed = JSON.parse(stored) as Partial<IncidentProgressState>;
					setIsArrived(Boolean(parsed.isArrived));
					setPredictionAnswer(
						parsed.predictionAnswer === "TRUE" || parsed.predictionAnswer === "FALSE"
							? parsed.predictionAnswer
							: null
					);
					setEarlyChecked((parsed.earlyChecked ?? {}) as Record<string, true>);
					setSopChecked((parsed.sopChecked ?? {}) as Record<string, true>);
				} else {
					setIsArrived(false);
					setPredictionAnswer(null);
					setEarlyChecked({});
					setSopChecked({});
				}
			} catch (error) {
				console.warn("[currentIncident] failed to load saved progress:", error);
			} finally {
				if (active) {
					hasHydratedProgressRef.current = true;
				}
			}
		};

		void loadSavedProgress();

		return () => {
			active = false;
		};
	}, [progressStorageKey]);

	useEffect(() => {
		if (!progressStorageKey || !hasHydratedProgressRef.current) return;

		const saveProgress = async () => {
			try {
				const payload: IncidentProgressState = {
					isArrived,
					predictionAnswer,
					earlyChecked,
					sopChecked,
				};
				await AsyncStorage.setItem(progressStorageKey, JSON.stringify(payload));
			} catch (error) {
				console.warn("[currentIncident] failed to save progress:", error);
			}
		};

		void saveProgress();
	}, [earlyChecked, isArrived, predictionAnswer, progressStorageKey, sopChecked]);

	const incidentTitle = useMemo(() => {
		const category = (incident?.incident_category ?? "Incident").toString();
		const locationName = (incident?.location_name ?? incident?.location_description ?? "Unknown Location").toString();
		return `${category} AT ${locationName}`;
	}, [incident?.incident_category, incident?.location_description, incident?.location_name]);

	const incidentRegion = useMemo(
		() => ({
			latitude: incident?.latitude ?? 1.3006,
			longitude: incident?.longitude ?? 103.8457,
			latitudeDelta: 0.005,
			longitudeDelta: 0.005,
		}),
		[incident?.latitude, incident?.longitude]
	);

	const canMarkArrived =
		testingMode || (distanceMeters !== null && distanceMeters <= NEARBY_DISTANCE_METERS);

	const onToggleEarlyChecklist = (item: string) => {
		setEarlyChecked((prev) => {
			if (prev[item]) {
				const copy = { ...prev };
				delete copy[item];
				return copy;
			}
			return { ...prev, [item]: true };
		});
	};

	const onToggleChecklist = (item: string) => {
		setSopChecked((prev) => {
			if (prev[item]) {
				const copy = { ...prev };
				delete copy[item];
				return copy;
			}
			return { ...prev, [item]: true };
		});
	};

	const onOpenIncidentReport = (nextReportType: "Handover" | "Resolved") => {
		if (!incident?.id) return;
		const checkedEarlyActions = earlyChecklist.filter((item) => Boolean(earlyChecked[item]));
		const checkedSopActions = sopChecklist.filter((item) => Boolean(sopChecked[item]));

		setShowReportModeModal(false);
		const proceed = async () => {
			if (progressStorageKey) {
				try {
					await AsyncStorage.removeItem(progressStorageKey);
				} catch (error) {
					console.warn("[currentIncident] failed to clear saved progress:", error);
				}
			}

			router.push({
				pathname: "/securityofficer/shift-reports",
				params: {
					incidentId: incident.id,
					reportType: nextReportType,
					checkedEarlyActions: JSON.stringify(checkedEarlyActions),
					checkedSopActions: JSON.stringify(checkedSopActions),
				},
			});
		};

		void proceed();
	};

	const onCallSupervisor = async () => {
		const tel = `tel:${supervisorPhone}`;
		try {
			const canOpen = await Linking.canOpenURL(tel);
			if (!canOpen) {
				router.push({
					pathname: "/securityofficer/phonecalls",
					params: currentSupervisorId ? { supervisorId: currentSupervisorId } : undefined,
				});
				return;
			}
			await Linking.openURL(tel);
		} catch {
			router.push({
				pathname: "/securityofficer/phonecalls",
				params: currentSupervisorId ? { supervisorId: currentSupervisorId } : undefined,
			});
		}
	};

	const onConfirmBackup = async () => {
		if (!incident?.id || !currentUserId) {
			setShowBackupModal(false);
			Alert.alert("Backup Request Failed", "Unable to identify your active incident assignment.");
			return;
		}

		const requestedCount = Number.parseInt(backupCount, 10);
		const sanitizedCount = Number.isFinite(requestedCount) ? Math.max(1, requestedCount) : 1;
		const reason = backupReason.trim();
		const { data: assignment } = await supabase
			.from("incident_assignments")
			.select("assignment_id")
			.eq("incident_id", incident.id)
			.eq("officer_id", currentUserId)
			.eq("active_status", true)
			.limit(1)
			.maybeSingle<{ assignment_id: string }>();

		const assignmentId = assignment?.assignment_id;
		if (!assignmentId) {
			setShowBackupModal(false);
			Alert.alert("Backup Request Failed", "No active assignment was found for your account.");
			return;
		}

		const { error: updateError } = await supabase
			.from("incident_assignments")
			.update({
				backup_requested: true,
				backup_amount: sanitizedCount,
				backup_reason: reason || null,
			})
			.eq("assignment_id", assignmentId)
			.eq("officer_id", currentUserId)
			.eq("active_status", true);

		setShowBackupModal(false);
		setBackupReason("");
		setBackupCount("1");

		if (!updateError) {
			setBackupSuccessCount(sanitizedCount);
			setShowBackupSuccessModal(true);
			return;
		}

		Alert.alert(
			"Backup Request Failed",
			updateError.message || "Unable to save your backup request."
		);
	};

	const onOpenMapModal = () => {
		setModalMapRegion(incidentRegion);
		setShowMapModal(true);
	};

	const onZoomModalMap = (direction: "in" | "out") => {
		setModalMapRegion((prev) => {
			const base = prev ?? incidentRegion;
			const factor = direction === "in" ? 0.55 : 1.8;
			const next: Region = {
				...base,
				latitudeDelta: clamp(base.latitudeDelta * factor, 0.0008, 0.2),
				longitudeDelta: clamp(base.longitudeDelta * factor, 0.0008, 0.2),
			};
			modalMapRef.current?.animateToRegion(next, 180);
			return next;
		});
	};

	const onRecenterModalMap = () => {
		const next = incidentRegion;
		setModalMapRegion(next);
		modalMapRef.current?.animateToRegion(next, 180);
	};

	if (loading) {
		return (
			<SafeAreaView style={styles.root}>
				<View style={styles.loadingWrap}>
					<ActivityIndicator color="#FFFFFF" />
				</View>
			</SafeAreaView>
		);
	}

	if (!incident || !currentUserId) {
		return (
			<SafeAreaView style={styles.root}>
				<View style={styles.loadingWrap}>
					<Text style={styles.emptyText}>Incident is unavailable.</Text>
					<Pressable style={styles.primaryBtn} onPress={() => router.replace("/securityofficer/incidents")}>
						<Text style={styles.primaryBtnText}>Back to Incidents</Text>
					</Pressable>
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.root}>
			<View style={styles.topPanel}>
				<View style={styles.header}>
					<Pressable
						style={styles.iconBtn}
						onPress={() =>
							router.canGoBack() ? router.back() : router.replace("/securityofficer/incidents")
						}
					>
						<ChevronLeft size={24} color="#FFFFFF" />
					</Pressable>
					<Text style={styles.headerTitle}>Incident Information</Text>
				</View>
			</View>

			<View style={styles.bodyPanel}>
				<View style={styles.leftRail} />
				<ScrollView
					contentContainerStyle={[
						styles.scrollContent,
						!isArrived ? styles.scrollContentWithFloatingArrivedBtn : null,
						isArrived ? styles.scrollContentWithFloatingReportBtn : null,
					]}
					showsVerticalScrollIndicator={false}
				>
					<View style={styles.card}>
						<Text style={styles.incidentTitle}>{incidentTitle}</Text>
						<Text style={styles.unitText}>
							{incident.location_unit_no?.trim() ? `#${incident.location_unit_no?.trim()}` : "Unit Pending"}
						</Text>

						<Pressable style={styles.mapCard} onPress={onOpenMapModal}>
							<MapView style={styles.map} initialRegion={incidentRegion} onPress={onOpenMapModal}>
								{incident.latitude && incident.longitude ? (
									<Marker
										coordinate={{ latitude: incident.latitude, longitude: incident.longitude }}
										title="Incident"
									/>
								) : null}
								{currentCoords ? (
									<Marker coordinate={currentCoords} title="You" pinColor="#2563EB" />
								) : null}
								{currentCoords && incident.latitude && incident.longitude ? (
									<Polyline
										coordinates={[
											currentCoords,
											{ latitude: incident.latitude, longitude: incident.longitude },
										]}
										strokeColor="#D7263D"
										strokeWidth={3}
									/>
								) : null}
							</MapView>
						</Pressable>
						<Pressable style={styles.mapHint} onPress={onOpenMapModal}>
							<Text style={styles.mapHintText}>Tap map to open navigation view</Text>
						</Pressable>

						<View style={styles.cctvRow}>
							{cctvUris.length > 0 ? (
								cctvUris.slice(0, 3).map((uri, idx) => (
									<Image key={`${uri}-${idx}`} source={{ uri }} style={styles.cctvImage} />
								))
							) : (
								<>
									<View style={styles.cctvPlaceholder}>
										<Text style={styles.cctvPlaceholderText}>CCTV 1</Text>
									</View>
									<View style={styles.cctvPlaceholder}>
										<Text style={styles.cctvPlaceholderText}>CCTV 2</Text>
									</View>
									<View style={styles.cctvPlaceholder}>
										<Text style={styles.cctvPlaceholderText}>CCTV 3</Text>
									</View>
								</>
							)}
						</View>

						{!isArrived ? (
							<>
								<LinearGradient
									colors={["#ECECF0", "#C8D8E9"]}
									start={{ x: 0, y: 0 }}
									end={{ x: 1, y: 1 }}
									style={styles.predictionBox}
								>
									<Text style={styles.predictionTitle}>
										Is it {incident.incident_category ?? "this incident"}?
									</Text>
									<View style={styles.predictionRow}>
										<Pressable
											style={[
												styles.answerBtnTrue,
												predictionAnswer === "TRUE" ? styles.answerBtnActive : null,
											]}
											onPress={() => setPredictionAnswer("TRUE")}
										>
											<Text style={styles.answerBtnText}>TRUE</Text>
										</Pressable>
										<Pressable
											style={[
												styles.answerBtnFalse,
												predictionAnswer === "FALSE" ? styles.answerBtnActive : null,
											]}
											onPress={() => setPredictionAnswer("FALSE")}
										>
											<Text style={styles.answerBtnText}>FALSE</Text>
										</Pressable>
									</View>
								</LinearGradient>

									<Text style={styles.sectionHeader}>Investigation Guidelines</Text>
								{checklistLoading ? (
									<Pressable style={[styles.primaryBtn, styles.checklistLoadingBtn]} disabled>
										<ActivityIndicator color="#FFFFFF" size="small" />
										<Text style={styles.primaryBtnText}>Loading Checklist...</Text>
									</Pressable>
								) : (
									earlyChecklist.map((item, idx) => (
										<Pressable
											key={`${item}-${idx}`}
											style={styles.lineItem}
											onPress={() => onToggleEarlyChecklist(item)}
										>
											<View style={[styles.checkbox, earlyChecked[item] ? styles.checkboxChecked : null]}>
												{earlyChecked[item] ? <Text style={styles.checkboxTick}>✓</Text> : null}
											</View>
											<Text
												style={[styles.lineItemText, earlyChecked[item] ? styles.lineItemTextChecked : null]}
												disableDynamicFontSize
												adjustsFontSizeToFit={false}
											>
												{item}
											</Text>
										</Pressable>
									))
								)}

								<View style={styles.testingModeRow}>
									<Text style={styles.testingModeLabel}>Testing Mode</Text>
									<Pressable
										style={[styles.testingModeToggle, testingMode ? styles.testingModeToggleOn : null]}
										onPress={() => setTestingMode((prev) => !prev)}
									>
										<Text style={styles.testingModeToggleText}>{testingMode ? "ON" : "OFF"}</Text>
									</Pressable>
								</View>

									{!canMarkArrived && (
										<Text style={styles.distanceHint}>
											{distanceMeters === null
												? "Enable GPS to detect distance to incident."
												: `Move nearer to incident (${Math.round(distanceMeters)}m away).`}
										</Text>
									)}
							</>
						) : (
							<>
								<View style={styles.actionsRow}>
									<Pressable style={[styles.actionBtn, styles.backupBtn]} onPress={() => setShowBackupModal(true)}>
										<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
											<BellRing size={16} color="#9C2222" />
											<Text style={styles.actionBtnText}>Request Backup</Text>
										</View>
									</Pressable>
									<Pressable
										style={[styles.actionBtn, styles.hotlineBtn]}
										onPress={() => {
											void onCallSupervisor();
										}}
									>
										<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
											<PhoneCall size={16} color="#5A6E85" />
											<Text style={styles.hotlineBtnText}>Supervisor</Text>
										</View>
									</Pressable>
								</View>

								<Text style={styles.sectionHeader}>Checklist of SOP Guidelines</Text>
								{checklistLoading ? (
									<Pressable style={[styles.primaryBtn, styles.checklistLoadingBtn]} disabled>
										<ActivityIndicator color="#FFFFFF" size="small" />
										<Text style={styles.primaryBtnText}>Loading Checklist...</Text>
									</Pressable>
								) : (
									sopChecklist.map((item, idx) => (
										<Pressable key={`${item}-${idx}`} style={styles.lineItem} onPress={() => onToggleChecklist(item)}>
											<View style={[styles.checkbox, sopChecked[item] ? styles.checkboxChecked : null]}>
												{sopChecked[item] ? <Text style={styles.checkboxTick}>✓</Text> : null}
											</View>
											<Text
												style={[styles.lineItemText, sopChecked[item] ? styles.lineItemTextChecked : null]}
												disableDynamicFontSize
												adjustsFontSizeToFit={false}
											>
												{item}
											</Text>
										</Pressable>
									))
								)}

							</>
						)}
					</View>
				</ScrollView>

				{!isArrived ? (
					<View style={styles.floatingArrivedArea} pointerEvents="box-none">
						<Pressable
							style={[
								styles.markArrivedBtnWrap,
								!canMarkArrived ? styles.markArrivedBtnWrapDisabled : null,
							]}
							onPress={() => setIsArrived(true)}
							disabled={!canMarkArrived}
						>
							<LinearGradient
								colors={canMarkArrived ? ["#1A4A7D", "#0B2D57"] : ["#94A3B8", "#64748B"]}
								start={{ x: 0, y: 0 }}
								end={{ x: 1, y: 1 }}
								style={styles.markArrivedBtn}
							>
								<Text style={styles.primaryBtnText}>Mark as Arrived</Text>
							</LinearGradient>
						</Pressable>
					</View>
				) : null}

				{isArrived ? (
					<View style={styles.floatingReportArea} pointerEvents="box-none">
						<Pressable style={styles.markArrivedBtnWrap} onPress={() => setShowReportModeModal(true)}>
							<LinearGradient
								colors={["#1A4A7D", "#0B2D57"]}
								start={{ x: 0, y: 0 }}
								end={{ x: 1, y: 1 }}
								style={styles.markArrivedBtn}
							>
								<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
									<ClipboardPen size={19} color="#FFFFFF" />
									<Text style={styles.primaryBtnText}>Incident Report</Text>
								</View>
							</LinearGradient>
						</Pressable>
					</View>
				) : null}
			</View>

			<Modal
				visible={showMapModal}
				transparent
				animationType="fade"
				onRequestClose={() => setShowMapModal(false)}
			>
				<View style={styles.modalBackdrop}>
					<View style={styles.mapModalCard}>
						<Text style={styles.mapModalTitle}>Navigate to Incident</Text>
						<Text style={styles.mapModalSubtitle}>Use +/- to zoom and orient before moving.</Text>

						<View style={styles.mapModalFrame}>
							<MapView
								ref={modalMapRef}
								style={styles.mapModalMap}
								region={modalMapRegion ?? incidentRegion}
								onRegionChangeComplete={(region) => setModalMapRegion(region)}
							>
								{incident.latitude && incident.longitude ? (
									<Marker
										coordinate={{ latitude: incident.latitude, longitude: incident.longitude }}
										title="Incident"
									/>
								) : null}
								{currentCoords ? (
									<Marker coordinate={currentCoords} title="You" pinColor="#2563EB" />
								) : null}
								{currentCoords && incident.latitude && incident.longitude ? (
									<Polyline
										coordinates={[
											currentCoords,
											{ latitude: incident.latitude, longitude: incident.longitude },
										]}
										strokeColor="#D7263D"
										strokeWidth={3}
									/>
								) : null}
							</MapView>

							<View style={styles.zoomControls}>
								<Pressable style={styles.zoomBtn} onPress={() => onZoomModalMap("in")}>
									<Text style={styles.zoomBtnText}>+</Text>
								</Pressable>
								<Pressable style={styles.zoomBtn} onPress={() => onZoomModalMap("out")}>
									<Text style={styles.zoomBtnText}>-</Text>
								</Pressable>
							</View>
						</View>

						<View style={styles.mapModalActions}>
							<Pressable style={[styles.mapModalBtn, styles.mapModalBtnPrimary]} onPress={onRecenterModalMap}>
								<Text style={styles.mapModalBtnPrimaryText}>Recenter Map</Text>
							</Pressable>
							<Pressable
								style={[styles.mapModalBtn, styles.mapModalBtnSecondary]}
								onPress={() => setShowMapModal(false)}
							>
								<Text style={styles.mapModalBtnSecondaryText}>Close</Text>
							</Pressable>
						</View>
					</View>
				</View>
			</Modal>

			<Modal
				visible={showBackupModal}
				transparent
				animationType="fade"
				presentationStyle="overFullScreen"
				statusBarTranslucent
				navigationBarTranslucent
				onRequestClose={() => setShowBackupModal(false)}
			>
				<View style={styles.backupModalBackdrop}>
					<LinearGradient
						colors={["#FFECEB", "#F4DFEF", "#170075"]}
						locations={[0.08, 0.52, 1]}
						start={{ x: 0.08, y: 0.02 }}
						end={{ x: 0.88, y: 1 }}
						style={styles.backupModalCard}
					>
						<Pressable style={styles.backupModalCloseIconBtn} onPress={() => setShowBackupModal(false)}>
							<Text style={styles.backupModalCloseIconText}>×</Text>
						</Pressable>
						<Text style={styles.backupModalTitle}>REQUEST BACKUP</Text>
						<Text style={styles.backupModalSubtitle}>Pick the amount of officer(s) for backup</Text>

						<View style={styles.backupModalCountGrid}>
							{["1", "2", "3", "4", "5+"].map((count) => {
								const selected = backupCount === count;
								return (
									<Pressable
										key={count}
										style={[styles.backupModalCountTileWrap, selected ? styles.backupModalCountTileWrapActive : null]}
										onPress={() => setBackupCount(count)}
									>
										<LinearGradient
											colors={selected ? ["#0E2D52", "#1A4A7A"] : ["#36475B", "#EF5449"]}
											start={{ x: 0.1, y: 0 }}
											end={{ x: 0.9, y: 1 }}
											style={styles.backupModalCountTile}
										>
											<View style={styles.backupModalPeopleRow}>
												{Array.from({ length: count === "1" ? 1 : count === "2" ? 2 : count === "3" ? 3 : count === "4" ? 4 : 5 }).map((_, index) => (
													<View
														key={`${count}-${index}`}
														style={[styles.backupModalPerson, index > 0 ? styles.backupModalPersonOffset : null]}
													>
														<View style={styles.backupModalPersonHead} />
														<View style={styles.backupModalPersonBody} />
													</View>
												))}
											</View>
											<Text style={styles.backupModalCountText}>{count}</Text>
										</LinearGradient>
									</Pressable>
								);
							})}
						</View>

						<Text style={styles.backupModalInputLabel}>Short Reason:</Text>
						<View style={styles.backupModalInputShell}>
							<TextInput
								style={styles.backupModalInput}
								value={backupReason}
								onChangeText={(value) => setBackupReason(value.slice(0, 80))}
								placeholder="..."
								placeholderTextColor="#40304D"
								maxLength={80}
								multiline
								textAlignVertical="top"
							/>
							<Text style={styles.backupModalCharCount}>({backupReason.length}/80 characters)</Text>
						</View>

						<Pressable style={styles.backupModalConfirmWrap} onPress={onConfirmBackup}>
							<LinearGradient
								colors={["#0E2D52", "#09213D"]}
								start={{ x: 0.5, y: 0 }}
								end={{ x: 0.5, y: 1 }}
								style={styles.backupModalConfirmBtn}
							>
								<Text style={styles.backupModalConfirmText}>CONFIRM</Text>
							</LinearGradient>
						</Pressable>
					</LinearGradient>
				</View>
			</Modal>

			<Modal
				visible={showReportModeModal}
				transparent
				animationType="fade"
				onRequestClose={() => setShowReportModeModal(false)}
			>
				<View style={styles.modalBackdrop}>
					<View style={styles.modeCard}>
						<Pressable style={styles.modalCloseIconBtn} onPress={() => setShowReportModeModal(false)}>
							<Text style={styles.modalCloseIconText}>×</Text>
						</Pressable>
						<Text style={styles.modeTitle}>HANDOVER / RESOLVED</Text>
						<Text style={styles.modeSubtitle}>Pick the status of the incident report</Text>

						<Pressable
							style={[styles.modeBtn, styles.modeBtnHandover]}
							onPress={() => onOpenIncidentReport("Handover")}
						>
							<Text style={[styles.modeBtnText, styles.modeBtnTextHandover]}>Hand Over</Text>
						</Pressable>

						<Text style={styles.modeOrText}>OR</Text>

						<Pressable
							style={[styles.modeBtn, styles.modeBtnResolved]}
							onPress={() => onOpenIncidentReport("Resolved")}
						>
							<Text style={[styles.modeBtnText, styles.modeBtnTextResolved]}>Resolved</Text>
						</Pressable>
					</View>
				</View>
			</Modal>

			<Modal
				visible={showBackupSuccessModal}
				transparent
				animationType="fade"
				presentationStyle="overFullScreen"
				statusBarTranslucent
				navigationBarTranslucent
				onRequestClose={() => setShowBackupSuccessModal(false)}
			>
				<View style={styles.successModalBackdrop}>
					<View style={styles.successModalCard}>
						<Text style={styles.successModalEyebrow}>BACKUP REQUEST SENT</Text>
						<Text style={styles.successModalTitle}>Help is on the way</Text>
						<Text style={styles.successModalBody}>
							Requested {backupSuccessCount} officer(s) for support.{"\n"}
							Your supervisor can now review the request.
						</Text>

						<Pressable style={styles.successModalButtonWrap} onPress={() => setShowBackupSuccessModal(false)}>
							<LinearGradient
								colors={["#0E2D52", "#09213D"]}
								start={{ x: 0.5, y: 0 }}
								end={{ x: 0.5, y: 1 }}
								style={styles.successModalButton}
							>
								<Text style={styles.successModalButtonText}>OK</Text>
							</LinearGradient>
						</Pressable>
					</View>
				</View>
			</Modal>
		</SafeAreaView>
	);
}

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
	const R = 6371000;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

function toRad(value: number) {
	return (value * Math.PI) / 180;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: "#0E2D52",
	},
	loadingWrap: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
	},
	emptyText: {
		fontSize: 15,
		color: "#FFFFFF",
		fontWeight: "600",
	},
	topPanel: {
		backgroundColor: "#0E2D52",
		paddingBottom: 2,
	},
	header: {
		paddingHorizontal: 12,
		paddingTop: 40,
		paddingBottom: 8,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	headerTitle: {
		flex: 1,
		marginHorizontal: 10,
		fontSize: 24,
		lineHeight: 22,
		fontWeight: "600",
		color: "#FFFFFF",
	},
	iconBtn: {
		width: 40,
		height: 40,
		borderRadius: 10,
		backgroundColor: "rgba(255,255,255,0.12)",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.18)",
		alignItems: "center",
		justifyContent: "center",
	},
	bodyPanel: {
		flex: 1,
		backgroundColor: "#F6F6F7",
		borderTopLeftRadius: 30,
		borderTopRightRadius: 30,
		overflow: "hidden",
	},
	leftRail: {
		position: "absolute",
		left: 8,
		top: 16,
		bottom: 100,
		width: 7,
		borderRadius: 14,
		backgroundColor: "#5074A6",
	},
	scrollContent: {
		paddingHorizontal: 22,
		paddingTop: 16,
		paddingBottom: 36,
	},
	scrollContentWithFloatingArrivedBtn: {
		paddingBottom: 126,
	},
	scrollContentWithFloatingReportBtn: {
		paddingBottom: 126,
	},
	card: {
		backgroundColor: "transparent",
	},
	incidentTitle: {
		fontSize: 20,
		lineHeight: 24,
		fontWeight: "800",
		color: "#0E2D52",
		textTransform: "uppercase",
	},
	unitText: {
		marginTop: 2,
		fontSize: 13,
		lineHeight: 22,
		fontWeight: "700",
		color: "#0059D6",
		marginBottom: 6,
	},
	mapCard: {
		borderRadius: 12,
		overflow: "hidden",
		borderWidth: 1,
		borderColor: "#D9E2EC",
	},
	map: {
		height: 150,
	},
	mapHint: {
		marginTop: 8,
		alignSelf: "flex-start",
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 999,
		backgroundColor: "#E7EDF6",
	},
	mapHintText: {
		fontSize: 12,
		fontWeight: "700",
		color: "#274C77",
	},
	cctvRow: {
		marginTop: 0,
		flexDirection: "row",
		gap: 0,
	},
	cctvImage: {
		flex: 1,
		height: 103,
	},
	cctvPlaceholder: {
		flex: 1,
		height: 103,
		backgroundColor: "#D7DEE8",
		alignItems: "center",
		justifyContent: "center",
	},
	cctvPlaceholderText: {
		fontSize: 12,
		color: "#5B6472",
		fontWeight: "700",
	},
	predictionBox: {
		marginTop: 12,
		borderRadius: 999,
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	predictionTitle: {
		textAlign: "center",
		fontSize: 16,
		fontWeight: "700",
		color: "#111827",
		marginBottom: 8,
	},
	predictionRow: {
		flexDirection: "row",
		justifyContent: "center",
		gap: 10,
	},
	answerBtnTrue: {
		minWidth: 106,
		height: 38,
		borderRadius: 999,
		backgroundColor: "#16A34A",
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#000000",
		shadowOpacity: 0.15,
		shadowRadius: 6,
		shadowOffset: { width: 0, height: 2 },
		elevation: 3,
	},
	answerBtnFalse: {
		minWidth: 106,
		height: 38,
		borderRadius: 999,
		backgroundColor: "#DC2626",
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#000000",
		shadowOpacity: 0.15,
		shadowRadius: 6,
		shadowOffset: { width: 0, height: 2 },
		elevation: 3,
	},
	answerBtnActive: {
		transform: [{ scale: 1.03 }],
		borderWidth: 2,
		borderColor: "#FFFFFF",
	},
	answerBtnText: {
		color: "#FFFFFF",
		fontSize: 15,
		fontWeight: "900",
	},
	sectionHeader: {
		marginTop: 14,
		marginBottom: 8,
		fontSize: 16,
		lineHeight: 22,
		fontWeight: "700",
		color: "#0E2D52",
	},
	lineItem: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 8,
		marginBottom: 6,
	},
	checkbox: {
		marginTop: 2,
		width: 16,
		height: 16,
		borderWidth: 1.5,
		borderColor: "#111827",
		backgroundColor: "#FFFFFF",
		alignItems: "center",
		justifyContent: "center",
	},
	checkboxChecked: {
		backgroundColor: "#0E2D52",
		borderColor: "#0E2D52",
	},
	checkboxTick: {
		color: "#FFFFFF",
		fontSize: 11,
		fontWeight: "900",
	},
	lineItemText: {
		flex: 1,
		fontSize: 14,
		lineHeight: 18,
		fontWeight: "600",
		color: "#1E293B",
	},
	lineItemTextChecked: {
		textDecorationLine: "line-through",
		opacity: 0.7,
	},
	testingModeRow: {
		marginTop: 10,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: "#DCE6F3",
		borderRadius: 14,
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	testingModeLabel: {
		fontSize: 14,
		fontWeight: "800",
		color: "#26415E",
	},
	testingModeToggle: {
		minWidth: 60,
		height: 28,
		borderRadius: 999,
		backgroundColor: "#64748B",
		alignItems: "center",
		justifyContent: "center",
	},
	testingModeToggleOn: {
		backgroundColor: "#2563EB",
	},
	testingModeToggleText: {
		fontSize: 12,
		fontWeight: "900",
		color: "#FFFFFF",
	},
	distanceHint: {
		marginTop: 10,
		fontSize: 13,
		fontWeight: "600",
		color: "#7C2D12",
	},
	markArrivedBtnWrap: {
		alignSelf: "center",
		borderRadius: 999,
		shadowColor: "#08203B",
		shadowOpacity: 0.35,
		shadowRadius: 10,
		shadowOffset: { width: 0, height: 5 },
		elevation: 7,
	},
	markArrivedBtnWrapDisabled: {
		opacity: 0.82,
	},
	markArrivedBtn: {
		height: 48,
		minWidth: 210,
		paddingHorizontal: 34,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
		flexDirection: "row",
		gap: 8,
	},
	floatingArrivedArea: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 22,
		alignItems: "center",
	},
	floatingReportArea: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 22,
		alignItems: "center",
	},
	primaryBtn: {
		marginTop: 14,
		alignSelf: "center",
		minHeight: 40,
		paddingHorizontal: 18,
		paddingVertical: 9,
		borderRadius: 999,
		backgroundColor: "#0E2D52",
		borderWidth: 1,
		borderColor: "rgba(160,176,192,0.4)",
		alignItems: "center",
		justifyContent: "center",
		flexDirection: "row",
		gap: 8,
		shadowColor: "#0E2D52",
		shadowOpacity: 0.1,
		shadowRadius: 6,
		shadowOffset: { width: 0, height: 4 },
		elevation: 2,
	},
	checklistLoadingBtn: {
		alignSelf: "flex-start",
		marginTop: 2,
	},
	primaryBtnText: {
		fontSize: 15,
		fontWeight: "800",
		color: "#FFFFFF",
	},
	actionsRow: {
		marginTop: 12,
		flexDirection: "row",
		gap: 8,
	},
	actionBtn: {
		minHeight: 30,
		paddingHorizontal: 12,
		borderRadius: 999,
		borderWidth: 1,
		borderColor: "rgba(160,176,192,0.4)",
		alignItems: "center",
		justifyContent: "center",
		flexDirection: "row",
		gap: 6,
		shadowColor: "#0E2D52",
		shadowOpacity: 0.1,
		shadowRadius: 6,
		shadowOffset: { width: 0, height: 4 },
		elevation: 2,
	},
	backupBtn: {
		backgroundColor: "#FFEBDD",
	},
	hotlineBtn: {
		backgroundColor: "#EEF7FF",
	},
	actionBtnText: {
		color: "#9C2222",
		fontWeight: "700",
		fontSize: 14,
	},
	hotlineBtnText: {
		color: "#5A6E85",
		fontWeight: "700",
		fontSize: 14,
	},
	modalBackdrop: {
		flex: 1,
		backgroundColor: "rgba(5,16,30,0.6)",
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 18,
	},
	modalCard: {
		width: "100%",
		maxWidth: 380,
		borderRadius: 32,
		backgroundColor: "#F4E7EF",
		borderWidth: 3,
		borderColor: "#3F1FB6",
		paddingHorizontal: 18,
		paddingTop: 28,
		paddingBottom: 26,
		minHeight: 420,
	},
	modalCloseIconBtn: {
		position: "absolute",
		top: 8,
		right: 10,
		width: 32,
		height: 32,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
		zIndex: 2,
	},
	modalCloseIconText: {
		fontSize: 30,
		lineHeight: 22,
		fontWeight: "700",
		color: "#0E2D52",
	},
	mapModalCard: {
		width: "100%",
		maxWidth: 420,
		borderRadius: 24,
		backgroundColor: "#F8FAFD",
		borderWidth: 2,
		borderColor: "#CBD9EA",
		paddingHorizontal: 14,
		paddingTop: 14,
		paddingBottom: 12,
	},
	mapModalTitle: {
		marginTop: 40,
		fontSize: 24,
		fontWeight: "900",
		color: "#163A67",
		textAlign: "center",
	},
	mapModalSubtitle: {
		marginTop: 4,
		fontSize: 13,
		fontWeight: "700",
		color: "#47678A",
		textAlign: "center",
	},
	mapModalFrame: {
		marginTop: 10,
		height: 400,
		borderRadius: 16,
		overflow: "hidden",
		borderWidth: 1,
		borderColor: "#C7D2E0",
	},
	mapModalMap: {
		flex: 1,
	},
	zoomControls: {
		position: "absolute",
		right: 10,
		top: 10,
		gap: 8,
	},
	zoomBtn: {
		width: 40,
		height: 40,
		borderRadius: 10,
		backgroundColor: "rgba(255,255,255,0.92)",
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderColor: "#B7C7DB",
	},
	zoomBtnText: {
		fontSize: 24,
		lineHeight: 26,
		fontWeight: "900",
		color: "#173E6B",
	},
	mapModalActions: {
		marginTop: 12,
		flexDirection: "row",
		gap: 10,
	},
	mapModalBtn: {
		flex: 1,
		height: 44,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	mapModalBtnPrimary: {
		backgroundColor: "#0E2D52",
	},
	mapModalBtnSecondary: {
		backgroundColor: "#E2E8F0",
	},
	mapModalBtnPrimaryText: {
		fontSize: 14,
		fontWeight: "900",
		color: "#FFFFFF",
	},
	mapModalBtnSecondaryText: {
		fontSize: 14,
		fontWeight: "800",
		color: "#334155",
	},
	modalTitle: {
		marginTop: 12,
		fontSize: 35,
		fontWeight: "900",
		textAlign: "center",
		color: "#163A67",
	},
	modalSubtitle: {
		fontSize: 13,
		textAlign: "center",
		fontWeight: "700",
		color: "#7E6B9A",
		marginTop: 6,
	},
	backupCountRow: {
		marginTop: 16,
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
		justifyContent: "center",
	},
	backupCountBtn: {
		width: 62,
		height: 62,
		borderRadius: 14,
		backgroundColor: "#475569",
		alignItems: "center",
		justifyContent: "center",
	},
	backupCountBtnActive: {
		borderWidth: 2,
		borderColor: "#C6D4FF",
		backgroundColor: "#EF4444",
	},
	backupCountText: {
		fontSize: 24,
		fontWeight: "800",
		color: "#FFFFFF",
	},
	modalInputLabel: {
		marginTop: 16,
		fontSize: 13,
		fontWeight: "700",
		color: "#111827",
	},
	modalInput: {
		marginTop: 6,
		height: 78,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: "#4C1D95",
		backgroundColor: "#E2E8F0",
		paddingHorizontal: 12,
		paddingVertical: 8,
		fontSize: 14,
		color: "#0F172A",
	},
	modalConfirmBtn: {
		marginTop: 14,
		alignSelf: "center",
		height: 40,
		minWidth: 160,
		borderRadius: 12,
		backgroundColor: "#0B2D57",
		alignItems: "center",
		justifyContent: "center",
	},
	modalConfirmBtnText: {
		fontSize: 14,
		fontWeight: "900",
		color: "#FFFFFF",
	},
	backupModalBackdrop: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.73)",
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 16,
	},
	backupModalCard: {
		width: "100%",
		maxWidth: 362,
		minHeight: 537,
		borderRadius: 27,
		borderWidth: 3,
		borderColor: "#2A008D",
		paddingHorizontal: 26,
		paddingTop: 18,
		paddingBottom: 18,
	},
	backupModalCloseIconBtn: {
		alignSelf: "flex-end",
		width: 32,
		height: 32,
		alignItems: "center",
		justifyContent: "center",
	},
	backupModalCloseIconText: {
		fontSize: 26,
		lineHeight: 26,
		fontWeight: "700",
		color: "#0E2D52",
	},
	backupModalTitle: {
		marginTop: 4,
		fontSize: 20,
		lineHeight: 22,
		fontWeight: "800",
		textAlign: "center",
		color: "#0E2D52",
	},
	backupModalSubtitle: {
		marginTop: 2,
		fontSize: 11,
		lineHeight: 13,
		fontWeight: "700",
		textAlign: "center",
		color: "rgba(85,55,106,0.65)",
	},
	backupModalCountGrid: {
		marginTop: 18,
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "flex-start",
		columnGap: 14,
		rowGap: 16,
	},
	backupModalCountTileWrap: {
		width: "30%",
		minWidth: 87,
		borderRadius: 14,
	},
	backupModalCountTileWrapActive: {
		shadowColor: "#FFFFFF",
		shadowOpacity: 0.9,
		shadowRadius: 6,
		shadowOffset: { width: 0, height: 0 },
		elevation: 6,
	},
	backupModalCountTile: {
		height: 113,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "space-between",
		paddingTop: 24,
		paddingBottom: 12,
	},
	backupModalPeopleRow: {
		flexDirection: "row",
		alignItems: "flex-end",
		justifyContent: "center",
		minHeight: 42,
	},
	backupModalPerson: {
		alignItems: "center",
	},
	backupModalPersonOffset: {
		marginLeft: -3,
	},
	backupModalPersonHead: {
		width: 12,
		height: 12,
		borderRadius: 6,
		borderWidth: 2.5,
		borderColor: "#FFFFFF",
	},
	backupModalPersonBody: {
		marginTop: 4,
		width: 18,
		height: 12,
		borderTopLeftRadius: 9,
		borderTopRightRadius: 9,
		borderWidth: 2.5,
		borderBottomWidth: 0,
		borderColor: "#FFFFFF",
	},
	backupModalCountText: {
		fontSize: 24,
		lineHeight: 22,
		fontWeight: "700",
		textAlign: "center",
		color: "#FFFFFF",
	},
	backupModalInputLabel: {
		marginTop: 18,
		fontSize: 13,
		lineHeight: 17,
		fontWeight: "400",
		letterSpacing: 0.26,
		color: "#000000",
	},
	backupModalInputShell: {
		marginTop: 6,
		height: 82,
		borderRadius: 19,
		borderWidth: 1,
		borderColor: "#2A008D",
		backgroundColor: "rgba(239,232,244,0.56)",
		paddingHorizontal: 14,
		paddingTop: 8,
		paddingBottom: 8,
	},
	backupModalInput: {
		flex: 1,
		fontSize: 14,
		lineHeight: 17,
		color: "#000000",
		paddingHorizontal: 0,
		paddingVertical: 0,
	},
	backupModalCharCount: {
		marginTop: 4,
		fontSize: 14,
		lineHeight: 17,
		textAlign: "right",
		color: "#000000",
	},
	backupModalConfirmWrap: {
		marginTop: 16,
		alignSelf: "center",
	},
	backupModalConfirmBtn: {
		width: 160,
		height: 40,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "rgba(170,195,199,0.4)",
		alignItems: "center",
		justifyContent: "center",
	},
	backupModalConfirmText: {
		fontSize: 15,
		lineHeight: 20,
		fontWeight: "700",
		color: "#E6E6E6",
	},
	successModalBackdrop: {
		flex: 1,
		backgroundColor: "rgba(5,16,30,0.68)",
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 24,
	},
	successModalCard: {
		width: "100%",
		maxWidth: 340,
		borderRadius: 26,
		backgroundColor: "#F8EEE8",
		borderWidth: 2,
		borderColor: "#C46A4A",
		paddingHorizontal: 24,
		paddingTop: 24,
		paddingBottom: 22,
	},
	successModalEyebrow: {
		fontSize: 16,
		fontWeight: "800",
		letterSpacing: 1.2,
		textAlign: "center",
		color: "#B45309",
	},
	successModalTitle: {
		marginTop: 20,
		fontSize: 24,
		lineHeight: 28,
		fontWeight: "900",
		textAlign: "center",
		color: "#0E2D52",
	},
	successModalBody: {
		marginTop: 10,
		fontSize: 14,
		lineHeight: 20,
		fontWeight: "600",
		textAlign: "center",
		color: "#334155",
	},
	successModalButtonWrap: {
		marginTop: 18,
		alignSelf: "center",
	},
	successModalButton: {
		minWidth: 152,
		height: 42,
		paddingHorizontal: 18,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	successModalButtonText: {
		fontSize: 15,
		fontWeight: "800",
		color: "#E6E6E6",
	},
	modeCard: {
		width: "100%",
		maxWidth: 380,
		borderRadius: 28,
		backgroundColor: "#F1EFEA",
		borderWidth: 3,
		borderColor: "#3F1FB6",
		paddingHorizontal: 22,
		paddingTop: 22,
		paddingBottom: 24,
	},
	modeTitle: {
		fontSize: 21,
		fontWeight: "900",
		textAlign: "center",
		color: "#163A67",
	},
	modeSubtitle: {
		marginTop: 6,
		fontSize: 13,
		fontWeight: "700",
		textAlign: "center",
		color: "#7E6B9A",
	},
	modeBtn: {
		marginTop: 16,
		height: 54,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
	},
	modeBtnHandover: {
		backgroundColor: "#D9D5FF",
	},
	modeBtnResolved: {
		backgroundColor: "#B7E5D2",
	},
	modeBtnText: {
		fontSize: 19,
		fontWeight: "800",
	},
	modeBtnTextHandover: {
		color: "#6B4EA0",
	},
	modeBtnTextResolved: {
		color: "#0B6B4A",
	},
	modeOrText: {
		marginTop: 12,
		textAlign: "center",
		fontSize: 36,
		fontWeight: "900",
		color: "#7E6B9A",
	},
});
