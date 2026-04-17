import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  /* =======================
     GLOBAL
  ======================= */
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },

  /* =======================
     HEADER
  ======================= */
  header: {
    backgroundColor: "#0E2D52",
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 15,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  backBtn: {
    marginRight: 10,
  },

  headerTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
    marginRight: 24,
  },

  /* =======================
     DROPDOWN (replaces SEARCH BAR)
  ======================= */
  dropdownBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    paddingHorizontal: 10,
    marginTop: 10,
    height: 52,
  },

  titleSelectBtn: {
    flex: 1,
    marginLeft: 8,
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  titleSelectText: {
    color: "#fff",
    flex: 1,
    marginRight: 8,
    fontSize: 15,
    fontWeight: "600",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 14,
    maxHeight: "70%",
  },

  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0E2D52",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },

  modalList: {
    maxHeight: 360,
  },

  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  modalOptionActive: {
    backgroundColor: "#EFF6FF",
  },

  modalOptionText: {
    fontSize: 14,
    color: "#0F172A",
    flex: 1,
    marginRight: 8,
  },

  modalOptionTextActive: {
    color: "#1D4ED8",
    fontWeight: "700",
  },

  /* =======================
     PILLS (Guidelines / Logistics)
  ======================= */
  pillRow: {
    flexDirection: "row",
    marginTop: 10,
    gap: 10,
  },

  pill: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
  },

  pillActive: {
    backgroundColor: "#fff",
  },

  pillText: {
    color: "#A0B0C0",
    fontWeight: "600",
  },

  pillTextActive: {
    color: "#0E2D52",
  },

  /* =======================
     MAIN CARD
  ======================= */
  card: {
    backgroundColor: "#fff",
    marginTop: 5,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 15,
    flex: 1,
  },

  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  emojiBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#FFE9E9",
    alignItems: "center",
    justifyContent: "center",
  },

  emojiText: {
    fontSize: 18,
  },

  cardTitle: {
        fontSize: 16,
    fontWeight: "700",
    color: "#0E2D52",
  },

  metaText: {
    fontSize: 12,
    color: "#5A6E85",
    marginBottom: 10,
  },

  /* =======================
     MEDIA CHIPS (Images / Videos / Quiz) - Figma style
  ======================= */
  mediaTabRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: -8, // ✅ shift up/down here (smaller or negative = higher)
    marginBottom: 10,
  },

  mediaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },

  mediaChipActive: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  mediaChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },

  mediaChipTextActiveBlue: {
    color: "#2563EB",
  },

  mediaChipTextActiveRed: {
    color: "#EF4444",
  },

  mediaChipTextActiveOrange: {
    color: "#F59E0B",
  },

  /* =======================
     PLACEHOLDER IMAGE BOX
  ======================= */
  heroPlaceholder: {
    width: "100%",
    height: 150,
    borderRadius: 14,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  heroPlaceholderText: {
    color: "#64748B",
    fontWeight: "700",
    fontSize: 12,
  },

  /* =======================
     STEPS LIST
  ======================= */
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
    fontSize: 12,
    color: "#5A6E85",
  },
});