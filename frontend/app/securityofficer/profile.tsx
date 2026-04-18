import React, { useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Image,
	ImageBackground,
	Pressable,
	ScrollView,
	StyleSheet,
	TextInput,
	View,
} from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";

const AVATAR_BUCKET = "profile-photos";
const USE_SIGNED_URL = true;

type EmployeeProfile = {
	id: string;
	first_name: string | null;
	last_name: string | null;
	profile_photo_path: string | null;
	emp_id: string | null;
	role: string | null;
	email: string | null;
	phone: string | null;
	dob: string | null;
};

function calculateAge(dob: string | null) {
	if (!dob) return "-";
	const dobDate = new Date(dob);
	if (!Number.isFinite(dobDate.getTime())) return "-";

	const now = new Date();
	let years = now.getFullYear() - dobDate.getFullYear();
	const monthDiff = now.getMonth() - dobDate.getMonth();
	if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dobDate.getDate())) {
		years -= 1;
	}

	return years >= 0 ? String(years) : "-";
}

function formatDob(dob: string | null) {
	if (!dob) return "-";
	const date = new Date(dob);
	if (!Number.isFinite(date.getTime())) return "-";

	const dd = String(date.getDate()).padStart(2, "0");
	const mm = String(date.getMonth() + 1).padStart(2, "0");
	const yyyy = date.getFullYear();
	return `${dd}/${mm}/${yyyy}`;
}

export default function ProfileScreen() {
	const router = useRouter();

	const [loading, setLoading] = useState(true);
	const [profile, setProfile] = useState<EmployeeProfile | null>(null);
	const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
	const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
	const [phoneDraft, setPhoneDraft] = useState("");
	const [isSavingPhone, setIsSavingPhone] = useState(false);

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
					Alert.alert("Load failed", sessionError?.message ?? "Unable to load user session.");
				}
				return;
			}

			const { data: profileById, error: profileByIdError } = await supabase
				.from("employees")
				.select("id, first_name, last_name, profile_photo_path, emp_id, role, email, phone, dob")
				.eq("id", userId)
				.maybeSingle();

			let employee = profileById as EmployeeProfile | null;

			if (!employee && userEmail) {
				const { data: profileByEmail, error: profileByEmailError } = await supabase
					.from("employees")
					.select("id, first_name, last_name, profile_photo_path, emp_id, role, email, phone, dob")
					.eq("email", userEmail)
					.maybeSingle();

				if (profileByEmailError && !profileByIdError) {
					Alert.alert("Load failed", profileByEmailError.message);
				}
				employee = (profileByEmail as EmployeeProfile | null) ?? null;
			}

			if (!alive) return;

			if (!employee) {
				setLoading(false);
				Alert.alert("Load failed", profileByIdError?.message ?? "Employee profile not found.");
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
	}, []);

	const fullName = useMemo(() => {
		const first = profile?.first_name?.trim() ?? "";
		const last = profile?.last_name?.trim() ?? "";
		return `${first} ${last}`.trim() || "Security Officer";
	}, [profile?.first_name, profile?.last_name]);

	useEffect(() => {
		setPhoneDraft(profile?.phone?.trim() ?? "");
	}, [profile?.phone]);

	const roleText = profile?.role?.trim() || "Security Officer";
	const idText = profile?.emp_id?.trim() || "-";
	const ageText = calculateAge(profile?.dob ?? null);
	const dobText = formatDob(profile?.dob ?? null);

	const avatarSource =
		avatarUrl && !avatarLoadFailed
			? { uri: avatarUrl }
			: require("../../assets/fortis-logo.png");

	const isPhoneChanged = (profile?.phone?.trim() ?? "") !== phoneDraft.trim();

	const handleSavePhone = async () => {
		if (!profile || isSavingPhone || !isPhoneChanged) return;

		setIsSavingPhone(true);
		const cleanPhone = phoneDraft.trim();

		const { error: updateByIdError } = await supabase
			.from("employees")
			.update({ phone: cleanPhone || null })
			.eq("id", profile.id);

		let updateError = updateByIdError;

		if (updateByIdError && profile.email) {
			const { error: updateByEmailError } = await supabase
				.from("employees")
				.update({ phone: cleanPhone || null })
				.eq("email", profile.email);
			updateError = updateByEmailError;
		}

		setIsSavingPhone(false);

		if (updateError) {
			Alert.alert("Update failed", updateError.message);
			return;
		}

		setProfile((prev) => (prev ? { ...prev, phone: cleanPhone || null } : prev));
		Alert.alert("Saved", "Phone number updated successfully.");
	};

	return (
		<ImageBackground source={require("../../assets/srbackground.png")} style={styles.root} resizeMode="cover">
			{loading ? (
				<View style={styles.loaderWrap}>
					<ActivityIndicator color="#FFFFFF" />
				</View>
			) : (
				<>
					<View style={styles.headerRow}>
						<Pressable
							style={styles.backButton}
							onPress={() =>
								router.canGoBack() ? router.back() : router.replace("/securityofficer/home")
							}
						>
							<ChevronLeft size={27} color="#FFFFFF" strokeWidth={2.2} />
						</Pressable>
					</View>

					<ScrollView
						contentContainerStyle={styles.scrollContent}
						showsVerticalScrollIndicator={false}
					>
						<View style={styles.profileTop}>
							<Image source={avatarSource} style={styles.avatar} onError={() => setAvatarLoadFailed(true)} />
							<Text style={styles.nameText}>{fullName}</Text>
							<Text style={styles.roleText}>{roleText}</Text>
							<Text style={styles.idText}>{idText}</Text>
						</View>

						<Field label="First Name:" value={profile?.first_name?.trim() || "-"} readOnly />
						<Field label="Last Name:" value={profile?.last_name?.trim() || "-"} readOnly />
						<Field label="Date of Birth:" value={dobText} readOnly />
						<Field label="Age:" value={ageText} readOnly />
						<Field label="Email:" value={profile?.email?.trim() || "-"} isSmallText readOnly />
						<EditablePhoneField
							label="Phone Number:"
							value={phoneDraft}
							onChangeValue={setPhoneDraft}
						/>

						<View style={styles.editRow}>
							<Pressable
								style={[styles.editButton, (!isPhoneChanged || isSavingPhone) ? styles.editButtonDisabled : null]}
								onPress={() => {
									void handleSavePhone();
								}}
								disabled={!isPhoneChanged || isSavingPhone}
							>
								<Text style={styles.editButtonText}>{isSavingPhone ? "Saving" : "Save"}</Text>
							</Pressable>
						</View>
					</ScrollView>
				</>
			)}
		</ImageBackground>
	);
}

