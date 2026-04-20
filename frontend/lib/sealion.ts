const SEA_LION_API_URL = "https://api.sea-lion.ai/v1/chat/completions";

const SEA_LION_API_KEY = process.env.EXPO_PUBLIC_SEALION_API_KEY;
const SEA_LION_MODEL = process.env.EXPO_PUBLIC_SEALION_MODEL ?? "aisingapore/Gemma-SEA-LION-v4-27B-IT";

type SeaLionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type SeaLionChatCompletion = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export const isSeaLionConfigured = () => Boolean(SEA_LION_API_KEY);

export const askSeaLion = async (messages: SeaLionMessage[]) => {
  if (!SEA_LION_API_KEY) {
    throw new Error("Missing EXPO_PUBLIC_SEALION_API_KEY");
  }

  const response = await fetch(SEA_LION_API_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${SEA_LION_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SEA_LION_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 450,
    }),
  });

  if (!response.ok) {
    throw new Error(`SEA-LION request failed with status ${response.status}`);
  }

  const data = (await response.json()) as SeaLionChatCompletion;
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("SEA-LION returned an empty response");
  }

  return content;
};
