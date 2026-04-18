import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },

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

  dropdownBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    paddingHorizontal: 10,
    marginTop: 10,
    height: 50,
  },

  titleSelectBtn: {
    flex: 1,
    marginLeft: 8,
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: 6,
  },

  titleSelectText: {
    flex: 1,
    color: "#fff",
    fontWeight: "600",
    marginRight: 8,
  },

  pillRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 10,
    gap: 10,
  },

  pill: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
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

  card: {
    backgroundColor: "#fff",
    marginTop: 12,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 15,
    flex: 1,
  },

  stepsContentContainer: {
    paddingBottom: 30,
  },

  guidelinesTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0E2D52",
    marginTop: 6,
    marginBottom: 10,
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

  mediaTabRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
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

  /* IMAGE CARD + EXPAND ICON */
  heroImageWrap: {
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
  },

  heroImage: {
    width: "100%",
    height: 192,
  },

  expandIcon: {
    position: "absolute",
    right: 10,
    bottom: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 12,
    padding: 6,
  },

  /* VIDEO WRAP */
  videoWrap: {
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: "#000",
  },

  /* QUIZ PLACEHOLDER (if you still use it anywhere) */
  quizPlaceholder: {
    width: "100%",
    height: 150,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  quizPlaceholderText: {
    color: "#64748B",
    fontWeight: "700",
    fontSize: 12,
  },

  /* STEPS LIST */
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

  /* TITLE MODAL */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 20,
  },

  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    maxHeight: "70%",
  },

  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0E2D52",
    marginBottom: 10,
  },

  modalList: {
    maxHeight: 420,
  },

  modalOption: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  modalOptionActive: {
    backgroundColor: "#EFF6FF",
  },

  modalOptionText: {
    color: "#0E2D52",
    fontWeight: "600",
    flex: 1,
    marginRight: 10,
  },

  modalOptionTextActive: {
    color: "#2563EB",
  },

  /* IMAGE MODAL */
  imageModalRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
  },

  imageModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },

  imageModalCloseBtn: {
    position: "absolute",
    top: 50,
    right: 18,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 18,
    padding: 6,
  },

  imageModalContent: {
    flex: 1,
    paddingTop: 90,
    paddingBottom: 40,
    paddingHorizontal: 10,
    justifyContent: "center",
    alignItems: "center",
  },

  imageModalImage: {
    width: "100%",
    height: "100%",
  },

  /* =======================
     LOGISTICS LIST
  ======================= */
  logisticsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  logisticsBullet: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  logisticsBulletText: {
    color: "#0284C7",
    fontWeight: "800",
    fontSize: 12,
  },

  logisticsText: {
    flex: 1,
    color: "#0E2D52",
    fontWeight: "600",
  },

  /* =======================
     QUIZ (matches your screenshots)
  ======================= */
  quizWrap: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginBottom: 10,
  },

  quizHeader: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0E2D52",
    marginBottom: 10,
    paddingHorizontal: 6,
  },

  quizQuestionText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0E2D52",
    textAlign: "center",
    marginBottom: 12,
    paddingHorizontal: 12,
  },

  quizGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 6,
  },

  quizChoiceCard: {
    width: "48%",
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#E2E8F0",
    padding: 10,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    minHeight: 72,
    justifyContent: "center",
  },

  quizChoiceCardSelected: {
    borderColor: "#0E2D52",
  },

  quizChoiceCardCorrect: {
    borderColor: "#16A34A",
  },

  quizChoiceCardWrong: {
    borderColor: "#EF4444",
  },

  quizChoiceText: {
    color: "#0E2D52",
    fontWeight: "700",
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
  },

  quizChoiceTextCorrect: {
    color: "#166534",
  },

  quizChoiceTextWrong: {
    color: "#991B1B",
  },

  quizExplainBox: {
    marginTop: 2,
    marginHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  quizExplainTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: "#16A34A",
    marginBottom: 4,
  },

  quizExplainText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0E2D52",
    marginBottom: 6,
  },

  quizExplainSub: {
    fontSize: 11,
    color: "#334155",
    fontWeight: "600",
    lineHeight: 16,
  },

  quizBtnRow: {
  alignItems: "center",   // ✅ center the button horizontally
  justifyContent: "center",
  paddingHorizontal: 10,
  marginTop: 10,
},

  quizPrimaryBtn: {
  backgroundColor: "#E2E8F0",
  paddingVertical: 8,
  paddingHorizontal: 18,
  borderRadius: 18,
  alignItems: "center",     // ✅ center text inside button
  justifyContent: "center",
  minWidth: 180,            // ✅ optional: same width as secondary button
},

quizPrimaryBtnText: {
  color: "#0E2D52",
  fontWeight: "900",
  textAlign: "center",      // ✅ ensures centered text
},
  quizPrimaryBtnDisabled: {
    opacity: 0.5,
  },

  quizEmptyBox: {
    padding: 12,
    alignItems: "center",
  },

  quizEmptyText: {
    color: "#64748B",
    fontWeight: "700",
    marginBottom: 10,
  },

    /* =======================
     QUIZ RESULTS PAGE
  ======================= */
  quizProgressText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },

  quizResultsWrap: {
    marginTop: 6,
  },

  quizResultsTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 8,
    marginBottom: 12,
  },

  quizScoreCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: "#EFF6FF",
    borderWidth: 2,
    borderColor: "#BFDBFE",
    alignItems: "center",
    justifyContent: "center",
  },

  quizScoreBig: {
    fontSize: 20,
    fontWeight: "900",
    color: "#1D4ED8",
    lineHeight: 22,
  },

  quizScoreSmall: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0E2D52",
    marginTop: 4,
  },

  quizResultsTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0E2D52",
  },

  quizResultsBadge: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "900",
    color: "#16A34A",
  },

  quizResultsSub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },

  quizReviewBox: {
    marginHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
  },

  quizReviewTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0E2D52",
    marginBottom: 8,
  },

  quizReviewRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },

  quizReviewDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },

  quizReviewDotCorrect: {
    backgroundColor: "#16A34A",
  },

  quizReviewDotWrong: {
    backgroundColor: "#EF4444",
  },

  quizReviewQText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0E2D52",
  },

  quizReviewAText: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
  },

  quizResultsBtnRow: {
    marginTop: 12,
    paddingHorizontal: 10,
    gap: 10,
  },

  quizSecondaryBtn: {
    backgroundColor: "#fff",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  quizSecondaryBtnText: {
    color: "#0E2D52",
    fontWeight: "900",
  },
});