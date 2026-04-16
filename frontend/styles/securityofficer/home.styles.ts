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
    fontWeight: "900",
    fontSize: 17,
    marginTop: -3,
  },
  cardSubtitle: {
    textAlign: "center",
    color: "#000",
    opacity: 0.6,
    fontWeight: "800",
  },

  todayShiftCard: {
    marginHorizontal: 16,
    marginTop: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 35,
    borderWidth: 3,
    borderColor: "#F1A579",
  },
  todayInfoBlock: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "center",
    gap: 10,
    minHeight: 56,
  },
  todayInfoIconWrap: {
    justifyContent: "center",
    marginLeft: -70,
  },
  todayInfoTextCol: {
    justifyContent: "center",
    marginLeft: 30,
  },
  todayShiftLocation: {
    marginTop: 6,
    color: "#C12222",
    fontWeight: "700",
    textAlign: "center",
  },
  timelineWrap: {
    marginTop: 18,
    marginBottom: 18,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
  },
  timelineCenter: {
    flex: 1,
    alignItems: "center",
  },
  timelineTrack: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  timelineNow: {
    textAlign: "center",
    color: "#6B7280",
    fontWeight: "600",
    marginBottom: 4,
    marginTop: -20,
  },
  timelineBar: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#B5B8BC",
  },
  timelineEdgeLabel: {
    alignItems: "center",
  },
  timelineCaption: {
    color: "#6B7280",
    fontWeight: "700",
    fontSize: 12,
  },
  timelineValue: {
    marginTop: 2,
    color: "#1F2937",
    fontWeight: "800",
    fontSize: 18,
    letterSpacing: 0.5,
    marginLeft: 8,
    marginRight: 8,
  },
  clockInButton: {
    marginTop: -5,
    alignSelf: "center",
    backgroundColor: "#0E2D52",
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 5,
  },
  clockInButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },

  incidentCard: {
    borderColor: "#BA4F4F",
    backgroundColor: "rgba(255, 234, 215, 0.7)",
  },

  incidentsHeader: {
    marginTop: 8,
    marginHorizontal: 16,
    marginBottom: -2,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  scheduleHeader: {
    marginTop: 18,
    marginBottom: 10,
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
  shiftCard: {
    padding: 14,
    backgroundColor: "#ECECEC",
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  shiftDate: { fontSize: 13, fontWeight: "700", color: "#423E3E", opacity: 0.8 },
  shiftTime: { marginTop: 6, fontSize: 13, fontWeight: "700", opacity: 0.6 },
  viewArrow: { fontSize: 28, color: "#0E2D52", fontWeight: "700", marginLeft: 12 },
});