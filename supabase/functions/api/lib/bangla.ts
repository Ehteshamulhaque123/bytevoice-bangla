// Bangla language helpers: digits, phone numbers, spoken dates and times.
// Pure functions, no I/O — unit tested in tests/bangla.test.ts.

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/** Convert Bangla (০-৯) and Arabic-Indic digits to ASCII 0-9. Other characters untouched. */
export function toAsciiDigits(input: string): string {
  return input.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** Convert ASCII digits to Bangla digits. */
export function toBnDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

// Spoken number words the caller (or the transcriber) may leave in the text.
const WORD_DIGITS: Record<string, string> = {
  "শূন্য": "0", "শুন্য": "0", "জিরো": "0", "zero": "0", "oh": "0",
  "এক": "1", "one": "1", "দুই": "2", "two": "2", "তিন": "3", "three": "3",
  "চার": "4", "four": "4", "পাঁচ": "5", "five": "5", "ছয়": "6", "six": "6",
  "সাত": "7", "seven": "7", "আট": "8", "eight": "8", "নয়": "9", "nine": "9",
  // English number words written in Bangla script, as transcribers often render them.
  "ওয়ান": "1", "টু": "2", "থ্রি": "3", "ফোর": "4", "ফাইভ": "5", "সিক্স": "6", "সেভেন": "7", "এইট": "8", "নাইন": "9",
};
// য় can be typed precomposed (U+09DF) or as য + nukta; NFC folds both to one form.
const WORD_DIGITS_NFC: Record<string, string> = Object.fromEntries(
  Object.entries(WORD_DIGITS).map(([k, v]) => [k.normalize("NFC"), v]),
);
const REPEATERS: Record<string, number> = { "ডাবল": 2, "double": 2, "ট্রিপল": 3, "triple": 3 };

/**
 * Pull the digit sequence out of a phone number as spoken or typed:
 * "০১৭১২-৩৪৫ ৬৭৮", "+880 1712 345678", "zero one seven double one…", "ডাবল সাত".
 */
export function extractDigits(raw: string): string {
  const tokens = toAsciiDigits(raw.toLowerCase().normalize("NFC"))
    .replace(/[-–—_.,()/]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let out = "";
  let repeat = 1;
  for (const t of tokens) {
    if (t in REPEATERS) { repeat = REPEATERS[t]; continue; }
    let piece = "";
    if (/^\+?[0-9]+$/.test(t)) piece = t.replace("+", "");
    else if (t in WORD_DIGITS_NFC) piece = WORD_DIGITS_NFC[t];
    else continue; // ignore filler words
    out += piece.length === 1 ? piece.repeat(repeat) : piece[0].repeat(repeat - 1) + piece;
    repeat = 1;
  }
  return out;
}

export type PhoneCheck = {
  raw: string;
  digits: string;
  e164: string | null;
  national: string | null; // 01XXXXXXXXX
  valid: boolean;
  operator: string | null;
  problem: string | null;  // machine-readable reason when invalid
};

const OPERATORS: Record<string, string> = {
  "013": "Grameenphone", "017": "Grameenphone", "014": "Banglalink", "019": "Banglalink",
  "015": "Teletalk", "016": "Airtel", "018": "Robi",
};

/** Validate and normalise a Bangladeshi mobile number to E.164 (+8801XXXXXXXXX). */
export function normalizeBdPhone(raw: string | null | undefined): PhoneCheck {
  const base: PhoneCheck = { raw: raw ?? "", digits: "", e164: null, national: null, valid: false, operator: null, problem: null };
  if (!raw || !raw.trim()) return { ...base, problem: "empty" };
  let d = extractDigits(raw);
  base.digits = d;
  if (d.startsWith("00880")) d = d.slice(4);
  else if (d.startsWith("880")) d = d.slice(2);
  else if (d.startsWith("88") && d.length === 13) d = d.slice(2);
  if (d.length === 10 && d.startsWith("1")) d = "0" + d; // "1712345678" without leading 0
  if (d.length < 11) return { ...base, problem: "too_short" };
  if (d.length > 11) return { ...base, problem: "too_long" };
  if (!/^01[3-9]\d{8}$/.test(d)) return { ...base, problem: "not_bd_mobile" };
  return {
    ...base, valid: true, national: d, e164: "+88" + d,
    operator: OPERATORS[d.slice(0, 3)] ?? null, problem: null,
  };
}

/** "01712345678" → "০ ১ ৭ ১ ২, ৩ ৪ ৫, ৬ ৭ ৮" — grouped the way people read numbers back. */
export function phoneReadback(national: string): string {
  const g = [national.slice(0, 5), national.slice(5, 8), national.slice(8)];
  return g.map((part) => part.split("").map(toBnDigits).join(" ")).join(", ");
}

// ───────────────────────── Dates & times ─────────────────────────

export const WEEKDAYS_BN = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
export const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTHS_BN = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];

/** Bangladesh has no DST: Asia/Dhaka is a fixed UTC+06:00. */
export const DHAKA_OFFSET_MIN = 6 * 60;

/** Local Dhaka wall-clock parts for an instant. */
export function dhakaParts(d: Date) {
  const l = new Date(d.getTime() + DHAKA_OFFSET_MIN * 60_000);
  return {
    y: l.getUTCFullYear(), m: l.getUTCMonth() + 1, day: l.getUTCDate(),
    hh: l.getUTCHours(), mm: l.getUTCMinutes(), dow: l.getUTCDay(),
    isoDate: l.toISOString().slice(0, 10), hhmm: l.toISOString().slice(11, 16),
  };
}

/** Local "YYYY-MM-DD" + "HH:MM" in Dhaka → UTC Date. */
export function dhakaToUtc(isoDate: string, hhmm: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - DHAKA_OFFSET_MIN * 60_000);
}

