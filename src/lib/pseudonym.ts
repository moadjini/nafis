// Client-side pseudonym suggestions for onboarding. Names are generic and
// gentle; they never derive from the user's email or account.

const ADJECTIVES = {
  en: ["Quiet", "Gentle", "Calm", "Kind", "Soft", "Steady", "Warm", "Bright", "Patient", "Hopeful", "Tender", "Still", "Brave", "Open", "Light"],
  so: ["Deggan", "Jilicsan", "Xasilloon", "Naxariis", "Diirran", "Dhiirran", "Dulqaad", "Rajo", "Iftiin", "Furan", "Aamusan", "Daacad", "Qabow", "Nool", "Wanaagsan"],
} as const;

const NOUNS = {
  en: ["River", "Leaf", "Cedar", "Meadow", "Breeze", "Harbor", "Willow", "Dune", "Moon", "Sparrow", "Stone", "Rain", "Garden", "Lantern", "Tide"],
  so: ["Webi", "Caleen", "Geed", "Doog", "Dabayl", "Deked", "Ciid", "Dayax", "Shimbir", "Dhagax", "Roob", "Beer", "Laambad", "Hir", "Xiddig"],
} as const;

function pick<T>(items: readonly T[], random: () => number) {
  return items[Math.floor(random() * items.length)]!;
}

export function suggestPseudonym(locale: "en" | "so" = "en", random: () => number = Math.random) {
  // Somali puts the noun first ("Webi Deggan"), English the adjective first.
  const adjective = pick(ADJECTIVES[locale], random);
  const noun = pick(NOUNS[locale], random);
  return locale === "so" ? `${noun} ${adjective}` : `${adjective} ${noun}`;
}
