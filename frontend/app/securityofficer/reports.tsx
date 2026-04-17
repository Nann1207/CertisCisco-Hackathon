import React from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";
import Text from "../../components/TranslatedText";

export default function ReportsScreen() {
	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.content}>
				<Text style={styles.title}>Reports</Text>
				<Text style={styles.subtitle}>Report screen is ready.</Text>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#F3F6FA",
	},
	content: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 24,
	},
	title: {
		fontSize: 24,
		fontWeight: "700",
		color: "#1E2A38",
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 15,
		color: "#5E6A78",
		textAlign: "center",
	},
});