export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** "2026-11-22" → "রবিবার, ২২ নভেম্বর" */
export function spokenDateBn(isoDate: string): string {
  const [, m, d] = isoDate.split("-").map(Number);
  return `${WEEKDAYS_BN[weekdayOf(isoDate)]}, ${toBnDigits(d)} ${MONTHS_BN[m - 1]}`;
}

/** Part of day as Bangladeshis say it. */
export function partOfDayBn(hh: number, mm = 0): string {
  const t = hh * 60 + mm;
  if (t < 6 * 60) return "ভোর";
  if (t < 12 * 60) return "সকাল";
  if (t < 15 * 60) return "দুপুর";
  if (t < 17 * 60 + 30) return "বিকাল";
  if (t < 20 * 60) return "সন্ধ্যা";
  return "রাত";
}

/**
 * "18:30" → "সন্ধ্যা সাড়ে ৬টা"; "13:30" → "দুপুর দেড়টা"; "14:30" → "দুপুর আড়াইটা";
 * "10:15" → "সকাল সোয়া ১০টা"; "16:45" → "বিকাল পৌনে ৫টা"; "17:10" → "বিকাল ৫টা ১০ মিনিট".
 */
export function spokenTimeBn(hhmm: string): string {
  const [hh, mm] = hhmm.split(":").map(Number);
  const pod = partOfDayBn(hh, mm);
  const h12 = (h: number) => ((h + 11) % 12) + 1;
  const h = h12(hh);
  if (mm === 0) return `${pod} ${toBnDigits(h)}টা`;
  if (mm === 30) {
    if (h === 1) return `${pod} দেড়টা`;
    if (h === 2) return `${pod} আড়াইটা`;
    return `${pod} সাড়ে ${toBnDigits(h)}টা`;
  }
  if (mm === 15) return `${pod} সোয়া ${toBnDigits(h)}টা`;
  if (mm === 45) return `${partOfDayBn(hh + 1)} পৌনে ${toBnDigits(h12(hh + 1))}টা`;
  return `${pod} ${toBnDigits(h)}টা ${toBnDigits(mm)} মিনিট`;
}

/** Local time windows used when a caller says "সকালে", "বিকালে", "সন্ধ্যায়" … */
export const PART_OF_DAY_WINDOWS: Record<string, [string, string]> = {
  morning: ["06:00", "12:00"],
  noon: ["12:00", "15:00"],
  afternoon: ["15:00", "17:30"],
  evening: ["17:00", "20:00"],
  night: ["20:00", "23:59"],
};

/** Accepts "18:30", "6:30 pm", "০৬:৩০", "1830" → "18:30" or null. */
export function normalizeTime(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = toAsciiDigits(input).trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?::|\.|\s)?(\d{2})?\s*(am|pm)?$/);
  if (!m) return null;
  let hh = Number(m[1]);
  const mm = Number(m[2] ?? 0);
  if (m[3] === "pm" && hh < 12) hh += 12;
  if (m[3] === "am" && hh === 12) hh = 0;
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Accepts "2026-11-22" or Bangla-digit equivalent → ISO date or null (rejects impossible dates). */
export function normalizeDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = toAsciiDigits(input).trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return iso;
}

/** Light clean-up of a name before storing: trims, collapses spaces, strips honorifics the caller added. */
export function cleanName(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = name.replace(/\s+/g, " ").trim()
    .replace(/^(আমার নাম|আমি|my name is|i am|this is)\s+/i, "")
    .replace(/\s+(বলছি|বলছিলাম|speaking)$/i, "")
    .trim();
  return n.length >= 2 && n.length <= 80 ? n : null;
}
