import { describe, expect, it } from "vitest";
import en from "@/lib/i18n/dictionaries/en";
import so from "@/lib/i18n/dictionaries/so";
import { formatRelativeTime, getDictionary, isLocale } from "@/lib/i18n";
import { REACTIONS, RESPONSE_PREFERENCES, TOPICS } from "@/lib/constants";

type Tree = string | readonly Tree[] | { [key: string]: Tree };

function collect(tree: Tree, path = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof tree === "string") {
    out.set(path, tree);
  } else if (Array.isArray(tree)) {
    tree.forEach((item, i) => collect(item, `${path}[${i}]`).forEach((v, k) => out.set(k, v)));
  } else {
    for (const [key, value] of Object.entries(tree)) {
      collect(value as Tree, path ? `${path}.${key}` : key).forEach((v, k) => out.set(k, v));
    }
  }
  return out;
}

const enStrings = collect(en as unknown as Tree);
const soStrings = collect(so as unknown as Tree);

describe("dictionaries", () => {
  it("Somali has exactly the same keys (including list lengths) as English", () => {
    expect([...soStrings.keys()].sort()).toEqual([...enStrings.keys()].sort());
  });

  it("has no empty strings", () => {
    for (const [key, value] of [...enStrings, ...soStrings]) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("keeps the same {placeholders} in both languages", () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, value] of enStrings) {
      expect(placeholders(soStrings.get(key)!), key).toEqual(placeholders(value));
    }
  });

  it("labels every topic, reaction and response preference", () => {
    for (const dict of [en, so]) {
      for (const topic of TOPICS) expect(dict.topics[topic]).toBeTruthy();
      for (const r of REACTIONS) expect(dict.reactions[r.key]).toBeTruthy();
      for (const p of RESPONSE_PREFERENCES) expect(dict.responsePrefs[p].guidance).toBeTruthy();
    }
  });

  it("keeps the Somali tagline in both locales", () => {
    expect(en.brand.tagline).toBe("Meel aad ku nafiso.");
    expect(so.brand.tagline).toBe("Meel aad ku nafiso.");
  });
});

describe("locale helpers", () => {
  it("recognises supported locales and falls back to English", () => {
    expect(isLocale("so")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(getDictionary("so").nav.home).toBe(so.nav.home);
  });

  it("formats relative time", () => {
    const now = Date.parse("2026-10-27T12:00:00Z");
    expect(formatRelativeTime("2026-10-27T11:59:50Z", "en", "just now", now)).toBe("just now");
    expect(formatRelativeTime("2026-10-27T10:00:00Z", "en", "just now", now)).toMatch(/2 hours ago/);
    expect(formatRelativeTime("2026-10-27T10:00:00Z", "so", "hadda", now)).toBeTruthy();
  });
});
