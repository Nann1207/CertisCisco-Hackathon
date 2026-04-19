import React, { useCallback, useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Image,
	Pressable,
	SafeAreaView,
	StyleSheet,
	View,
} from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, Languages, LogOut, UserCircle2 } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../../lib/supabase";
import Text from "../../components/TranslatedText";
import {
	getLanguagePreference,
	LanguagePreference,
	subscribeLanguagePreference,
} from "../../lib/language-preferences";
import { translateText } from "../../lib/translator";

const AVATAR_BUCKET = "profile-photos";
const USE_SIGNED_URL = true;

type EmployeeProfile = {
	id: string;
	first_name: string | null;
	last_name: string | null;
	profile_photo_path: string | null;
	emp_id: string | null;
	role: string | null;
};

export default function SettingsScreen() {
	const router = useRouter();

	const [loading, setLoading] = useState(true);
	const [profile, setProfile] = useState<EmployeeProfile | null>(null);
	const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
	const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
	const [language, setLanguage] = useState<LanguagePreference>(
		getLanguagePreference()
	);

	useEffect(() => {
		return subscribeLanguagePreference(setLanguage);
	}, []);

	const translateForAlert = useCallback(async (value: string) => {
		if (language === "English") return value;
		return translateText(value, language);
	}, [language]);

	const showTranslatedAlert = useCallback(async (title: string, message: string) => {
		const [translatedTitle, translatedMessage] = await Promise.all([
			translateForAlert(title),
			translateForAlert(message),
		]);
		Alert.alert(translatedTitle, translatedMessage);
	}, [translateForAlert]);

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
					void showTranslatedAlert(
						"Load failed",
						sessionError?.message ?? "Unable to load user session."
					);
				}
				return;
			}

			const { data: profileById } = await supabase
				.from("employees")
				.select("id, first_name, last_name, profile_photo_path, emp_id, role")
				.eq("id", userId)
				.maybeSingle();

			let employee = profileById as EmployeeProfile | null;

			if (!employee && userEmail) {
				const { data: profileByEmail } = await supabase
					.from("employees")
					.select("id, first_name, last_name, profile_photo_path, emp_id, role")
					.eq("email", userEmail)
					.maybeSingle();
				employee = (profileByEmail as EmployeeProfile | null) ?? null;
			}

			if (!alive) return;

			if (!employee) {
				setLoading(false);
				void showTranslatedAlert("Load failed", "Employee profile not found.");
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
	}, [showTranslatedAlert]);

	const handleSignOut = async () => {
		const { error } = await supabase.auth.signOut();
		if (error) {
			void showTranslatedAlert("Sign out failed", error.message);
			return;
		}
		router.replace("/login");
	};

	const fullName = `${profile?.first_name?.trim() ?? ""} ${profile?.last_name?.trim() ?? ""}`.trim() || "Security Officer";
	const roleText = profile?.role?.trim() || "Security Officer";
	const idText = profile?.emp_id?.trim() || "-";

	return (
		<SafeAreaView style={styles.root}>
			<View style={styles.headerBar}>
				<Pressable
					style={styles.headerBackButton}
					onPress={() =>
						router.canGoBack() ? router.back() : router.replace("/securityofficer/home")
					}
				>
					<ChevronLeft color="#123560" size={26} strokeWidth={2.2} />
					<Text style={styles.headerTitle}>Settings</Text>
				</Pressable>
			</View>

			{loading ? (
				<View style={styles.loaderWrap}>
					<ActivityIndicator color="#0F2F57" />
				</View>
			) : (
				<>
					<LinearGradient colors={["#385E8C", "#0F2F57"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.profileCard}>
						<Image
							source={
								avatarUrl && !avatarLoadFailed
									? { uri: avatarUrl }
									: require("../../assets/fortis-logo.png")
							}
							onError={() => setAvatarLoadFailed(true)}
							style={styles.avatar}
						/>

						<View style={styles.profileTextCol}>
							<Text style={styles.nameText}>{fullName}</Text>
							<Text style={styles.metaText}>{roleText}</Text>
							<Text style={styles.metaText}>{idText}</Text>
						</View>
					</LinearGradient>

					<Pressable style={styles.rowCard} onPress={() => router.push("/securityofficer/languages")}> 
						<View style={styles.rowLeft}> 
							<Languages color="#123560" size={33} strokeWidth={2.1} />
							<Text style={styles.rowText}>Languages</Text>
						</View>
						<ChevronRight color="#123560" size={34} strokeWidth={2.2} />
					</Pressable>

					<Pressable style={styles.rowCard} onPress={() => router.push("/securityofficer/profile")}> 
						<View style={styles.rowLeft}> 
							<UserCircle2 color="#123560" size={38} strokeWidth={2.1} />
							<Text style={styles.rowText}>User Profile</Text>
						</View>
						<ChevronRight color="#123560" size={34} strokeWidth={2.2} />
					</Pressable>

					<Pressable style={[styles.rowCard, styles.lastRowCard]} onPress={() => void handleSignOut()}> 
						<View style={styles.rowLeft}> 
							<LogOut color="#123560" size={34} strokeWidth={2.1} />
							<Text style={styles.rowText}>Sign Out</Text>
						</View>
					</Pressable>
				</>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: "#CDD5E1",
	},
	headerBar: {
		height: 94,
		backgroundColor: "#FFFFFF",
		justifyContent: "flex-end",
		paddingHorizontal: 24,
		paddingBottom: 12,
	},
	headerTitle: {
		color: "#123560",
		fontSize: 28,
		fontWeight: "700",
	},
	headerBackButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		alignSelf: "flex-start",
	},
	loaderWrap: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	profileCard: {
		minHeight: 144,
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 24,
		gap: 14,
	},
	avatar: {
		width: 84,
		height: 84,
		borderRadius: 42,
		borderWidth: 2,
		borderColor: "#8EA0B7",
		backgroundColor: "#D1D5DB",
	},
	profileTextCol: {
		justifyContent: "center",
		gap: 2,
		flexShrink: 1,
	},
	nameText: {
		color: "#FFFFFF",
		fontSize: 20,
		fontWeight: "600",
	},
	metaText: {
		color: "#E5EDF7",
		fontSize: 14,
		fontWeight: "500",
	},
	rowCard: {
		height: 84,
		backgroundColor: "#CBD3DF",
		borderTopWidth: 1,
		borderTopColor: "rgba(255,255,255,0.45)",
		borderBottomWidth: 1,
		borderBottomColor: "rgba(10,25,47,0.06)",
		paddingHorizontal: 24,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	lastRowCard: {
		borderBottomWidth: 0,
	},
	rowLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 16,
		flexShrink: 1,
	},
	rowText: {
		color: "#123560",
		fontSize: 20,
		fontWeight: "700",
	},
});
