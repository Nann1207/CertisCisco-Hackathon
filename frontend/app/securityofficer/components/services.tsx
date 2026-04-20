import React, { useMemo, useRef } from "react";
import {
  Alert,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Bell,
  Bot,
  CalendarDays,
  CreditCard,
  FileText,
  Languages,
  ListChecks,
  MessageCircleMore,
  PhoneCall,
  ScrollText,
  Settings,
  ShieldAlert,
  UserCircle2,
} from "lucide-react-native";
import Text from "../../../components/TranslatedText";

type ServicesModalProps = {
  visible: boolean;
  onClose: () => void;
};

type ServiceItem = {
  id: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  href?: string;
  onPress?: () => void;
};

export default function ServicesModal({ visible, onClose }: ServicesModalProps) {
  const router = useRouter();
  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          gestureState.dy > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderMove: (_, gestureState) => {
          const nextY = Math.max(0, gestureState.dy);
          translateY.setValue(nextY);
        },
        onPanResponderRelease: (_, gestureState) => {
          const shouldClose = gestureState.dy > 120 || gestureState.vy > 1;
          if (shouldClose) {
            Animated.timing(translateY, {
              toValue: 420,
              duration: 160,
              useNativeDriver: true,
            }).start(() => {
              translateY.setValue(0);
              onClose();
            });
            return;
          }

          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
            speed: 20,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
            speed: 20,
          }).start();
        },
      }),
    [onClose, translateY]
  );

  const openRoute = (href: string) => {
    onClose();
    router.push(href as any);
  };

  const services: ServiceItem[] = [
    { id: "id-card", label: "ID Card", Icon: CreditCard, href: "/securityofficer/id-card" },
    { id: "incidents", label: "Incidents", Icon: ShieldAlert, href: "/securityofficer/incidents" },
    { id: "reports", label: "Reports", Icon: FileText, href: "/securityofficer/reports" },
    { id: "shift-reports", label: "Shift Reports", Icon: ScrollText, href: "/securityofficer/shift-reports" },
    { id: "schedule", label: "Upcoming Schedule", Icon: CalendarDays, href: "/securityofficer/schedule" },
    {
      id: "phone-calls",
      label: "Phone Calls",
      Icon: PhoneCall,
      onPress: () => {
        Alert.alert("Coming soon", "Phone calls page is not available yet.");
      },
    },
    { id: "messages", label: "Messages", Icon: MessageCircleMore, href: "/securityofficer/messagingChannel" },
    { id: "notifications", label: "Notifications", Icon: Bell, href: "/securityofficer/notifications" },
    { id: "sops", label: "SOPs", Icon: ListChecks, href: "/securityofficer/sop" },
    { id: "settings", label: "Settings", Icon: Settings, href: "/securityofficer/settings" },
    { id: "languages", label: "Languages", Icon: Languages, href: "/securityofficer/languages" },
    { id: "profile", label: "Profile", Icon: UserCircle2, href: "/securityofficer/profile" },
    { id: "chatbot", label: "AI Chatbot", Icon: Bot, href: "/(officer)/chatbot" },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <Animated.View
          style={[styles.sheet, { transform: [{ translateY }] }]}
          {...panResponder.panHandlers}
        >
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>All Services</Text>
          </View>

          <View style={styles.gridWrap}>
            {services.map(({ id, label, Icon, href, onPress }) => (
              <Pressable
                key={id}
                style={styles.serviceButton}
                onPress={() => {
                  if (href) {
                    openRoute(href);
                    return;
                  }
                  if (onPress) {
                    onPress();
                  }
                }}
              >
                <View style={styles.iconCircle}>
                  <Icon size={30} color="#0AAFD0" strokeWidth={2} />
                </View>
                <Text style={styles.serviceLabel}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    height: "75%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  handle: {
    alignSelf: "center",
    width: 64,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#9CA3AF",
    marginBottom: 12,
  },
  headerRow: {
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingBottom: 12,
    marginBottom: 30,
  },
  title: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  gridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 14,
  },
  serviceButton: {
    width: "25%",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#F3FAFD",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D7EEF5",
  },
  serviceLabel: {
    marginTop: 8,
    textAlign: "center",
    color: "#111827",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
  },
});
