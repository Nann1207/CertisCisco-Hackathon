import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F7FA" },

  header: { height: 224, paddingTop: 44, paddingHorizontal: 16 },
  headerImage: { resizeMode: "cover" },

  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  profileRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  avatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#ddd" },

  hiText: { color: "#fff", fontSize: 20, fontWeight: "800" },
  welcomeText: { color: "#fff", fontSize: 20, fontWeight: "900", marginTop: 2 },

  headerIcons: { flexDirection: "row", gap: 14, marginTop: 6 },

  quickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },
  quickAction: { alignItems: "center", width: 80 },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#0E2D52",
    justifyContent: "center",
    alignItems: "center",
  },
  quickLabel: {
    marginTop: 8,
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },

  card: {
    marginHorizontal: 16,
    marginTop: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#FFAB7B",
  },
  cardTitle: {
    textAlign: "center",
    color: "#0E2D52",
    fontWeight: "700",
    fontSize: 16,
  },
  cardSubtitle: {
    textAlign: "center",
    marginTop: 4,
    color: "#000",
    opacity: 0.6,
    fontWeight: "700",
  },

  incidentCard: {
    borderColor: "#BA4F4F",
    backgroundColor: "rgba(255, 234, 215, 0.7)",
  },

  scheduleHeader: {
    marginTop: 10,
    marginHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#0E2D52" },
  viewAll: { fontSize: 13, fontWeight: "600", color: "#0E2D52" },

  shiftRow: {
    marginHorizontal: 16,
    padding: 12,
    backgroundColor: "#F2F2F2",
    borderRadius: 8,
  },
  shiftDate: { fontSize: 13, fontWeight: "700", color: "#423E3E", opacity: 0.8 },
  shiftTime: { marginTop: 6, fontSize: 13, fontWeight: "700", opacity: 0.6, textAlign: "center" },
});