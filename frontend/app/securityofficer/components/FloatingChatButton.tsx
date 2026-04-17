import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Bot } from "lucide-react-native";

type Props = {
  bottomOffset?: number; 
  rightOffset?: number;
};

export default function FloatingChatButton({
  bottomOffset = 98, 
  rightOffset = 20,
}: Props) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push("/securityofficer/chatbot")}
      style={[styles.fab, { bottom: bottomOffset, right: rightOffset }]}
      hitSlop={12}
    >
      <Bot size={22} color="#FFFFFF" strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",

    width: 46,
    height: 46,
    borderRadius: 30,

    justifyContent: "center",
    alignItems: "center",


    backgroundColor: "#0E2D52",


    shadowColor: "rgba(14, 45, 82, 1)",
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
});