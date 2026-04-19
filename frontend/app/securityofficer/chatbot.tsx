import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { AlertTriangle, Bot, Check, ChevronLeft, ClipboardPen, ListChecks, Mic, PhoneCall } from "lucide-react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { supabase } from "../../lib/supabase";
import { askSeaLion, isSeaLionConfigured } from "../../lib/sealion";

type BotReply = {
  id: string;
  title: string;
  body: React.ReactNode;
  time: string;
  suggestions?: string[];
};

type DynamicReply = {
  id: string;
  question: string;
  answer: string;
  time: string;
  loading: boolean;
  showGuide: boolean;
};

type ShiftReportTarget = {
  shift_id: string;
  shift_description: string | null;
  shift_date: string | null;
  clockin_time: string | null;
  clockout_time: string | null;
};

const QUICK_REPLIES = [
  "Show evacuation steps",
  "Escalation contacts",
  "Mark evacuation complete",
  "Location of fire alarm",
];

const INCIDENT_CONTEXT = `Active incident: Fire detected at Zone 4B.
Role: Security officer response assistant.
Known SOP:
- Raise alarm or confirm alarm activation.
- Notify the control room immediately.
- Begin evacuation using emergency exit stairs. Do not use lifts.
- Check the area only if safe.
- Firefighting is only allowed if safe and with the correct extinguisher.
- Escalate to Control Room and call SCDF at 995 for emergency support.
Response rules:
- Adapt to the officer's latest update. If the officer says something cannot be done, do not simply repeat that step. Give the next best contingency.
- For "cannot contact control room", tell them to keep evacuation moving, retry using another channel, escalate to supervisor/nearby officer if available, and call SCDF at 995 if immediate emergency support is needed.
- Use 3 to 5 short numbered steps.
- Use plain text only. Do not use markdown, bold markers, headings, or asterisks.
- Do not invent names, phone numbers, or building details that are not provided.`;

const CONVO_BOT_IMAGE = require("./assets/convobot.png");

