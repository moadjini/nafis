// A deliberately simple phrase check used ONLY to offer support resources
// alongside the composer. It never blocks posting, never flags anyone to
// moderators, and cannot tell whether someone is safe — the UI says so.

const PHRASES = [
  // English
  "kill myself",
  "killing myself",
  "end my life",
  "ending my life",
  "take my own life",
  "want to die",
  "wanna die",
  "don't want to live",
  "dont want to live",
  "don't want to be alive",
  "suicide",
  "suicidal",
  "hurt myself",
  "harm myself",
  "self harm",
  "self-harm",
  "better off dead",
  "no reason to live",
  // Somali
  "is dil",
  "isdil",
  "is-dil",
  "naftayda ka qaado",
  "naftayda qaado",
  "dhimasho ayaan rabaa",
  "waan dhiman rabaa",
  "rabaa inaan dhinto",
  "inaan dhinto ayaan rabaa",
  "nolosha ka daalay",
  "noolaan maayo",
  "is waxyeello",
];

function normalise(text: string) {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ");
}

export function mightIndicateCrisis(text: string | null | undefined) {
  if (!text) return false;
  const value = normalise(text);
  return PHRASES.some((phrase) => value.includes(phrase));
}
