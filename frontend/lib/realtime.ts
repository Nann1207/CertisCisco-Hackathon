export const createRealtimeTopic = (prefix: string) =>
  `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