const ExtinguisherGuide = ({ width }: { width: number }) => {
  const guideWidth = Math.min(width, 330);
  const guideHeight = Math.round(guideWidth * 0.78);

  return (
    <View style={styles.guideWrap}>
      <Svg width={guideWidth} height={guideHeight} viewBox="0 0 330 258">
        <Rect x="4" y="4" width="322" height="250" rx="6" fill="#FFFFFF" stroke="#EF3338" strokeWidth="4" />
        <Rect x="4" y="4" width="322" height="34" rx="6" fill="#EF3338" />
        <SvgText x="165" y="28" textAnchor="middle" fill="#FFFFFF" fontSize="17" fontWeight="700">
          HOW TO USE A FIRE EXTINGUISHER
        </SvgText>

        <Rect x="32" y="77" width="60" height="132" rx="18" fill="#F54444" />
        <Rect x="44" y="69" width="36" height="24" rx="6" fill="#D92F31" />
        <Rect x="52" y="51" width="24" height="20" rx="4" fill="#6B7280" />
        <Line x1="64" y1="51" x2="128" y2="31" stroke="#EF3338" strokeWidth="5" strokeLinecap="round" />
        <Path d="M55 93 C 10 102, 16 152, 24 214" stroke="#374151" strokeWidth="3" fill="none" />
        <Rect x="14" y="204" width="18" height="28" rx="2" fill="#374151" />

        <Rect x="132" y="55" width="85" height="70" rx="4" fill="#FFF4F4" stroke="#EF3338" strokeWidth="2" />
        <Rect x="158" y="82" width="22" height="36" rx="7" fill="#F54444" />
        <Rect x="161" y="76" width="16" height="10" rx="3" fill="#6B7280" />
        <Path d="M177 78 L199 66" stroke="#EF3338" strokeWidth="3" strokeLinecap="round" />
        <Path d="M178 85 C 194 86, 203 81, 210 74" stroke="#F97373" strokeWidth="7" strokeLinecap="round" />
        <Path d="M198 69 L212 69 M212 69 L204 62 M212 69 L204 76" stroke="#EF3338" strokeWidth="3" strokeLinecap="round" />
        <SvgText x="174" y="136" textAnchor="middle" fill="#263238" fontSize="8" fontWeight="700">
          PULL SAFETY PIN
        </SvgText>

        <Rect x="230" y="55" width="85" height="70" rx="4" fill="#FFF4F4" stroke="#EF3338" strokeWidth="2" />
        <Circle cx="251" cy="72" r="13" fill="#E5E7EB" />
        <Circle cx="264" cy="84" r="17" fill="#E5E7EB" />
        <Circle cx="246" cy="94" r="10" fill="#E5E7EB" />
        <Path d="M276 94 L309 74" stroke="#1F2937" strokeWidth="8" strokeLinecap="round" />
        <Path d="M284 85 L305 69 M284 85 L296 84 M284 85 L291 75" stroke="#EF3338" strokeWidth="3" strokeLinecap="round" />
        <SvgText x="272" y="136" textAnchor="middle" fill="#263238" fontSize="8" fontWeight="700">
          AIM AT BASE OF FIRE
        </SvgText>

        <Rect x="132" y="151" width="85" height="70" rx="4" fill="#FFF4F4" stroke="#EF3338" strokeWidth="2" />
        <Rect x="156" y="184" width="24" height="31" rx="7" fill="#F54444" />
        <Rect x="160" y="178" width="16" height="10" rx="3" fill="#6B7280" />
        <Path d="M177 179 L200 167" stroke="#EF3338" strokeWidth="3" strokeLinecap="round" />
        <Path d="M186 163 C 203 160, 209 154, 212 147" stroke="#F97373" strokeWidth="7" strokeLinecap="round" />
        <Path d="M203 154 L203 182 M203 182 L196 172 M203 182 L210 172" stroke="#EF3338" strokeWidth="3" strokeLinecap="round" />
        <SvgText x="174" y="232" textAnchor="middle" fill="#263238" fontSize="8" fontWeight="700">
          SQUEEZE THE LEVER
        </SvgText>

        <Rect x="230" y="151" width="85" height="70" rx="4" fill="#FFF4F4" stroke="#EF3338" strokeWidth="2" />
        <Rect x="253" y="184" width="24" height="31" rx="7" fill="#F54444" />
        <Rect x="257" y="178" width="16" height="10" rx="3" fill="#6B7280" />
        <Path d="M274 179 L309 158" stroke="#1F2937" strokeWidth="7" strokeLinecap="round" />
        <Path d="M273 166 L266 146 M266 146 L259 158 M266 146 L276 155" stroke="#EF3338" strokeWidth="3" strokeLinecap="round" />
        <Path d="M275 207 L294 196 M294 196 L281 193 M294 196 L286 207" stroke="#EF3338" strokeWidth="3" strokeLinecap="round" />
        <SvgText x="272" y="232" textAnchor="middle" fill="#263238" fontSize="8" fontWeight="700">
          SWEEP SIDE TO SIDE
        </SvgText>
      </Svg>
    </View>
  );
};

const BotAvatar = () => (
  <View style={styles.botAvatar}>
    <Image source={CONVO_BOT_IMAGE} style={styles.botAvatarImage} resizeMode="cover" />
  </View>
);

const formatCurrentTime = () =>
  new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

const formatReportTimestamp = () =>
  new Date().toLocaleString("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Singapore",
  });

const todayISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const getFallbackAnswer = (prompt: string) => {
  const normalizedPrompt = prompt.toLowerCase();

  if (
    normalizedPrompt.includes("cannot control") ||
    normalizedPrompt.includes("can't control") ||
    normalizedPrompt.includes("cant control") ||
    normalizedPrompt.includes("control room now") ||
    normalizedPrompt.includes("cannot contact")
  ) {
    return [
      "1. Continue evacuation by emergency exit stairs. Do not wait for Control Room before moving people away from Zone 4B.",
      "2. Retry Control Room using another channel if available, such as radio, phone, or nearby officer relay.",
      "3. Escalate to your supervisor or the nearest available officer and state: Fire at Zone 4B, evacuation in progress, Control Room unreachable.",
      "4. If there is immediate danger or the fire is spreading, call SCDF at 995.",
      "5. Record the time and method of each failed contact attempt.",
    ].join("\n");
  }

  if (normalizedPrompt.includes("evacuation")) {
    return [
      "Step 1: Confirm the fire alarm is activated. If it is not active, activate the nearest fire alarm immediately.",
      "Step 2: Begin evacuation using the nearest emergency exit stairs. Do not use the lifts.",
      "Step 3: Guide people away from Zone 4B and keep exits clear.",
      "Step 4: If safe, check the area and use the correct extinguisher only if trained.",
      "Step 5: Inform the Control Room and call SCDF at 995.",
    ].join("\n");
  }

  if (normalizedPrompt.includes("escalation")) {
    return "Inform the Control Room immediately with the incident location, status, and actions taken. Call SCDF at 995 if emergency assistance is required.";
  }

  if (normalizedPrompt.includes("alarm")) {
    return "The nearest fire alarm should be used if the alarm is not already active. Move quickly, stay safe, and report the activation to the Control Room.";
  }

  if (normalizedPrompt.includes("complete")) {
    return "Mark evacuation complete only after occupants are directed to safety, Zone 4B is cleared where safe to check, and the Control Room has been updated.";
  }

  return "For the active fire incident at Zone 4B: confirm the alarm, notify Control Room, evacuate by stairs, avoid lifts, check only if safe, and call SCDF at 995 if needed.";
};

