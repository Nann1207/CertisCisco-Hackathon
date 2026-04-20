export type ChatMessageRecord = {
  id: string;
  sender_id: string;
  receiver_id: string;
  text: string;
  created_at: string;
};

export type EmployeeProfile = {
  id: string;
  emp_id?: string | null;
  first_name: string | null;
  last_name: string | null;
  role?: string | null;
  profile_photo_path?: string | null;
  avatarUrl?: string | null;
};

export type ChatChannel = {
  id: string;
  name: string;
  subtitle: string;
  lastMessage: string;
  lastTime: string;
  unread?: number;
  online?: boolean;
  avatarUrl?: string | null;
  avatarColor: string;
  avatarTextColor: string;
};

const AVATAR_COLORS = ["#140C36", "#12211B", "#FDD78D", "#071236", "#163A63", "#702632", "#2F4858"];

export const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

export const getDisplayName = (profile?: EmployeeProfile | null) => {
  if (!profile) return "Unknown User";

  const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  return fullName || "Unknown User";
};

export const getAvatarColor = (id: string) => {
  const total = id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return AVATAR_COLORS[total % AVATAR_COLORS.length];
};

export const getAvatarTextColor = (backgroundColor: string) => (backgroundColor === "#FDD78D" ? "#111827" : "#FFFFFF");

export const formatMessageTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString([], {
    month: "numeric",
    day: "2-digit",
    year: "2-digit",
  });
};
