import React, { useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Image,
	ImageBackground,
	Pressable,
	StyleSheet,
	View,
} from "react-native";
import Text from "../../components/TranslatedText";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import QRCode from "react-native-qrcode-svg";
import { supabase } from "../../lib/supabase";

const AVATAR_BUCKET = "profile-photos";
const USE_SIGNED_URL = true;

type EmployeeCard = {
	id: string;
	emp_id: string | null;
	first_name: string | null;
	last_name: string | null;
	role: string | null;
	created_at: string | null;
	profile_photo_path: string | null;
};

export default function IdCardScreen() {
	const router = useRouter();

	const [loading, setLoading] = useState(true);
	const [profile, setProfile] = useState<EmployeeCard | null>(null);
	const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
	const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [reloadToken, setReloadToken] = useState(0);

	useEffect(() => {
		let alive = true;

		const getAvatarUrlFromFolder = async (userId: string) => {
			const folder = `employees/${userId}`;

			const { data: files, error: listError } = await supabase.storage
				.from(AVATAR_BUCKET)
				.list(folder, { limit: 10, sortBy: { column: "name", order: "asc" } });

			if (listError || !files || files.length === 0) return null;

			const file = files.find((f) => f.name && !f.name.endsWith("/")) ?? files[0];
			if (!file?.name) return null;

			const fullPath = `${folder}/${file.name}`;

			if (USE_SIGNED_URL) {
				const { data, error } = await supabase.storage
					.from(AVATAR_BUCKET)
					.createSignedUrl(fullPath, 60 * 60);
				if (error) return null;
				return data?.signedUrl ?? null;
			}

			const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(fullPath);
			return data.publicUrl ?? null;
		};

		const getAvatarUrlFromPath = async (rawPath: string) => {
			const trimmed = rawPath.trim();
			if (/^https?:\/\//i.test(trimmed)) return trimmed;

			let path = trimmed.replace(/^\/+/, "");
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

		const loadProfile = async () => {
			setLoadError(null);

			const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
			let userId = sessionData.session?.user.id ?? null;
			let userEmail = sessionData.session?.user.email ?? null;

			if (!userId || !userEmail) {
				const { data: userData } = await supabase.auth.getUser();
				userId = userId ?? userData.user?.id ?? null;
				userEmail = userEmail ?? userData.user?.email ?? null;
			}

			if (!userId) {
				if (alive) setLoadError(sessionError?.message ?? "Unable to load user session.");
				if (alive) setLoading(false);
				return;
			}

			const { data: employeeById, error: employeeByIdError } = await supabase
				.from("employees")
				.select("id, emp_id, first_name, last_name, role, created_at, profile_photo_path")
				.eq("id", userId)
				.maybeSingle();

			let employee = employeeById as EmployeeCard | null;

			// Some seeded accounts may not have employees.id matching auth.uid().
			if (!employee && userEmail) {
				const { data: employeeByEmail } = await supabase
					.from("employees")
					.select("id, emp_id, first_name, last_name, role, created_at, profile_photo_path")
					.eq("email", userEmail)
					.maybeSingle();
				employee = (employeeByEmail as EmployeeCard | null) ?? null;
			}

			if (!alive) return;

			if (!employee) {
				if (employeeByIdError) {
					setLoadError(employeeByIdError.message);
				} else {
					setLoadError("Employee profile not found for this account.");
				}
				setLoading(false);
				return;
			}

			setProfile(employee);

			let resolvedUrl: string | null = null;
			if (employee.profile_photo_path) {
				resolvedUrl = await getAvatarUrlFromPath(employee.profile_photo_path);
			}
			if (!resolvedUrl) {
				resolvedUrl = await getAvatarUrlFromFolder(userId);
			}
			if (!alive) return;

			setAvatarUrl(resolvedUrl);
			setLoading(false);
		};

		void loadProfile();

		return () => {
			alive = false;
		};
	}, [reloadToken]);

	const fullName = useMemo(() => {
		const first = profile?.first_name?.trim() ?? "";
		const last = profile?.last_name?.trim() ?? "";
		return `${first} ${last}`.trim() || "Security Officer";
	}, [profile?.first_name, profile?.last_name]);

	const roleText = useMemo(() => {
		return profile?.role?.trim() || "Officer";
	}, [profile?.role]);

	const yearMonthText = useMemo(() => {
		if (!profile?.created_at) return "--/--";
		const dt = new Date(profile.created_at);
		if (!Number.isFinite(dt.getTime())) return "--/--";
		const yy = String(dt.getFullYear()).slice(-2);
		const mm = String(dt.getMonth() + 1).padStart(2, "0");
		return `${yy}/${mm}`;
	}, [profile?.created_at]);

	const qrValue = useMemo(() => {
		if (profile?.emp_id?.trim()) return profile.emp_id.trim();
		return profile?.id ?? "security-officer-id";
	}, [profile?.emp_id, profile?.id]);

	return (
		<ImageBackground source={require("../../assets/srbackground.png")} style={styles.root} resizeMode="cover">
			<View style={styles.headerRow}>
				<Pressable style={styles.doneButton} onPress={() => router.back()}>
					<ChevronLeft size={20} color="#ffffff" />
					<Text style={styles.doneText}>ID Card</Text>
				</Pressable>
			</View>

			{loading ? (
				<View style={styles.loaderWrap}>
					<ActivityIndicator color="#1F2457" />
				</View>
			) : loadError ? (
				<View style={styles.errorWrap}>
					<Text style={styles.errorTitle}>Unable to load ID card</Text>
					<Text style={styles.errorText}>{loadError}</Text>
					<Pressable
						style={styles.retryButton}
						onPress={() => {
							setLoading(true);
							setReloadToken((value) => value + 1);
						}}
					>
						<Text style={styles.retryText}>Retry</Text>
					</Pressable>
				</View>
			) : (
				<View style={styles.cardWrap}>
					<View style={styles.cardTop}>
						<View style={styles.cardTitleRow}>
							<Text style={styles.orgText}>CERTIS CISCO</Text>
							<Text style={styles.yearText}>{yearMonthText}</Text>
						</View>

						<View style={styles.profileRow}>
							<View style={styles.avatarFrame}>
								<Image
									source={
										avatarUrl && !avatarLoadFailed
											? { uri: avatarUrl }
											: require("../../assets/fortis-logo.png")
									}
									onError={() => setAvatarLoadFailed(true)}
									style={styles.avatar}
								/>
							</View>
						</View>

						<Text style={styles.nameText}>{fullName}</Text>
						<Text style={styles.roleText}>{roleText}</Text>
					</View>

					<View style={styles.cardBottom}>
						<QRCode value={qrValue} size={150} />
						<Text style={styles.idText}>{profile?.emp_id ?? profile?.id ?? "-"}</Text>
					</View>
				</View>
			)}
		</ImageBackground>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: "#F4F4F4",
		paddingHorizontal: 18,
		paddingTop: 46,
	},
	headerRow: {
		marginBottom: 20,
	},
	doneButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		alignSelf: "flex-start",
	},
	doneText: {
		color: "#ffffff",
		fontSize: 28,
		fontWeight: "700",
	},
	loaderWrap: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	errorWrap: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 24,
		gap: 10,
	},
	errorTitle: {
		fontSize: 22,
		fontWeight: "700",
		color: "#1F2457",
	},
	errorText: {
		fontSize: 14,
		lineHeight: 20,
		color: "#6B7280",
		textAlign: "center",
	},
	retryButton: {
		marginTop: 10,
		backgroundColor: "#1F2457",
		paddingHorizontal: 18,
		paddingVertical: 10,
		borderRadius: 999,
	},
	retryText: {
		color: "#FFFFFF",
		fontSize: 14,
		fontWeight: "700",
	},
	cardWrap: {
		borderRadius: 18,
		overflow: "hidden",
		borderWidth: 1,
		borderColor: "rgba(0,0,0,0.08)",
		backgroundColor: "#fff",
        marginTop:70,
	},
	cardTop: {
		backgroundColor: "#0E2D52",
		paddingHorizontal: 16,
		paddingTop: 14,
		paddingBottom: 12,
	},
	cardTitleRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	orgText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "700",
	},
	yearText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "700",
	},
	profileRow: {
		marginTop: 12,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	avatarFrame: {
		width: 98,
		height: 98,
		borderRadius: 49,
		borderWidth: 3,
		borderColor: "#fff",
		overflow: "hidden",
		backgroundColor: "#E5E7EB",
	},
	avatar: {
		width: "100%",
		height: "100%",
	},
	nameText: {
		marginTop: 14,
		color: "#fff",
		fontSize: 36,
		fontWeight: "800",
	},
	roleText: {
		marginTop: 2,
		color: "#F8FAFC",
		fontSize: 20,
		fontWeight: "600",
	},
	cardBottom: {
		backgroundColor: "#F8FAFC",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 24,
		gap: 8,
	},
	idText: {
		color: "#111827",
		fontSize: 20,
		fontWeight: "600",
	},
});
