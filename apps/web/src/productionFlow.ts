import type { LiveShortcut } from "@newscg/shared";
export type { LiveShortcut } from "@newscg/shared";

const shortcuts: Record<string, LiveShortcut> = {
  " ": "take",
  Enter: "take",
  u: "update",
  m: "master",
  Escape: "clear",
  c: "clear",
  "0": "clear-all",
  "1": "logo",
  "2": "full",
  h: "headline",
  l: "location",
  k: "sot",
  ArrowLeft: "previous-sot",
  ArrowRight: "next-sot",
  t: "topic",
  d: "detail",
  ArrowUp: "previous",
  ArrowDown: "next"
};

export function liveShortcut(
  key: string,
  context: {
    disabled?: boolean;
    editing?: boolean;
    interactive?: boolean;
    repeat?: boolean;
    modified?: boolean;
  }
): LiveShortcut | null {
  if (context.disabled || context.editing || context.repeat || context.modified) return null;
  if (context.interactive && (key === " " || key === "Enter")) return null;
  return shortcuts[key] || shortcuts[key.toLowerCase()] || null;
}

export async function takeThenAdvance(take: () => Promise<boolean>, advance: () => void) {
  const confirmed = await take();
  if (confirmed) advance();
  return confirmed;
}

export function primaryGraphicAction(canUpdate: boolean): "take" | "update" {
  return canUpdate ? "update" : "take";
}
