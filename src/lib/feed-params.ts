import { CONTENT_LANGUAGES, TOPICS, type ContentLanguage, type FeedSort, type Topic } from "@/lib/constants";
import type { FeedFilters } from "@/lib/types";

type Params = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Parses feed filters from URL search params, ignoring anything invalid. */
export function parseFeedParams(params: Params): FeedFilters & { tab: string } {
  const type = one(params.type);
  const topic = one(params.topic);
  const lang = one(params.lang);
  const tab = one(params.tab) ?? "recent";

  const filters: FeedFilters & { tab: string } = { tab };
  if (type === "text" || type === "voice") filters.postType = type;
  if (topic && (TOPICS as readonly string[]).includes(topic)) filters.topic = topic as Topic;
  if (lang && (CONTENT_LANGUAGES as readonly string[]).includes(lang)) filters.language = lang as ContentLanguage;
  return filters;
}

/** The home feed is ranked by engagement unless "Latest" is chosen. */
export function parseFeedSort(params: Params): FeedSort {
  return one(params.sort) === "latest" ? "latest" : "top";
}

export function filtersKey(filters: FeedFilters) {
  return JSON.stringify(filters);
}
