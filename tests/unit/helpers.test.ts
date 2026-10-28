import { describe, expect, it } from "vitest";
import { extensionFor, normaliseAudioMime } from "@/lib/audio";
import { mightIndicateCrisis } from "@/lib/crisis";
import { toErrorCode } from "@/lib/errors";
import { suggestPseudonym } from "@/lib/pseudonym";
import { dailyIndex, formatDuration, interpolate, isUuid, safeRedirectPath } from "@/lib/utils";

describe("safeRedirectPath", () => {
  it("allows same-origin paths only", () => {
    expect(safeRedirectPath("/post/123?x=1")).toBe("/post/123?x=1");
    expect(safeRedirectPath("https://evil.example")).toBe("/home");
    expect(safeRedirectPath("//evil.example")).toBe("/home");
    expect(safeRedirectPath("/\\evil.example")).toBe("/home");
    expect(safeRedirectPath(null, "/onboarding")).toBe("/onboarding");
  });
});

describe("audio helpers", () => {
  it("normalises recorder MIME types and rejects others", () => {
    expect(normaliseAudioMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(normaliseAudioMime("AUDIO/MP4")).toBe("audio/mp4");
    expect(normaliseAudioMime("audio/mp3")).toBe("audio/mpeg");
    expect(normaliseAudioMime("video/webm")).toBeNull();
    expect(normaliseAudioMime("")).toBeNull();
    expect(extensionFor("audio/mp4")).toBe("m4a");
    expect(extensionFor("audio/mpeg")).toBe("mp3");
  });
});

describe("crisis phrase check", () => {
  it("flags explicit statements in English and Somali", () => {
    expect(mightIndicateCrisis("Sometimes I want to die")).toBe(true);
    expect(mightIndicateCrisis("I don’t want to live anymore")).toBe(true);
    expect(mightIndicateCrisis("Waxaan ka fikirayaa inaan is dilo")).toBe(true);
    expect(mightIndicateCrisis("waxaan rabaa inaan naftayda ka qaado")).toBe(true);
  });

  it("does not flag ordinary sadness", () => {
    expect(mightIndicateCrisis("I feel so lonely and sad today")).toBe(false);
    expect(mightIndicateCrisis("Waan murugaysanahay maanta")).toBe(false);
    expect(mightIndicateCrisis(null)).toBe(false);
  });
});

describe("error mapping", () => {
  it("passes through known codes and hides raw database messages", () => {
    expect(toErrorCode({ message: "rate_limited" })).toBe("rate_limited");
    expect(toErrorCode({ message: "new row violates row-level security policy", code: "42501" })).toBe("not_allowed");
    expect(toErrorCode({ message: "duplicate key value violates unique constraint \"x\"", code: "23505" })).toBe("generic");
    expect(toErrorCode({ message: "TypeError: fetch failed" })).toBe("network");
    expect(toErrorCode(null)).toBe("generic");
  });
});

describe("misc utils", () => {
  it("interpolates placeholders", () => {
    expect(interpolate("{a} and {b} and {c}", { a: 1, b: "two" })).toBe("1 and two and {c}");
  });

  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65.9)).toBe("1:05");
    expect(formatDuration(180)).toBe("3:00");
  });

  it("validates uuids", () => {
    expect(isUuid("4f1d6c2e-8a3b-4c5d-9e7f-0a1b2c3d4e5f")).toBe(true);
    expect(isUuid("4f1d6c2e")).toBe(false);
  });

  it("picks a stable daily index", () => {
    const day = Date.parse("2026-10-27T01:00:00Z");
    expect(dailyIndex(7, day)).toBe(dailyIndex(7, day + 3600_000));
    expect(dailyIndex(7, day)).toBeLessThan(7);
  });

  it("suggests two-word pseudonyms", () => {
    let i = 0;
    const seq = () => [0.1, 0.9][i++ % 2]!;
    expect(suggestPseudonym("en", seq).split(" ")).toHaveLength(2);
    expect(suggestPseudonym("so").split(" ")).toHaveLength(2);
  });
});
