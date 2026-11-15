import { deepStrictEqual as assertEquals } from "node:assert";
import {
  dhakaToUtc, extractDigits, normalizeBdPhone, normalizeDate, normalizeTime, phoneReadback,
  spokenDateBn, spokenTimeBn, toAsciiDigits, toBnDigits, cleanName,
} from "../lib/bangla.ts";

Deno.test("Bangla ↔ ASCII digits", () => {
  assertEquals(toAsciiDigits("০১৭১২৩৪৫৬৭৮"), "01712345678");
  assertEquals(toBnDigits("2026"), "২০২৬");
});

Deno.test("phone: Bangla digits with spaces and dashes", () => {
  const p = normalizeBdPhone("০১৭১২-৩৪৫ ৬৭৮");
  assertEquals(p.valid, true);
  assertEquals(p.e164, "+8801712345678");
  assertEquals(p.operator, "Grameenphone");
});

Deno.test("phone: +880 / 880 / 00880 prefixes", () => {
  assertEquals(normalizeBdPhone("+880 1812-345678").e164, "+8801812345678");
  assertEquals(normalizeBdPhone("8801912345678").e164, "+8801912345678");
  assertEquals(normalizeBdPhone("00880 1512 345678").e164, "+8801512345678");
  assertEquals(normalizeBdPhone("+৮৮০১৬১২৩৪৫৬৭৮").e164, "+8801612345678");
});

Deno.test("phone: missing leading zero is repaired", () => {
  assertEquals(normalizeBdPhone("1712345678").e164, "+8801712345678");
});

Deno.test("phone: spoken words and doubles", () => {
  assertEquals(extractDigits("জিরো ওয়ান সেভেন"), "017"); // English words in Bangla script
  assertEquals(extractDigits("আমার নম্বর ০১৭"), "017"); // filler words ignored
  assertEquals(extractDigits("শূন্য এক সাত ডাবল এক দুই তিন চার পাঁচ ছয় সাত"), "01711234567");
  assertEquals(extractDigits("zero one eight double five 123 456"), "01855123456");
  assertEquals(normalizeBdPhone("zero one eight double five 123 456").valid, true);
});

Deno.test("phone: invalid numbers are rejected with a reason", () => {
  assertEquals(normalizeBdPhone("01712").problem, "too_short");
  assertEquals(normalizeBdPhone("017123456789").problem, "too_long");
  assertEquals(normalizeBdPhone("01212345678").problem, "not_bd_mobile");
  assertEquals(normalizeBdPhone("").problem, "empty");
});

Deno.test("phone readback groups digits in Bangla", () => {
  assertEquals(phoneReadback("01712345678"), "০ ১ ৭ ১ ২, ৩ ৪ ৫, ৬ ৭ ৮");
});

Deno.test("spoken times use natural Bangla", () => {
  assertEquals(spokenTimeBn("18:30"), "সন্ধ্যা সাড়ে ৬টা");
  assertEquals(spokenTimeBn("13:30"), "দুপুর দেড়টা");
  assertEquals(spokenTimeBn("14:30"), "দুপুর আড়াইটা");
  assertEquals(spokenTimeBn("10:00"), "সকাল ১০টা");
  assertEquals(spokenTimeBn("16:45"), "বিকাল পৌনে ৫টা");
  assertEquals(spokenTimeBn("20:30"), "রাত সাড়ে ৮টা");
  assertEquals(spokenTimeBn("10:15"), "সকাল সোয়া ১০টা");
});

Deno.test("spoken dates", () => {
  assertEquals(spokenDateBn("2026-11-22"), "রবিবার, ২২ নভেম্বর");
});

Deno.test("time and date normalisation", () => {
  assertEquals(normalizeTime("6:30 pm"), "18:30");
  assertEquals(normalizeTime("০৬:৩০"), "06:30");
  assertEquals(normalizeTime("25:00"), null);
  assertEquals(normalizeDate("২০২৬-১১-২২"), "2026-11-22");
  assertEquals(normalizeDate("2026-02-30"), null);
});

Deno.test("Dhaka local time → UTC", () => {
  assertEquals(dhakaToUtc("2026-11-22", "18:30").toISOString(), "2026-11-22T12:30:00.000Z");
});

Deno.test("name clean-up", () => {
  assertEquals(cleanName("আমার নাম  রাকিবুল ইসলাম"), "রাকিবুল ইসলাম");
  assertEquals(cleanName("Nusrat Jahan speaking"), "Nusrat Jahan");
});
