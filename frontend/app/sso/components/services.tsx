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
  CalendarDays,
  CreditCard,
  FileText,
  Languages,
  ListChecks,
  LogOut,
  MessageCircleMore,
  PhoneCall,
  Settings,
  ShieldAlert,
  UserCircle2,
} from "lucide-react-native";
import Text from "../../../components/TranslatedText";
import { supabase } from "../../../lib/supabase";

type ServicesModalProps = {
  visible: boolean;
  onClose: () => void;
};

type ServiceItem = {
  id: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  href?: string;
  onPress?: () => void | Promise<void>;
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
          translateY.setValue(Math.max(0, gestureState.dy));
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
    { id: "id-card", label: "ID Card", Icon: CreditCard, href: "/sso/id-card" },
    { id: "incidents", label: "Incidents", Icon: ShieldAlert, href: "/sso/incidents" },
    { id: "reports", label: "Reports", Icon: FileText, href: "/sso/reports" },
    { id: "schedule", label: "Upcoming Schedule", Icon: CalendarDays, href: "/sso/upcoming-shift-details" },
    { id: "phone-calls", label: "Phone Calls", Icon: PhoneCall, href: "/sso/phonecalls" },
    { id: "messages", label: "Messages", Icon: MessageCircleMore, href: "/sso/messagingChannel" },
    { id: "notifications", label: "Notifications", Icon: Bell, href: "/sso/notifications" },
    { id: "sops", label: "SOPs", Icon: ListChecks, href: "/sso/sop" },
    { id: "settings", label: "Settings", Icon: Settings, href: "/sso/settings" },
    { id: "languages", label: "Languages", Icon: Languages, href: "/sso/languages" },
    { id: "translate", label: "Translate", Icon: Languages, href: "/sso/translate" },
    { id: "profile", label: "Profile", Icon: UserCircle2, href: "/sso/profile" },
    {
      id: "logout",
      label: "Logout",
      Icon: LogOut,
      onPress: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
          Alert.alert("Sign out failed", error.message);
          return;
        }
        onClose();
        router.replace("/login");
      },
    },
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
                    void onPress();
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
    height: "78%",
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
    marginBottom: 24,
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