function Field({
	label,
	value,
	isSmallText,
	readOnly,
}: {
	label: string;
	value: string;
	isSmallText?: boolean;
	readOnly?: boolean;
}) {
	return (
		<View style={styles.fieldWrap}>
			<Text style={styles.fieldLabel}>{label}</Text>
			<View style={[styles.valuePill, readOnly ? styles.valuePillReadonly : null]}>
				<Text style={[styles.valueText, isSmallText ? styles.valueTextSmall : null]}>{value}</Text>
			</View>
		</View>
	);
}

function EditablePhoneField({
	label,
	value,
	onChangeValue,
}: {
	label: string;
	value: string;
	onChangeValue: (next: string) => void;
}) {
	return (
		<View style={styles.fieldWrap}>
			<Text style={styles.fieldLabel}>{label}</Text>
			<View style={styles.valuePill}>
				<TextInput
					value={value}
					onChangeText={onChangeValue}
					keyboardType="phone-pad"
					placeholder="Enter phone number"
					placeholderTextColor="#7A8798"
					style={styles.inputText}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
	},
	loaderWrap: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	headerRow: {
		paddingTop: 58,
		paddingHorizontal: 28,
	},
	backButton: {
		width: 34,
		height: 34,
		alignItems: "center",
		justifyContent: "center",
	},
	scrollContent: {
		paddingHorizontal: 28,
		paddingBottom: 22,
	},
	profileTop: {
		alignItems: "center",
		marginTop: 8,
		marginBottom: 10,
	},
	avatar: {
		width: 96,
		height: 96,
		borderRadius: 48,
		borderWidth: 2,
		borderColor: "#8FA3BA",
		backgroundColor: "#D1D5DB",
	},
	nameText: {
		marginTop: 10,
		color: "#F7FAFF",
		fontSize: 17,
		fontWeight: "600",
		lineHeight: 22,
	},
	roleText: {
		marginTop: 2,
		color: "#F0F6FF",
		fontSize: 10,
		fontWeight: "500",
	},
	idText: {
		marginTop: 2,
		color: "#F0F6FF",
		fontSize: 10,
		fontWeight: "500",
	},
	fieldWrap: {
		marginTop: 6,
	},
	fieldLabel: {
		marginBottom: 4,
		marginLeft: 10,
		color: "#9eb7db",
		fontSize: 11,
		fontWeight: "500",
	},
	valuePill: {
		height: 46,
		borderRadius: 23,
		backgroundColor: "#F4F7FB",
		borderWidth: 1.6,
		borderColor: "#EB9431",
		justifyContent: "center",
		paddingHorizontal: 16,
	},
	valuePillReadonly: {
		backgroundColor: "#abb1b9",
		borderColor: "#C6CED8",
	},
	valueText: {
		color: "#1C2C44",
		fontSize: 12,
		fontWeight: "500",
	},
	inputText: {
		color: "#1C2C44",
		fontSize: 12,
		fontWeight: "500",
		paddingVertical: 0,
	},
	valueTextSmall: {
		fontSize: 10,
	},
	editRow: {
		marginTop: 20,
		alignItems: "flex-end",
	},
	editButton: {
		minWidth: 98,
		height: 38,
		paddingHorizontal: 18,
		borderRadius: 19,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#F49A31",
	},
	editButtonDisabled: {
		opacity: 0.55,
	},
	editButtonText: {
		color: "#0C1B34",
		fontSize: 12,
		fontWeight: "700",
	},
});
