import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import YoutubePlayer from "react-native-youtube-iframe";
import { styles } from "../../styles/securityofficer/category";

type QuizQuestion = {
  id: string;
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
};

export default function CategoryPage() {
  const { category } = useLocalSearchParams();
  const router = useRouter();

  const slug = category as string;

  const categoryMap: Record<string, string> = {
    "fire-evacuation": "Fire & Evacuation",
    robbery: "Robbery",
    violence: "Violence",
    "lift-alarm": "Lift Alarm",
    medical: "Medical",
    "bomb-threat": "Bomb Threat",
    "suspicious-item": "Suspicious Item",
    "suspicious-person": "Suspicious Person",
  };

  const categoryImageMap: Record<string, any> = {
    "fire-evacuation": require("../../assets/sop/fire_evacuation.png"),
    robbery: require("../../assets/sop/robbery.png"),
    violence: require("../../assets/sop/violence.png"),
    "lift-alarm": require("../../assets/sop/lift_alarm.png"),
    medical: require("../../assets/sop/medical.png"),
    "bomb-threat": require("../../assets/sop/bomb_threat.png"),
    "suspicious-item": require("../../assets/sop/suspicious_item.png"),
    "suspicious-person": require("../../assets/sop/suspicious_person.png"),
  };

  const emojiMap: Record<string, string> = {
    "fire-evacuation": "🔥",
    robbery: "🛡️",
    violence: "🚨",
    "lift-alarm": "🛗",
    medical: "🩺",
    "bomb-threat": "💣",
    "suspicious-item": "📦",
    "suspicious-person": "🕵️",
  };

  const categoryLogisticsMap: Record<string, string[]> = {
    "fire-evacuation": [
      "Cordon tape",
      "Safety boots",
      "Torch / flashlight",
      "Two-way radio",
      "High-visibility vest",
      "Evacuation map",
    ],
    robbery: ["Two-way radio", "CCTV access", "Incident report form"],
    violence: ["Two-way radio", "First aid kit", "Cordon tape"],
    "lift-alarm": [
      "Two-way radio",
      "Lift emergency contacts",
      "Torch / flashlight",
    ],
    medical: ["First aid kit", "AED (if available)", "Disposable gloves", "Mask"],
    "bomb-threat": ["Bomb threat checklist", "Cordon tape", "Notebook + pen"],
    "suspicious-item": ["Cordon tape", "Two-way radio", "Do not touch item"],
    "suspicious-person": ["Two-way radio", "CCTV access", "Incident report form"],
  };

  const categoryVideoMap: Record<string, string> = {
    "fire-evacuation": "GVBamXXVD30",
    robbery: "c6oSDANCzqQ",
    violence: "PtCoqlnDXlg",
    "lift-alarm": "YsCZIHWYK2Q",
    medical: "mNk0mZRJBV0",
    "bomb-threat": "ApKUtuNTzzI",
    "suspicious-item": "rl3iJlFTFC0",
    "suspicious-person": "i5dmOmmiwC0",
  };

  // ✅ Mock quiz (replace later with AI)
  const quizByCategory: Record<string, QuizQuestion[]> = {
    robbery: [
      {
        id: "rob-1",
        question:
          "During a robbery incident, what is the most appropriate action for a security officer?",
        choices: [
          "Attempt to physically stop the suspect immediately",
          "Prioritise personal and public safety, observe the suspect, and report the incident",
          "Confront the suspect and demand identification",
          "Lock all exits immediately without assessing the situation",
        ],
        answerIndex: 1,
        explanation:
          "Your priority is safety. Observe details, avoid escalating, and report through the proper channels.",
      },
    ],
    "fire-evacuation": [
      {
        id: "fire-1",
        question:
          "During a fire alarm activation, what should a security officer do first?",
        choices: [
          "Use the lift to quickly evacuate occupants",
          "Ignore the alarm until confirmation is received",
          "Activate emergency response and guide occupants to the nearest exit",
          "Attempt to fight the fire immediately without assessment",
        ],
        answerIndex: 2,
        explanation:
          "Initiate the emergency response and guide occupants to exits. Do not use lifts and do not take unnecessary risks.",
      },
    ],
  };

  const decodedCategory = categoryMap[slug] ?? slug;

  const [titles, setTitles] = useState<string[]>([]);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTitleModal, setShowTitleModal] = useState(false);

  const [tab, setTab] = useState<"Guidelines" | "Logistics">("Guidelines");
  const [mediaTab, setMediaTab] = useState<"Images" | "Videos" | "Quiz">(
    "Images"
  );

  const [showImageModal, setShowImageModal] = useState(false);

  // ✅ Quiz state
  const quizQuestions = quizByCategory[slug] ?? [];
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // ✅ Results
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizShowResults, setQuizShowResults] = useState(false);

  const resetToDefault = () => {
    setTab("Guidelines");
    setMediaTab("Images");

    setQuizIndex(0);
    setQuizSelected(null);
    setQuizSubmitted(false);
    setQuizAnswers({});
    setQuizShowResults(false);
  };

  const restartQuiz = () => {
    setTab("Guidelines");
    setMediaTab("Quiz");

    setQuizIndex(0);
    setQuizSelected(null);
    setQuizSubmitted(false);
    setQuizAnswers({});
    setQuizShowResults(false);
  };

  const quizScore = useMemo(() => {
    if (quizQuestions.length === 0) return 0;
    return quizQuestions.reduce((acc, q) => {
      const user = quizAnswers[q.id];
      return acc + (user === q.answerIndex ? 1 : 0);
    }, 0);
  }, [quizAnswers, quizQuestions]);

  const quizPercent = useMemo(() => {
    if (quizQuestions.length === 0) return 0;
    return Math.round((quizScore / quizQuestions.length) * 100);
  }, [quizScore, quizQuestions.length]);

  const quizBadge = useMemo(() => {
    if (quizQuestions.length === 0) return "—";
    if (quizPercent >= 90) return "Excellent";
    if (quizPercent >= 70) return "Good";
    if (quizPercent >= 50) return "Needs Practice";
    return "Try Again";
  }, [quizPercent, quizQuestions.length]);

  // Reset when category changes
  useEffect(() => {
    resetToDefault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    fetchTitles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTitles = async () => {
    const { data } = await supabase
      .from("sop")
      .select("title")
      .eq("category", decodedCategory)
      .order("title", { ascending: true });

    const uniqueTitles = [...new Set(data?.map((d: any) => d.title))];
    setTitles(uniqueTitles);

    if (uniqueTitles.length > 0) {
      setSelectedTitle(uniqueTitles[0]);
    }
  };

  useEffect(() => {
    if (selectedTitle && tab === "Guidelines") fetchSteps(selectedTitle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTitle, tab]);

  const fetchSteps = async (title: string) => {
    setLoading(true);

    const { data } = await supabase
      .from("sop")
      .select("*")
      .eq("title", title)
      .order("step_no");

    setSteps(data || []);
    setLoading(false);
  };

  const imageSource = categoryImageMap[slug];
  const videoId = categoryVideoMap[slug];

  const logisticsItems = useMemo(() => categoryLogisticsMap[slug] ?? [], [slug]);

  const isQuizMode = tab === "Guidelines" && mediaTab === "Quiz";
  const isQuizResults = isQuizMode && quizShowResults;

  const listData = tab === "Guidelines" ? steps : logisticsItems;
  const currentQuestion = quizQuestions[quizIndex];

  const handleSubmitQuestion = () => {
    if (!currentQuestion) return;
    if (quizSelected === null) return;

    setQuizSubmitted(true);
    setQuizAnswers((prev) => ({ ...prev, [currentQuestion.id]: quizSelected }));
  };

  const handleNext = () => {
    const nextIndex = quizIndex + 1;

    if (nextIndex >= quizQuestions.length) {
      setQuizShowResults(true);
      return;
    }

    setQuizIndex(nextIndex);
    setQuizSelected(null);
    setQuizSubmitted(false);
  };

  return (
    <View style={styles.container}>
      {/* 🔵 HEADER */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>

          <Text style={styles.headerTitle}>Service Of Operation</Text>
        </View>

        {/* DROPDOWN */}
        <View style={styles.dropdownBox}>
          <Ionicons name="list" size={18} color="#A0B0C0" />
          <Pressable
            style={styles.titleSelectBtn}
            onPress={() => setShowTitleModal(true)}
          >
            <Text style={styles.titleSelectText} numberOfLines={1}>
              {selectedTitle || "Select SOP"}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#A0B0C0" />
          </Pressable>
        </View>

        {/* PILLS */}
        <View style={styles.pillRow}>
          <Pressable
            style={[styles.pill, tab === "Guidelines" && styles.pillActive]}
            onPress={() => {
              setTab("Guidelines");
              if (tab === "Logistics") setMediaTab("Images");
            }}
          >
            <Text
              style={[
                styles.pillText,
                tab === "Guidelines" && styles.pillTextActive,
              ]}
            >
              Guidelines
            </Text>
          </Pressable>

          <Pressable
            style={[styles.pill, tab === "Logistics" && styles.pillActive]}
            onPress={() => {
              setTab("Logistics");
              setMediaTab("Images");
              setQuizIndex(0);
              setQuizSelected(null);
              setQuizSubmitted(false);
              setQuizAnswers({});
              setQuizShowResults(false);
            }}
          >
            <Text
              style={[
                styles.pillText,
                tab === "Logistics" && styles.pillTextActive,
              ]}
            >
              Logistics
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 🔽 CONTENT CARD */}
      <View style={styles.card}>
        {loading && tab === "Guidelines" && !isQuizMode ? (
          <ActivityIndicator />
        ) : (
          <FlatList
            data={isQuizMode ? [] : listData}
            keyExtractor={(item, index) =>
              tab === "Guidelines"
                ? (item as any).step_no.toString()
                : `${slug}-log-${index}`
            }
            contentContainerStyle={styles.stepsContentContainer}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View>
                {/* TITLE + EMOJI */}
                <View style={styles.cardTitleRow}>
                  <View style={styles.emojiBadge}>
                    <Text style={styles.emojiText}>{emojiMap[slug] ?? "📋"}</Text>
                  </View>

                  <Text style={styles.cardTitle}>
                    {isQuizMode ? `Quiz - ${decodedCategory}` : decodedCategory}
                  </Text>
                </View>

                {/* META (hide in quiz mode) */}
                {!isQuizMode ? (
                  <Text style={styles.metaText}>
                    {tab === "Guidelines"
                      ? `${steps.length} Steps • ~3 min read`
                      : `${logisticsItems.length} Items`}
                  </Text>
                ) : null}

                {/* media chips hidden when Quiz active or Logistics */}
                {tab === "Guidelines" && !isQuizMode ? (
                  <View style={styles.mediaTabRow}>
                    <Pressable
                      onPress={() => setMediaTab("Images")}
                      style={[
                        styles.mediaChip,
                        mediaTab === "Images" && styles.mediaChipActive,
                      ]}
                    >
                      <Ionicons
                        name="image-outline"
                        size={14}
                        color={mediaTab === "Images" ? "#2563EB" : "#64748B"}
                      />
                      <Text
                        style={[
                          styles.mediaChipText,
                          mediaTab === "Images" &&
                            styles.mediaChipTextActiveBlue,
                        ]}
                      >
                        Images
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => setMediaTab("Videos")}
                      style={[
                        styles.mediaChip,
                        mediaTab === "Videos" && styles.mediaChipActive,
                      ]}
                    >
                      <Ionicons
                        name="play-circle-outline"
                        size={14}
                        color={mediaTab === "Videos" ? "#EF4444" : "#64748B"}
                      />
                      <Text
                        style={[
                          styles.mediaChipText,
                          mediaTab === "Videos" && styles.mediaChipTextActiveRed,
                        ]}
                      >
                        Videos
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        setMediaTab("Quiz");
                        setQuizIndex(0);
                        setQuizSelected(null);
                        setQuizSubmitted(false);
                        setQuizAnswers({});
                        setQuizShowResults(false);
                      }}
                      style={[
                        styles.mediaChip,
                        mediaTab === "Quiz" && styles.mediaChipActive,
                      ]}
                    >
                      <Ionicons
                        name="help-circle-outline"
                        size={14}
                        color={mediaTab === "Quiz" ? "#F59E0B" : "#64748B"}
                      />
                      <Text
                        style={[
                          styles.mediaChipText,
                          mediaTab === "Quiz" &&
                            styles.mediaChipTextActiveOrange,
                        ]}
                      >
                        Quiz
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {/* Images/Videos shown only when Guidelines and NOT quiz */}
                {tab === "Guidelines" && !isQuizMode ? (
                  <>
                    {mediaTab === "Images" && imageSource ? (
                      <Pressable
                        style={styles.heroImageWrap}
                        onPress={() => setShowImageModal(true)}
                      >
                        <Image
                          source={imageSource}
                          style={styles.heroImage}
                          resizeMode="cover"
                        />
                        <View style={styles.expandIcon}>
                          <Ionicons name="expand-outline" size={18} color="#fff" />
                        </View>
                      </Pressable>
                    ) : null}

                    {mediaTab === "Videos" && videoId ? (
                      <View style={styles.videoWrap}>
                        <YoutubePlayer height={190} play={false} videoId={videoId} />
                      </View>
                    ) : null}

                    <Text style={styles.guidelinesTitle}>Guidelines of SOP</Text>
                  </>
                ) : null}

                {/* =======================
                    QUIZ UI + RESULTS PAGE
                   ======================= */}
                {isQuizMode ? (
                  <View style={styles.quizWrap}>
                    {/* RESULTS PAGE */}
                    {isQuizResults ? (
                      <View style={styles.quizResultsWrap}>
                        <View style={styles.quizResultsTop}>
                          <View style={styles.quizScoreCircle}>
                            <Text style={styles.quizScoreBig}>{quizPercent}%</Text>
                            <Text style={styles.quizScoreSmall}>
                              {quizScore}/{quizQuestions.length}
                            </Text>
                          </View>

                          <View style={{ flex: 1 }}>
                            <Text style={styles.quizResultsTitle}>Results</Text>
                            <Text style={styles.quizResultsBadge}>{quizBadge}</Text>
                            <Text style={styles.quizResultsSub}>
                              Review your score or try again to improve.
                            </Text>
                          </View>
                        </View>

                        <View style={styles.quizReviewBox}>
                          <Text style={styles.quizReviewTitle}>Question Review</Text>

                          {quizQuestions.map((q, idx) => {
                            const user = quizAnswers[q.id];
                            const correct = user === q.answerIndex;
                            const userLabel =
                              typeof user === "number"
                                ? `${String.fromCharCode(65 + user)}`
                                : "—";
                            const correctLabel = `${String.fromCharCode(
                              65 + q.answerIndex
                            )}`;

                            return (
                              <View key={q.id} style={styles.quizReviewRow}>
                                <View
                                  style={[
                                    styles.quizReviewDot,
                                    correct
                                      ? styles.quizReviewDotCorrect
                                      : styles.quizReviewDotWrong,
                                  ]}
                                />
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.quizReviewQText}>
                                    {idx + 1}. {q.question}
                                  </Text>
                                  <Text style={styles.quizReviewAText}>
                                    Your: {userLabel} • Correct: {correctLabel}
                                  </Text>
                                </View>
                              </View>
                            );
                          })}
                        </View>

                        <View style={styles.quizResultsBtnRow}>
                          <Pressable style={styles.quizPrimaryBtn} onPress={restartQuiz}>
                            <Text style={styles.quizPrimaryBtnText}>Try Again</Text>
                          </Pressable>

                          <Pressable style={styles.quizSecondaryBtn} onPress={resetToDefault}>
                            <Text style={styles.quizSecondaryBtnText}>
                              Back to Guidelines
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      /* QUESTION PAGE */
                      <>
                        {!currentQuestion ? (
                          <View style={styles.quizEmptyBox}>
                            <Text style={styles.quizEmptyText}>
                              No quiz questions yet for this category.
                            </Text>
                            <Pressable style={styles.quizPrimaryBtn} onPress={resetToDefault}>
                              <Text style={styles.quizPrimaryBtnText}>
                                Back to Guidelines
                              </Text>
                            </Pressable>
                          </View>
                        ) : (
                          <>
                            <Text style={styles.quizProgressText}>
                              Question {quizIndex + 1} of {quizQuestions.length}
                            </Text>

                            <Text style={styles.quizQuestionText}>
                              {currentQuestion.question}
                            </Text>

                            <View style={styles.quizGrid}>
                              {currentQuestion.choices.map((choice, i) => {
                                const selected = quizSelected === i;
                                const correct = currentQuestion.answerIndex === i;
                                const showResult = quizSubmitted;

                                const choiceStyle = [
                                  styles.quizChoiceCard,
                                  selected && styles.quizChoiceCardSelected,
                                  showResult &&
                                    correct &&
                                    styles.quizChoiceCardCorrect,
                                  showResult &&
                                    selected &&
                                    !correct &&
                                    styles.quizChoiceCardWrong,
                                ];

                                const choiceTextStyle = [
                                  styles.quizChoiceText,
                                  showResult &&
                                    correct &&
                                    styles.quizChoiceTextCorrect,
                                  showResult &&
                                    selected &&
                                    !correct &&
                                    styles.quizChoiceTextWrong,
                                ];

                                return (
                                  <Pressable
                                    key={`${currentQuestion.id}-${i}`}
                                    style={choiceStyle}
                                    onPress={() => {
                                      if (quizSubmitted) return;
                                      setQuizSelected(i);
                                    }}
                                  >
                                    <Text style={choiceTextStyle}>
                                      {String.fromCharCode(65 + i)}. {choice}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>

                            {quizSubmitted ? (
                              <View style={styles.quizExplainBox}>
                                <Text style={styles.quizExplainTitle}>Correct Answer:</Text>
                                <Text style={styles.quizExplainText}>
                                  {String.fromCharCode(65 + currentQuestion.answerIndex)}.{" "}
                                  {currentQuestion.choices[currentQuestion.answerIndex]}
                                </Text>

                                <Text style={styles.quizExplainSub}>
                                  {currentQuestion.explanation}
                                </Text>
                              </View>
                            ) : null}

                            <View style={styles.quizBtnRow}>
                              {!quizSubmitted ? (
                                <Pressable
                                  style={[
                                    styles.quizPrimaryBtn,
                                    quizSelected === null &&
                                      styles.quizPrimaryBtnDisabled,
                                  ]}
                                  disabled={quizSelected === null}
                                  onPress={handleSubmitQuestion}
                                >
                                  <Text style={styles.quizPrimaryBtnText}>Submit</Text>
                                </Pressable>
                              ) : (
                                <Pressable style={styles.quizPrimaryBtn} onPress={handleNext}>
                                  <Text style={styles.quizPrimaryBtnText}>
                                    {quizIndex + 1 >= quizQuestions.length
                                      ? "Finish"
                                      : "Next"}
                                  </Text>
                                </Pressable>
                              )}
                            </View>
                          </>
                        )}
                      </>
                    )}
                  </View>
                ) : null}

                {tab === "Logistics" ? (
                  <Text style={styles.guidelinesTitle}>Logistics</Text>
                ) : null}
              </View>
            }
            renderItem={({ item, index }) => {
              if (tab === "Guidelines") {
                const step = item as any;
                return (
                  <View style={styles.stepRow}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>{step.step_no}</Text>
                    </View>

                    <View style={styles.stepContent}>
                      <Text style={styles.stepShort}>{step.step_short}</Text>
                      <Text style={styles.stepDesc}>{step.step_description}</Text>
                    </View>
                  </View>
                );
              }

              const label = item as string;
              return (
                <View style={styles.logisticsRow}>
                  <View style={styles.logisticsBullet}>
                    <Text style={styles.logisticsBulletText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.logisticsText}>{label}</Text>
                </View>
              );
            }}
          />
        )}
      </View>

      {/* TITLE MODAL */}
      <Modal
        transparent
        visible={showTitleModal}
        animationType="fade"
        onRequestClose={() => setShowTitleModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowTitleModal(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Select SOP</Text>
            <ScrollView style={styles.modalList}>
              {titles.map((title) => {
                const isActive = title === selectedTitle;
                return (
                  <Pressable
                    key={title}
                    style={[
                      styles.modalOption,
                      isActive && styles.modalOptionActive,
                    ]}
                    onPress={() => {
                      setSelectedTitle(title);
                      setShowTitleModal(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.modalOptionText,
                        isActive && styles.modalOptionTextActive,
                      ]}
                    >
                      {title}
                    </Text>
                    {isActive ? (
                      <Ionicons name="checkmark" size={18} color="#2563EB" />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* IMAGE MODAL */}
      <Modal
        transparent
        visible={showImageModal}
        animationType="fade"
        onRequestClose={() => setShowImageModal(false)}
      >
        <View style={styles.imageModalRoot}>
          <Pressable
            style={styles.imageModalBackdrop}
            onPress={() => setShowImageModal(false)}
          />

          <Pressable
            onPress={() => setShowImageModal(false)}
            style={styles.imageModalCloseBtn}
            hitSlop={10}
          >
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>

          <View style={styles.imageModalContent}>
            <Image
              source={imageSource}
              style={styles.imageModalImage}
              resizeMode="contain"
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}