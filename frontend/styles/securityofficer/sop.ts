import { StyleSheet, Dimensions } from "react-native";

const { width } = Dimensions.get("window");

// makes 2 perfect square cards per row with spacing
const CARD_SIZE = (width - 45) / 2;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },

  /* HEADER */
  header: {
    paddingTop: 40,
    paddingBottom: 12,
    backgroundColor: "#0E2D52",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },

  headerTitle: {
    color: "#fff",
    fontSize: 23,
    fontWeight: "700",
    marginLeft: 10,
  },

  search: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: 10,
    color: "#fff",
  },

  /* GRID */
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingTop: 20,
  },

  /* 🔥 UPDATED CARD */
  card: {
    width: CARD_SIZE,
    height: CARD_SIZE - 30, // makes it square-ish
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 15,
    marginBottom: 15,
    elevation: 3,

    justifyContent: "space-between",
  },

  cardBar: {
    height: 6,
    borderRadius: 10,
    width: "100%",
  },

  // NEW: icon + title row inside the card
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  cardTitle: {
    fontWeight: "700",
    fontSize: 16.5,
    color: "#0E2D52",
  },

  cardSubtitle: {
    fontSize: 12,
    color: "#5A6E85",
  },

  /* KEEP EVERYTHING BELOW SAME */
  content: {
    flex: 1,
    padding: 15,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
    color: "#0E2D52",
  },

  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  titleItem: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    elevation: 2,
  },

  titleText: {
    fontWeight: "600",
    color: "#0E2D52",
  },

  stepRow: {
    flexDirection: "row",
    marginBottom: 15,
  },

  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFE4E6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  stepNumberText: {
    fontWeight: "700",
    color: "#FF3D3D",
  },

  stepContent: {
    flex: 1,
  },

  stepShort: {
    fontWeight: "600",
    color: "#0E2D52",
  },

  stepDesc: {
    color: "#5A6E85",
    fontSize: 12,
  },

  tabRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginVertical: 15,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 5,
  },

  tab: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
    color: "#5A6E85",
    fontWeight: "600",
  },

  tabActive: {
    backgroundColor: "#0E2D52",
    color: "#fff",
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
});