import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import Text from "../../components/TranslatedText";

// Reuse your existing styles file (recommended)
import { styles as categoryStyles } from "../../styles/securityofficer/category";

type QuizQuestion = {
  id: string;
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
};

type QuizAttemptRow = {
  id: string;
  employee_id: string | null;
  category: string;
  sop_title: string;
  score: number;
  total_questions: number;
  percentage: number;
  created_at: string;
};

type QuizAnswerRow = {
  id: string;
  attempt_id: string;
  question: string;
  selected_answer: number;
  correct_answer: number;
  is_correct: boolean;
  explanation: string | null;
  created_at: string;
};

export default function SopTestPage() {
  const router = useRouter();

  // ✅ update this like your other page
  const BACKEND_URL = "http://192.168.1.14:5001";

  const TEST_CATEGORY = "SOP Test";
  const TEST_TITLE = "Mixed Categories";

  const [employeeId, setEmployeeId] = useState<string | null>(null);

  // Home vs quiz
  const [testStarted, setTestStarted] = useState(false);

  // quiz state
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  const [quizIndex, setQuizIndex] = useState(0);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizShowResults, setQuizShowResults] = useState(false);

  // history
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<QuizAttemptRow[]>([]);

  // review modal
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAttempt, setReviewAttempt] = useState<QuizAttemptRow | null>(null);
  const [reviewAnswersLoading, setReviewAnswersLoading] = useState(false);
  const [reviewAnswersError, setReviewAnswersError] = useState<string | null>(null);
  const [reviewAnswers, setReviewAnswers] = useState<QuizAnswerRow[]>([]);

  const getEmployeeId = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data?.user?.id ?? null; // employees.id == auth.users.id
    } catch (e) {
      console.warn("getEmployeeId failed:", e);
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      const id = await getEmployeeId();
      setEmployeeId(id);
    })();
  }, [getEmployeeId]);

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

  const currentQuestion = quizQuestions[quizIndex];

  const resetQuizState = () => {
    setTestStarted(false);
    setQuizQuestions([]);
    setQuizLoading(false);
    setQuizError(null);
    setQuizIndex(0);
    setQuizSelected(null);
    setQuizSubmitted(false);
    setQuizAnswers({});
    setQuizShowResults(false);
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const fetchAttemptHistory = useCallback(async () => {
    if (!employeeId) return;

    setAttemptsLoading(true);
    setAttemptsError(null);

    const { data, error } = await supabase
      .from("quiz_attempts")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("category", TEST_CATEGORY)
      .eq("sop_title", TEST_TITLE)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("fetchAttemptHistory error:", error);
      setAttempts([]);
      setAttemptsError("Failed to load attempt history.");
      setAttemptsLoading(false);
      return;
    }

    setAttempts((data ?? []) as QuizAttemptRow[]);
    setAttemptsLoading(false);
  }, [employeeId]);

  useEffect(() => {
    fetchAttemptHistory();
  }, [fetchAttemptHistory]);

  const openAttemptReview = async (attempt: QuizAttemptRow) => {
    setReviewAttempt(attempt);
    setReviewOpen(true);
    setReviewAnswers([]);
    setReviewAnswersError(null);

    setReviewAnswersLoading(true);
    const { data, error } = await supabase
      .from("quiz_answers")
      .select("*")
      .eq("attempt_id", attempt.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("openAttemptReview error:", error);
      setReviewAnswersError("Failed to load answers for this attempt.");
      setReviewAnswersLoading(false);
      return;
    }

    setReviewAnswers((data ?? []) as QuizAnswerRow[]);
    setReviewAnswersLoading(false);
  };

  const generateMixedTest = async () => {
    setQuizLoading(true);
    setQuizError(null);

    try {
      // Pull ALL sop steps from DB so backend can generate mixed quiz.
      // (If your SOP table is huge, we can optimize later.)
      const { data: sopRows, error } = await supabase
        .from("sop")
        .select("category,title,step_no,step_short,step_description")
        .order("category", { ascending: true })
        .order("title", { ascending: true })
        .order("step_no", { ascending: true });

      if (error) throw error;

      const res = await fetch(`${BACKEND_URL}/quiz/generate-mixed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          num_questions: 15,
          // send everything; backend should randomize across categories
          sop: (sopRows ?? []).map((s: any) => ({
            category: s.category,
            title: s.title,
            step_no: s.step_no,
            step_short: s.step_short,
            step_description: s.step_description,
          })),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `Test generation failed (${res.status})`);
      }

      setQuizQuestions((json.questions || []) as QuizQuestion[]);
    } catch (e: any) {
      console.error(e);
      setQuizQuestions([]);
      setQuizError(e?.message || "Test generation failed");
    } finally {
      setQuizLoading(false);
    }
  };

  const startTest = async () => {
    setTestStarted(true);
    setQuizIndex(0);
    setQuizSelected(null);
    setQuizSubmitted(false);
    setQuizAnswers({});
    setQuizShowResults(false);
    setQuizQuestions([]);
    setQuizError(null);

    await generateMixedTest();
  };

  const handleSubmitQuestion = () => {
    if (!currentQuestion) return;
    if (quizSelected === null) return;

    setQuizSubmitted(true);
    setQuizAnswers((prev) => ({ ...prev, [currentQuestion.id]: quizSelected }));
  };

  const saveAttemptToDb = async () => {
    if (!employeeId) return;

    const total = quizQuestions.length;
    const score = quizScore;
    const percentage = quizPercent;

    const { data: attempt, error: attemptErr } = await supabase
      .from("quiz_attempts")
      .insert({
        employee_id: employeeId,
        category: TEST_CATEGORY,
        sop_title: TEST_TITLE,
        score,
        total_questions: total,
        percentage,
      })
      .select("*")
      .single();

    if (attemptErr) {
      console.error("saveAttemptToDb attemptErr:", attemptErr);
      setQuizError("Failed to save test attempt.");
      return;
    }

    const attemptId = (attempt as QuizAttemptRow).id;

    const answerRows = quizQuestions.map((q) => {
      const selected = quizAnswers[q.id];
      const correct = q.answerIndex;
      const is_correct = selected === correct;

      return {
        attempt_id: attemptId,
        question: q.question,
        selected_answer: typeof selected === "number" ? selected : -1,
        correct_answer: correct,
        is_correct,
        explanation: q.explanation ?? null,
      };
    });

    const { error: answersErr } = await supabase.from("quiz_answers").insert(answerRows);
    if (answersErr) {
      console.error("saveAttemptToDb answersErr:", answersErr);
      setQuizError("Attempt saved, but failed to save answer details.");
      return;
    }

    await fetchAttemptHistory();
  };

  const handleNext = async () => {
    const nextIndex = quizIndex + 1;

    if (nextIndex >= quizQuestions.length) {
      setQuizShowResults(true);
      await saveAttemptToDb();
      return;
    }

    setQuizIndex(nextIndex);
    setQuizSelected(null);
    setQuizSubmitted(false);
  };

  return (
    <View style={categoryStyles.container}>
      {/* Header */}
      <View style={categoryStyles.header}>
        <View style={categoryStyles.headerRow}>
          <Pressable onPress={() => router.back()} style={categoryStyles.backBtn} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text style={categoryStyles.headerTitle}>SOP Test</Text>
        </View>
      </View>

      <View style={categoryStyles.card}>
        <FlatList
          data={[]}
          renderItem={() => null}
          keyExtractor={(_, idx) => `empty-${idx}`}
          ListHeaderComponent={
            <View>
              <View style={categoryStyles.cardTitleRow}>
                <View style={categoryStyles.emojiBadge}>
                  <Text style={categoryStyles.emojiText}>🧠</Text>
                </View>
                <Text style={categoryStyles.cardTitle}>Test Mode (15 Questions)</Text>
              </View>

              <Text style={categoryStyles.metaText}>
                Mixed categories • randomized questions • overall assessment
              </Text>

              {/* HOME */}
              {!testStarted ? (
                <View style={categoryStyles.quizWrap}>
                  <View style={categoryStyles.quizHomeWrap}>
                    <Text style={categoryStyles.quizHomeTitle}>SOP Test</Text>
                    <Text style={categoryStyles.quizHomeSub}>
                      15 questions mixed across all SOP categories. We recommend reviewing the SOP quizes prior to attempting the test. 
                    </Text>

                    <View style={categoryStyles.quizHomeBtnRow}>
                      <Pressable style={categoryStyles.quizPrimaryBtn} onPress={startTest}>
                        <Text style={categoryStyles.quizPrimaryBtnText}>Start SOP Test</Text>
                      </Pressable>

                      <Pressable style={categoryStyles.quizPrimaryBtn} onPress={() => router.push('/securityofficer/sop')}>
                        <Text style={categoryStyles.quizPrimaryBtnText}>Practice SOPs Quiz</Text>
                      </Pressable>

                      <Pressable style={categoryStyles.quizSecondaryBtn} onPress={() => router.back()}>
                        <Text style={categoryStyles.quizSecondaryBtnText}>Back</Text>
                      </Pressable>
                    </View>

                    <View style={categoryStyles.quizHistoryBox}>
                      <View style={categoryStyles.quizHistoryTitleRow}>
                        <Text style={categoryStyles.quizHistoryTitle}>Attempt History</Text>

                        <Pressable
                          onPress={fetchAttemptHistory}
                          hitSlop={10}
                          style={categoryStyles.quizHistoryRefreshBtn}
                        >
                          <Ionicons name="refresh" size={16} color="#2563EB" />
                        </Pressable>
                      </View>

                      {attemptsLoading ? (
                        <View style={{ paddingVertical: 10, alignItems: "center" }}>
                          <ActivityIndicator />
                        </View>
                      ) : attemptsError ? (
                        <Text style={categoryStyles.quizHomeError}>{attemptsError}</Text>
                      ) : attempts.length === 0 ? (
                        <Text style={categoryStyles.quizHomeEmpty}>
                          No attempts yet. Start your first SOP Test.
                        </Text>
                      ) : (
                        attempts.map((a) => (
                          <Pressable
                            key={a.id}
                            style={categoryStyles.attemptRow}
                            onPress={() => openAttemptReview(a)}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={categoryStyles.attemptRowTitle}>
                                {a.score}/{a.total_questions} • {a.percentage}%
                              </Text>
                              <Text style={categoryStyles.attemptRowSub}>{formatDate(a.created_at)}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color="#64748B" />
                          </Pressable>
                        ))
                      )}
                    </View>
                  </View>
                </View>
              ) : (
                // QUIZ UI
                <View style={categoryStyles.quizWrap}>
                  {quizLoading ? (
                    <View style={{ paddingVertical: 16, alignItems: "center" }}>
                      <ActivityIndicator />
                      <Text style={{ marginTop: 8, fontWeight: "800", color: "#64748B" }}>
                        Generating test...
                      </Text>
                    </View>
                  ) : quizError ? (
                    <View style={{ paddingVertical: 16, alignItems: "center" }}>
                      <Text style={{ color: "#EF4444", fontWeight: "900", textAlign: "center" }}>
                        {quizError}
                      </Text>

                      <Pressable
                        style={[categoryStyles.quizPrimaryBtn, { marginTop: 10 }]}
                        onPress={generateMixedTest}
                      >
                        <Text style={categoryStyles.quizPrimaryBtnText}>Try Again</Text>
                      </Pressable>

                      <Pressable
                        style={[categoryStyles.quizSecondaryBtn, { marginTop: 10 }]}
                        onPress={resetQuizState}
                      >
                        <Text style={categoryStyles.quizSecondaryBtnText}>Back to Home</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {/* RESULTS */}
                  {quizShowResults ? (
                    <View style={categoryStyles.quizResultsWrap}>
                      <View style={categoryStyles.quizResultsTop}>
                        <View style={categoryStyles.quizScoreCircle}>
                          <Text style={categoryStyles.quizScoreBig}>{quizPercent}%</Text>
                          <Text style={categoryStyles.quizScoreSmall}>
                            {quizScore}/{quizQuestions.length}
                          </Text>
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={categoryStyles.quizResultsTitle}>Results</Text>
                          <Text style={categoryStyles.quizResultsBadge}>{quizBadge}</Text>
                          <Text style={categoryStyles.quizResultsSub}>
                            Review your score or try again to improve.
                          </Text>
                        </View>
                      </View>

                      <View style={categoryStyles.quizReviewBox}>
                        <Text style={categoryStyles.quizReviewTitle}>Question Review</Text>

                        {quizQuestions.map((q, idx) => {
                          const user = quizAnswers[q.id];
                          const correct = user === q.answerIndex;
                          const userLabel =
                            typeof user === "number" ? `${String.fromCharCode(65 + user)}` : "—";
                          const correctLabel = `${String.fromCharCode(65 + q.answerIndex)}`;

                          return (
                            <View key={q.id} style={categoryStyles.quizReviewRow}>
                              <View
                                style={[
                                  categoryStyles.quizReviewDot,
                                  correct
                                    ? categoryStyles.quizReviewDotCorrect
                                    : categoryStyles.quizReviewDotWrong,
                                ]}
                              />
                              <View style={{ flex: 1 }}>
                                <Text style={categoryStyles.quizReviewQText}>
                                  {idx + 1}. {q.question}
                                </Text>
                                <Text style={categoryStyles.quizReviewAText}>
                                  Your: {userLabel} • Correct: {correctLabel}
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>

                      <View style={categoryStyles.quizResultsBtnRow}>
                        <Pressable
                          style={categoryStyles.quizPrimaryBtn}
                          onPress={async () => {
                            await startTest();
                          }}
                        >
                          <Text style={categoryStyles.quizPrimaryBtnText}>Try Again</Text>
                        </Pressable>

                        <Pressable style={categoryStyles.quizSecondaryBtn} onPress={resetQuizState}>
                          <Text style={categoryStyles.quizSecondaryBtnText}>Back to Home</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    // QUESTION PAGE
                    <>
                      {!currentQuestion ? (
                        <View style={categoryStyles.quizEmptyBox}>
                          {!quizLoading ? (
                            <Pressable style={categoryStyles.quizPrimaryBtn} onPress={generateMixedTest}>
                              <Text style={categoryStyles.quizPrimaryBtnText}>Try Again</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ) : (
                        <>
                          <Text style={categoryStyles.quizProgressText}>
                            Question {quizIndex + 1} of {quizQuestions.length}
                          </Text>

                          <Text style={categoryStyles.quizQuestionText}>
                            {currentQuestion.question}
                          </Text>

                          <View style={categoryStyles.quizGrid}>
                            {currentQuestion.choices.map((choice, i) => {
                              const selected = quizSelected === i;
                              const correct = currentQuestion.answerIndex === i;
                              const showResult = quizSubmitted;

                              const choiceStyle = [
                                categoryStyles.quizChoiceCard,
                                selected && categoryStyles.quizChoiceCardSelected,
                                showResult && correct && categoryStyles.quizChoiceCardCorrect,
                                showResult && selected && !correct && categoryStyles.quizChoiceCardWrong,
                              ];

                              const choiceTextStyle = [
                                categoryStyles.quizChoiceText,
                                showResult && correct && categoryStyles.quizChoiceTextCorrect,
                                showResult && selected && !correct && categoryStyles.quizChoiceTextWrong,
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
                            <View style={categoryStyles.quizExplainBox}>
                              <Text style={categoryStyles.quizExplainTitle}>Correct Answer:</Text>
                              <Text style={categoryStyles.quizExplainText}>
                                {String.fromCharCode(65 + currentQuestion.answerIndex)}.{" "}
                                {currentQuestion.choices[currentQuestion.answerIndex]}
                              </Text>

                              <Text style={categoryStyles.quizExplainSub}>
                                {currentQuestion.explanation}
                              </Text>
                            </View>
                          ) : null}

                          <View style={categoryStyles.quizBtnRow}>
                            {!quizSubmitted ? (
                              <Pressable
                                style={[
                                  categoryStyles.quizPrimaryBtn,
                                  quizSelected === null && categoryStyles.quizPrimaryBtnDisabled,
                                ]}
                                disabled={quizSelected === null}
                                onPress={handleSubmitQuestion}
                              >
                                <Text style={categoryStyles.quizPrimaryBtnText}>Submit</Text>
                              </Pressable>
                            ) : (
                              <Pressable style={categoryStyles.quizPrimaryBtn} onPress={handleNext}>
                                <Text style={categoryStyles.quizPrimaryBtnText}>
                                  {quizIndex + 1 >= quizQuestions.length ? "Finish" : "Next"}
                                </Text>
                              </Pressable>
                            )}
                          </View>

                          <Pressable
                            style={[categoryStyles.quizSecondaryBtn, { marginTop: 10, marginHorizontal: 10 }]}
                            onPress={resetQuizState}
                          >
                            <Text style={categoryStyles.quizSecondaryBtnText}>Quit to Home</Text>
                          </Pressable>
                        </>
                      )}
                    </>
                  )}
                </View>
              )}
            </View>
          }
        />
      </View>

      {/* ATTEMPT REVIEW MODAL (scrollable on phone) */}
      <Modal
        transparent
        visible={reviewOpen}
        animationType="fade"
        onRequestClose={() => setReviewOpen(false)}
      >
        <View style={categoryStyles.modalBackdrop}>
          <Pressable
            style={{ ...StyleSheet.absoluteFillObject }}
            onPress={() => setReviewOpen(false)}
          />

          <View style={categoryStyles.reviewModalCard}>
            <Text style={categoryStyles.modalTitle}>Attempt Review</Text>

            {reviewAttempt ? (
              <View style={categoryStyles.reviewSummaryBox}>
                <Text style={categoryStyles.reviewSummaryTitle}>
                  Score: {reviewAttempt.score}/{reviewAttempt.total_questions} •{" "}
                  {reviewAttempt.percentage}%
                </Text>
                <Text style={categoryStyles.reviewSummarySub}>
                  {reviewAttempt.sop_title} • {formatDate(reviewAttempt.created_at)}
                </Text>
              </View>
            ) : null}

            {reviewAnswersLoading ? (
              <View style={{ paddingVertical: 10, alignItems: "center" }}>
                <ActivityIndicator />
              </View>
            ) : reviewAnswersError ? (
              <Text style={categoryStyles.quizHomeError}>{reviewAnswersError}</Text>
            ) : (
              <ScrollView
                style={categoryStyles.reviewScroll}
                contentContainerStyle={{ paddingBottom: 20 }}
                showsVerticalScrollIndicator
              >
                {reviewAnswers.map((ans, idx) => {
                  const yourLabel =
                    ans.selected_answer >= 0
                      ? String.fromCharCode(65 + ans.selected_answer)
                      : "—";
                  const correctLabel = String.fromCharCode(65 + ans.correct_answer);

                  return (
                    <View key={ans.id} style={categoryStyles.reviewAnswerRow}>
                      <View
                        style={[
                          categoryStyles.reviewAnswerDot,
                          ans.is_correct
                            ? categoryStyles.reviewAnswerDotCorrect
                            : categoryStyles.reviewAnswerDotWrong,
                        ]}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={categoryStyles.reviewAnswerQ}>
                          {idx + 1}. {ans.question}
                        </Text>
                        <Text style={categoryStyles.reviewAnswerMeta}>
                          Your: {yourLabel} • Correct: {correctLabel}
                        </Text>
                        {ans.explanation ? (
                          <Text style={categoryStyles.reviewAnswerExplain}>{ans.explanation}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <Pressable
              style={[categoryStyles.quizSecondaryBtn, { marginTop: 10 }]}
              onPress={() => setReviewOpen(false)}
            >
              <Text style={categoryStyles.quizSecondaryBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}