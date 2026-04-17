import React, { useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Modal,
	Pressable,
	SafeAreaView,
	StyleSheet,
	View,
} from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import Text from "../../components/TranslatedText";
import {
	LanguagePreference,
	setLanguagePreference as setGlobalLanguagePreference,
} from "../../lib/language-preferences";

const LANGUAGE_OPTIONS: LanguagePreference[] = ["English", "Tamil", "Malay", "Chinese"];

export default function TranslateScreen() {
	const router = useRouter();

	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [modalVisible, setModalVisible] = useState(false);
	const [languagePreference, setLanguagePreference] = useState<LanguagePreference>("English");
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		let alive = true;

		const loadLanguagePreference = async () => {
			setLoadError(null);
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
					setLoadError(sessionError?.message ?? "Unable to load user session.");
					setLoading(false);
				}
				return;
			}

			const { data: employeeById, error: employeeByIdError } = await supabase
				.from("employees")
				.select("language_preferences")
				.eq("id", userId)
				.maybeSingle();

			let preference = employeeById?.language_preferences as LanguagePreference | null;

			if (!preference && userEmail) {
				const { data: employeeByEmail } = await supabase
					.from("employees")
					.select("language_preferences")
					.eq("email", userEmail)
					.maybeSingle();
				preference = (employeeByEmail?.language_preferences as LanguagePreference | null) ?? null;
			}

			if (!alive) return;

			if (employeeByIdError) {
				setLoadError(employeeByIdError.message);
				setLoading(false);
				return;
			}

			if (preference && LANGUAGE_OPTIONS.includes(preference)) {
				setLanguagePreference(preference);
			} else {
				setLanguagePreference("English");
			}

			setLoading(false);
		};

		void loadLanguagePreference();

		return () => {
			alive = false;
		};
	}, []);

	const subtitleText = useMemo(
		() => `Current preference: ${languagePreference}`,
		[languagePreference]
	);

	const updateLanguagePreference = async (nextValue: LanguagePreference) => {
		if (saving) return;

		setSaving(true);

		const { data: sessionData } = await supabase.auth.getSession();
		let userId = sessionData.session?.user.id ?? null;
		let userEmail = sessionData.session?.user.email ?? null;

		if (!userId || !userEmail) {
			const { data: userData } = await supabase.auth.getUser();
			userId = userId ?? userData.user?.id ?? null;
			userEmail = userEmail ?? userData.user?.email ?? null;
		}

		if (!userId) {
			setSaving(false);
			Alert.alert("Update failed", "Unable to identify the signed-in user.");
			return;
		}

		const { error: updateByIdError } = await supabase
			.from("employees")
			.update({ language_preferences: nextValue })
			.eq("id", userId);

		let updateError = updateByIdError;

		if (updateByIdError && userEmail) {
			const { error: updateByEmailError } = await supabase
				.from("employees")
				.update({ language_preferences: nextValue })
				.eq("email", userEmail);
			updateError = updateByEmailError;
		}

		setSaving(false);

		if (updateError) {
			Alert.alert("Update failed", updateError.message);
			return;
		}

		setGlobalLanguagePreference(nextValue);
		setModalVisible(false);
		Alert.alert("Saved", `Language preference updated to ${nextValue}.`);
	};

	return (
		<SafeAreaView style={styles.root}>
			<View style={styles.headerRow}>
				<Pressable style={styles.backButton} onPress={() => router.back()}>
					<ChevronLeft size={20} color="#1F2457" />
					<Text style={styles.headerTitle}>Translate</Text>
				</Pressable>
			</View>

			{loading ? (
				<View style={styles.centerWrap}>
					<ActivityIndicator color="#1F2457" />
				</View>
			) : loadError ? (
				<View style={styles.centerWrap}>
					<Text style={styles.errorTitle}>Unable to load language preference</Text>
					<Text style={styles.errorText}>{loadError}</Text>
				</View>
			) : (
				<View style={styles.contentCard}>
					<Text style={styles.label}>Language</Text>
					<Text style={styles.value}>{subtitleText}</Text>

					<Pressable
						style={[styles.primaryButton, saving ? styles.disabledButton : null]}
						onPress={() => setModalVisible(true)}
						disabled={saving}
					>
						<Text style={styles.primaryButtonText}>{saving ? "Saving..." : "Change Language"}</Text>
					</Pressable>
				</View>
			)}

			<Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
				<View style={styles.modalBackdrop}>
					<View style={styles.modalCard}>
						<Text style={styles.modalTitle}>Choose a language</Text>

						{LANGUAGE_OPTIONS.map((option) => {
							const active = option === languagePreference;
							return (
								<Pressable
									key={option}
									style={[styles.optionButton, active ? styles.optionButtonActive : null]}
									onPress={() => void updateLanguagePreference(option)}
									disabled={saving}
								>
									<Text style={[styles.optionText, active ? styles.optionTextActive : null]}>{option}</Text>
								</Pressable>
							);
						})}

						<Pressable style={styles.cancelButton} onPress={() => setModalVisible(false)} disabled={saving}>
							<Text style={styles.cancelText}>Cancel</Text>
						</Pressable>
					</View>
				</View>
			</Modal>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: "#F4F4F4",
		paddingHorizontal: 18,
		paddingTop: 50,
	},
	headerRow: {
		marginBottom: 20,
	},
	backButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		alignSelf: "flex-start",
	},
	headerTitle: {
		color: "#1F2457",
		fontSize: 28,
		fontWeight: "700",
	},
	centerWrap: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 20,
	},
	contentCard: {
		backgroundColor: "#FFFFFF",
		borderRadius: 16,
		borderWidth: 1,
		borderColor: "rgba(0,0,0,0.08)",
		padding: 18,
		gap: 12,
	},
	label: {
		fontSize: 14,
		color: "#6B7280",
		fontWeight: "600",
	},
	value: {
		fontSize: 20,
		color: "#111827",
		fontWeight: "700",
	},
	primaryButton: {
		marginTop: 6,
		backgroundColor: "#1F2457",
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 12,
	},
	disabledButton: {
		opacity: 0.6,
	},
	primaryButtonText: {
		color: "#FFFFFF",
		fontSize: 15,
		fontWeight: "700",
	},
	errorTitle: {
		fontSize: 20,
		color: "#1F2457",
		fontWeight: "700",
		textAlign: "center",
	},
	errorText: {
		marginTop: 8,
		fontSize: 14,
		lineHeight: 20,
		color: "#6B7280",
		textAlign: "center",
	},
	modalBackdrop: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.35)",
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 20,
	},
	modalCard: {
		width: "100%",
		maxWidth: 360,
		borderRadius: 14,
		backgroundColor: "#FFFFFF",
		padding: 16,
		gap: 10,
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: "700",
		color: "#111827",
		marginBottom: 6,
	},
	optionButton: {
		borderWidth: 1,
		borderColor: "#E5E7EB",
		borderRadius: 10,
		paddingVertical: 12,
		paddingHorizontal: 12,
	},
	optionButtonActive: {
		borderColor: "#1F2457",
		backgroundColor: "#EEF2FF",
	},
	optionText: {
		color: "#111827",
		fontSize: 15,
		fontWeight: "600",
	},
	optionTextActive: {
		color: "#1F2457",
		fontWeight: "700",
	},
	cancelButton: {
		marginTop: 2,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 10,
	},
	cancelText: {
		color: "#6B7280",
		fontSize: 15,
		fontWeight: "600",
	},
});
