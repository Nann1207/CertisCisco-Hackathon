import React from "react";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { X } from "lucide-react-native";
import Text from "../../../components/TranslatedText";
import type { NotificationItem } from "../../../lib/notifications";

type NotificationsModalProps = {
  visible: boolean;
  notifications: NotificationItem[];
  onClose: () => void;
  onDelete: (id: string) => void;
  onViewAll?: () => void;
};

export default function NotificationsModal({
  visible,
  notifications,
  onClose,
  onDelete,
  onViewAll,
}: NotificationsModalProps) {
  const activeNotifications = React.useMemo(() => {
    const m = new Map<string, NotificationItem>();
    for (const n of notifications) {
      if (n.dismissedAt) continue;
      if (!m.has(n.id)) m.set(n.id, n);
    }
    return Array.from(m.values());
  }, [notifications]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.notificationsBackdrop}>
        <View style={styles.notificationsPopoverWrap}>
          <View style={styles.notificationsAnchor} />
          <View style={styles.notificationsCard}>
            <View style={styles.notificationsHeaderRow}>
              <Text style={styles.notificationsTitle}>Notifications</Text>
              <Pressable style={styles.notificationsCloseBtn} onPress={onClose}>
                <X color="#475569" size={14} strokeWidth={3} />
              </Pressable>
            </View>

            <FlatList
              data={activeNotifications}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.notificationsListContent}
              ListEmptyComponent={
                <Text style={styles.notificationsEmptyText}>No notifications right now.</Text>
              }
              renderItem={({ item }) => (
                <View style={styles.notificationItemCard}>
                  <View style={styles.notificationTextWrap}>
                    <Text style={styles.notificationItemTitle}>{item.title}</Text>
                    <Text style={styles.notificationItemBody}>{item.body}</Text>
                  </View>

                  <Pressable style={styles.notificationDeleteBtn} onPress={() => onDelete(item.id)}>
                    <X color="#B91C1C" size={12} strokeWidth={3} />
                  </Pressable>
                </View>
              )}
            />

            {onViewAll ? (
              <Pressable style={styles.viewAllBtn} onPress={onViewAll}>
                <Text style={styles.viewAllBtnText}>View all notifications</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  notificationsBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 92,
    paddingHorizontal: 14,
  },
  notificationsPopoverWrap: {
    width: "100%",
    maxWidth: 380,
    alignItems: "flex-end",
  },
  notificationsAnchor: {
    width: 16,
    height: 16,
    backgroundColor: "#FFFFFF",
    transform: [{ rotate: "45deg" }],
    marginBottom: -8,
    marginRight: 41,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: "#ffffff",
  },
  notificationsCard: {
    width: "100%",
    maxHeight: 500,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ffffff",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  notificationsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  notificationsTitle: {
    color: "#0E2D52",
    fontSize: 20,
    fontWeight: "800",
  },
  notificationsCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  notificationsListContent: {
    gap: 10,
    paddingBottom: 4,
  },
  notificationsEmptyText: {
    textAlign: "center",
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: 18,
  },
  notificationItemCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  notificationTextWrap: {
    flex: 1,
  },
  notificationItemTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800",
  },
  notificationItemBody: {
    marginTop: 4,
    color: "#334155",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  notificationDeleteBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 1,
  },
  viewAllBtn: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
    paddingVertical: 10,
    alignItems: "center",
  },
  viewAllBtnText: {
    color: "#1E3A8A",
    fontSize: 13,
    fontWeight: "700",
  },
});
