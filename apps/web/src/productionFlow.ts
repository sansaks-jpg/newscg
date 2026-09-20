export type LiveShortcut = "take" | "take-next" | "update" | "clear" | "clear-all" | "logo" | "full" |
  "name" | "headline" | "location" | "detail" | "toggle-location" | "toggle-detail" | "previous" | "next";
const shortcuts: Record<string, LiveShortcut> = {
  " ": "take", t: "take", Enter: "take-next", u: "update", Escape: "clear", c: "clear",
  "0": "clear-all", "1": "logo", "2": "full", "3": "name", "4": "headline", "5": "location", "6": "detail",
  l: "toggle-location", d: "toggle-detail", ArrowUp: "previous", ArrowDown: "next",
};
export function liveShortcut(key: string, context: {
  disabled?: boolean; editing?: boolean; interactive?: boolean; repeat?: boolean; modified?: boolean;
}): LiveShortcut | null {
  if (context.disabled || context.editing || context.repeat || context.modified) return null;
  if (context.interactive && (key === " " || key === "Enter")) return null;
  return shortcuts[key] || shortcuts[key.toLowerCase()] || null;
}
export async function takeThenAdvance(take: () => Promise<boolean>, advance: () => void) {
  const confirmed = await take();
  if (confirmed) advance();
  return confirmed;
}