const cleanBotAnswer = (answer: string) =>
  answer
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export default function ChatBotPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [input, setInput] = useState("");
  const [showFullSteps, setShowFullSteps] = useState(false);
  const [dynamicReplies, setDynamicReplies] = useState<DynamicReply[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [appRoutePrefix, setAppRoutePrefix] = useState("/securityofficer");
  const [shiftOwnerColumn, setShiftOwnerColumn] = useState<"officer_id" | "supervisor_id">("officer_id");

  useEffect(() => {
    let alive = true;

    const loadRoleContext = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      if (!userId || !alive) return;

      const { data: profile } = await supabase
        .from("employees")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (!alive) return;

      const role = profile?.role ?? "";
      const isSsoUser = role === "Senior Security Officer";

      if (isSsoUser) {
        setAppRoutePrefix("/sso");
        setShiftOwnerColumn("supervisor_id");
        return;
      }

      setAppRoutePrefix("/securityofficer");
      setShiftOwnerColumn("officer_id");
    };

    void loadRoleContext();

    return () => {
      alive = false;
    };
  }, []);

  const botReplies = useMemo<BotReply[]>(
    () => [
      {
        id: "initial",
        title: "Fire Incident - Zone 4B",
        time: "01:59 PM",
        suggestions: QUICK_REPLIES,
        body: (
          <>
            <Text style={styles.messageText}>
              <Text style={styles.fireIcon}>🔥</Text> IMMEDIATE ACTIONS (Fire - Zone 4B)
            </Text>
            <Text style={styles.messageText}>1. Raise alarm / confirm alarm activation</Text>
            <Text style={styles.messageText}>2. Notify control room immediately</Text>
            <Text style={styles.messageText}>3. Begin evacuation (no lifts)</Text>
            <Text style={styles.messageText}>4. Check area if safe</Text>
          </>
        ),
      },
    ],
    []
  );

  const askBot = async (prompt: string) => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isAsking) return;

    const replyId = `sealion-${Date.now()}`;
    const showGuide = trimmedPrompt.toLowerCase().includes("evacuation");
    const time = formatCurrentTime();

    setInput("");
    setIsAsking(true);
    if (showGuide) setShowFullSteps(true);
    setDynamicReplies((prev) => [
      ...prev,
      {
        id: replyId,
        question: trimmedPrompt,
        answer: "",
        time,
        loading: true,
        showGuide,
      },
    ]);

    try {
      const answer = isSeaLionConfigured()
        ? await askSeaLion([
            {
              role: "system",
              content: INCIDENT_CONTEXT,
            },
            {
              role: "user",
              content: `Officer update: "${trimmedPrompt}"\n\nGive the immediate next actions for this active Zone 4B fire incident. If the officer reports a blocker, give a practical workaround.`,
            },
          ])
        : getFallbackAnswer(trimmedPrompt);

      setDynamicReplies((prev) =>
        prev.map((reply) => (reply.id === replyId ? { ...reply, answer: cleanBotAnswer(answer), loading: false } : reply))
      );
    } catch (error) {
      console.error("SEA-LION chatbot error:", error);
      setDynamicReplies((prev) =>
        prev.map((reply) =>
          reply.id === replyId
            ? {
                ...reply,
                answer: cleanBotAnswer(
                  `${getFallbackAnswer(trimmedPrompt)}\n\nSEA-LION is unavailable right now, so this fallback SOP response is shown.`
                ),
                loading: false,
              }
            : reply
        )
      );
    } finally {
      setIsAsking(false);
    }
  };

  const handleSend = () => {
    askBot(input);
  };

  const stopSpeechInput = async () => {
    setIsListening(false);
  };

  const startSpeechInput = async () => {
    setIsListening(false);
    Alert.alert(
      "Speech-to-text unavailable",
      "SEA-LION's public API currently supports text/chat completions, not audio transcription. Use your phone keyboard's dictation button, or connect a separate transcription API behind the backend."
    );
  };

  const toggleSpeechInput = async () => {
    if (isAsking) return;

    if (isListening) {
      await stopSpeechInput();
      return;
    }

    await startSpeechInput();
  };

  const addLocalReply = (question: string, answer: string) => {
    setDynamicReplies((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        question,
        answer,
        time: formatCurrentTime(),
        loading: false,
        showGuide: false,
      },
    ]);
  };

  const markEvacuationComplete = async () => {
    if (isAsking) return;

    const question = "Mark evacuation complete";
    const completedAt = formatReportTimestamp();
    const note = `[${completedAt}] Evacuation marked complete for Fire Incident - Zone 4B.`;

    setInput("");
    setShowFullSteps(true);
    setIsAsking(true);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      if (sessionError || !userId) {
        throw new Error("Unable to find current user session");
      }

      const { data: shiftsData, error: shiftsError } = await supabase
        .from("shifts")
        .select("shift_id, shift_description, shift_date, clockin_time, clockout_time")
        .eq(shiftOwnerColumn, userId)
        .order("shift_date", { ascending: false })
        .limit(10);

      if (shiftsError) throw shiftsError;

      const shifts = (shiftsData || []) as ShiftReportTarget[];
      const targetShift =
        shifts.find((shift) => shift.clockin_time && !shift.clockout_time) ??
        shifts.find((shift) => shift.shift_date === todayISO()) ??
        shifts[0];

      if (!targetShift?.shift_id) {
        throw new Error("No shift report found to update");
      }

      const existingDescription = targetShift.shift_description?.trim();
      const updatedDescription = existingDescription ? `${existingDescription}\n${note}` : note;

      const { error: updateError } = await supabase
        .from("shifts")
        .update({ shift_description: updatedDescription })
        .eq("shift_id", targetShift.shift_id);

      if (updateError) throw updateError;

      addLocalReply(
        question,
        `Evacuation complete has been recorded in the shift report.\nTime noted: ${completedAt}`
      );
    } catch (error) {
      console.error("Error marking evacuation complete:", error);
      addLocalReply(
        question,
        `I could not update the shift report automatically. Please add this note manually:\n${note}`
      );
    } finally {
      setIsAsking(false);
    }
  };

  const handleSuggestionPress = (suggestion: string) => {
    if (suggestion === "Show evacuation steps") {
      askBot(suggestion);
      return;
    }

    if (suggestion === "Escalation contacts" || suggestion === "Location of fire alarm") {
      if (appRoutePrefix === "/sso") {
        router.push("/sso/sop");
        return;
      }
      router.push("/securityofficer/fire-evacuation");
      return;
    }

    if (suggestion === "Mark evacuation complete") {
      void markEvacuationComplete();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.replace(`${appRoutePrefix}/home` as any)} hitSlop={10}>
          <ChevronLeft size={36} color="#FFFFFF" strokeWidth={3} />
        </Pressable>
        <Text style={styles.headerTitle}>Chat Bot</Text>
        <View style={styles.headerBotWrap}>
          <Image source={CONVO_BOT_IMAGE} style={styles.headerBotImage} resizeMode="cover" />
          <Text style={styles.headerBotText}>conversation AI</Text>
        </View>
      </View>

      <View style={styles.incidentBanner}>
        <View style={styles.alertIconWrap}>
          <AlertTriangle size={30} color="#B91C1C" strokeWidth={2.8} />
        </View>
        <View style={styles.incidentTextWrap}>
          <Text style={styles.incidentTitle}>ACTIVE INCIDENT - ZONE 4B</Text>
          <Text style={styles.incidentSubtitle}>Fire detected at Zone 4B. Response in progress</Text>
        </View>
      </View>

      <ScrollView style={styles.chatArea} contentContainerStyle={styles.chatContent} keyboardShouldPersistTaps="handled">
        {botReplies.map((reply) => (
          <View key={reply.id} style={styles.botBlock}>
            <View style={styles.botHeaderRow}>
              <BotAvatar />
              <View style={styles.botTitleWrap}>
                <Text style={styles.followText}>Follow up -</Text>
                <Text style={styles.botTitle}>{reply.title}</Text>
              </View>
            </View>

            <View style={styles.botBody}>{reply.body}</View>

            {reply.suggestions ? (
              <View style={styles.suggestionsWrap}>
                <Text style={styles.suggestionHelp}>Click on the suggested questions or type out your question.</Text>
                {reply.suggestions.map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    style={[styles.suggestionButton, isAsking && styles.disabledButton]}
                    disabled={isAsking}
                    onPress={() => handleSuggestionPress(suggestion)}
                  >
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Text style={styles.replyTime}>{reply.time}</Text>

          </View>
        ))}

        {dynamicReplies.map((reply) => (
          <View key={reply.id} style={styles.botBlock}>
            <View style={styles.userBubbleWrap}>
              <View style={styles.userBubble}>
                <Text style={styles.userBubbleText}>{reply.question}</Text>
              </View>
              <Text style={styles.userTime}>{reply.time}</Text>
            </View>

            <View style={styles.botHeaderRow}>
              <BotAvatar />
              <View style={styles.botTitleWrap}>
                <Text style={styles.followText}>Follow up -</Text>
                <Text style={styles.botTitle}>Fire Incident - Zone 4B</Text>
              </View>
            </View>

            <View style={styles.botBody}>
              {reply.loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#16518E" />
                  <Text style={styles.loadingText}>Checking SOP with SEA-LION...</Text>
                </View>
              ) : (
                <>
                  {reply.answer.split("\n").map((line, index) =>
                    line.trim() ? (
                      <Text key={`${reply.id}-${index}`} style={styles.messageText}>
                        {line.trim()}
                      </Text>
                    ) : null
                  )}
                  {reply.showGuide ? (
                    <>
                      <Text style={styles.messageText}>Use correct extinguisher:</Text>
                      <ExtinguisherGuide width={width - 96} />
                    </>
                  ) : null}
                </>
              )}
            </View>

            <Text style={styles.replyTime}>{reply.time}</Text>
          </View>
        ))}

        {showFullSteps ? (
          <View style={styles.actionRow}>
            <Pressable style={styles.actionButton} onPress={() => Linking.openURL("tel:995")}>
              <View style={styles.actionCircle}>
                <PhoneCall size={28} color="#0E2D52" strokeWidth={2.4} />
              </View>
              <Text style={styles.actionLabel}>Call SCDF</Text>
            </Pressable>
            <Pressable
              style={styles.actionButton}
              onPress={() =>
                appRoutePrefix === "/sso"
                  ? router.push("/sso/sop")
                  : router.push("/securityofficer/fire-evacuation")
              }
            >
              <View style={styles.actionCircle}>
                <ListChecks size={30} color="#0E2D52" strokeWidth={2.4} />
              </View>
              <Text style={styles.actionLabel}>View Fire SOP Guide</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={() => router.push(`${appRoutePrefix}/incidents` as any)}>
              <View style={styles.actionCircle}>
                <Check size={36} color="#0E2D52" strokeWidth={2.4} />
              </View>
              <Text style={styles.actionLabel}>Open Incident Checklist</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={() => router.push(`${appRoutePrefix}/reports` as any)}>
              <View style={styles.actionCircle}>
                <ClipboardPen size={30} color="#0E2D52" strokeWidth={2.4} />
              </View>
              <Text style={styles.actionLabel}>Report Incident</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.inputBar}>
        <View style={styles.inputWrap}>
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            placeholder={isListening ? "listening..." : "type here..."}
            placeholderTextColor="#111827"
            returnKeyType="send"
            style={styles.input}
          />
          <Pressable
            style={[styles.micButton, isListening && styles.micButtonListening, isAsking && styles.disabledButton]}
            onPress={input.trim() ? handleSend : toggleSpeechInput}
            disabled={isAsking}
            hitSlop={8}
          >
            {input.trim() ? (
              <Bot size={22} color="#FFFFFF" strokeWidth={2.4} />
            ) : isListening ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Mic size={30} color="#FFFFFF" strokeWidth={2.4} />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    minHeight: 106,
    backgroundColor: "#16518E",
    paddingTop: 40,
    paddingBottom: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 31,
    fontWeight: "800",
    textAlign: "center",
    marginLeft: 12,
  },
  headerBotWrap: {
    width: 72,
    alignItems: "center",
  },
  headerBotImage: {
    width: 62,
    height: 46,
    borderRadius: 8,
  },
  headerBotText: {
    marginTop: 1,
    color: "#FFFFFF",
    fontSize: 7,
    fontWeight: "700",
  },
  incidentBanner: {
    minHeight: 78,
    backgroundColor: "#F3B1B5",
    borderBottomWidth: 2,
    borderBottomColor: "#E58B92",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  alertIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#9F232B",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  incidentTextWrap: {
    flex: 1,
  },
  incidentTitle: {
    color: "#B01621",
    fontSize: 23,
    lineHeight: 27,
    fontWeight: "900",
    letterSpacing: 0,
  },
  incidentSubtitle: {
    color: "#211315",
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: 0,
  },
  chatArea: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 22,
  },
  botBlock: {
    marginBottom: 18,
  },
  botHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  botAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EAF4FF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: 10,
  },
  botAvatarImage: {
    width: 102,
    height: 72,
  },
  botTitleWrap: {
    flex: 1,
  },
  followText: {
    color: "#202124",
    fontSize: 16,
    lineHeight: 22,
  },
  botTitle: {
    color: "#0B0B0C",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  botBody: {
    marginTop: 12,
    paddingHorizontal: 16,
  },
  messageText: {
    color: "#202124",
    fontSize: 20,
    lineHeight: 32,
    letterSpacing: 0,
  },
  fireIcon: {
    fontSize: 20,
  },
  suggestionsWrap: {
    marginTop: 20,
    paddingHorizontal: 8,
  },
  suggestionHelp: {
    color: "#111827",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  suggestionButton: {
    minHeight: 31,
    justifyContent: "center",
    backgroundColor: "#E6EEF5",
    marginBottom: 9,
    paddingHorizontal: 12,
    borderRadius: 0,
  },
  disabledButton: {
    opacity: 0.55,
  },
  suggestionText: {
    color: "#0A66B7",
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0,
  },
  replyTime: {
    color: "#3E6F9E",
    fontSize: 15,
    marginTop: 10,
    marginLeft: 12,
  },
  userBubbleWrap: {
    alignItems: "flex-end",
    marginTop: 26,
  },
  userBubble: {
    width: "73%",
    minHeight: 72,
    borderRadius: 8,
    backgroundColor: "#A9CDF8",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  userBubbleText: {
    color: "#111827",
    fontSize: 19,
    lineHeight: 25,
  },
  userTime: {
    color: "#3E6F9E",
    fontSize: 14,
    marginTop: 8,
    marginRight: 6,
  },
  guideWrap: {
    alignItems: "center",
    marginVertical: 12,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  loadingText: {
    color: "#202124",
    fontSize: 16,
    lineHeight: 22,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 8,
    marginTop: 6,
  },
  actionButton: {
    width: "24%",
    alignItems: "center",
  },
  actionCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: "#F2D8CB",
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    color: "#111827",
    fontSize: 10,
    lineHeight: 13,
    textAlign: "center",
    marginTop: 8,
  },
  inputBar: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#DADDE3",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },
  inputWrap: {
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B9CFE8",
    backgroundColor: "#EAF4FF",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 40,
    paddingRight: 8,
  },
  input: {
    flex: 1,
    color: "#111827",
    fontSize: 16,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
  },
  micButton: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: "#0E2D52",
    alignItems: "center",
    justifyContent: "center",
  },
  micButtonListening: {
    backgroundColor: "#B01621",
  },
});
