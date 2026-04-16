import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Home, NotebookPen, MessageCircleMore, ListChecks, PhoneCall } from "lucide-react-native";

type Tab = {
  key: string;
  href: string;
  Icon: any;
};



const TABS: Tab[] = [
  { key: "home", href: "/securityoffier/home", Icon: Home },
  { key: "reports", href: "/securityoffier/reports", Icon: NotebookPen },
  { key: "phonecalls", href: "/securityoffier/phonecalls", Icon: PhoneCall },
  { key: "services", href: "/securityoffier/message", Icon: MessageCircleMore }, 
  { key: "incidents", href: "/securityoffier/incidents", Icon: ListChecks },
];

export default function BottomBar() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        {TABS.map(({ key, href, Icon }) => {
          const active = pathname === href;

          return (
            <Pressable
              key={key}
              onPress={() => router.replace(href)}
              style={styles.btn}
              hitSlop={10}
            >
              <Icon size={24} color={active ? "#0E2D52" : "#0E2D52"} />
            </Pressable>
          );
        })}
      </View>

      
      <View style={styles.homeIndicator} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFFFF",
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.12)",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 10,
  },
  bar: {
    height: 50,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  btn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  homeIndicator: {
    alignSelf: "center",
    marginTop: 10,
    width: 134,
    height: 5,
    backgroundColor: "#000",
    borderRadius: 34,
  },
});