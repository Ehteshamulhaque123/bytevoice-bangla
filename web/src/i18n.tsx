import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "bn" | "en";

const dict = {
  bn: {
    nav: { how: "কীভাবে কাজ করে", problems: "সমস্যা ও সমাধান", uses: "কাদের জন্য", language: "ভাষা", contact: "ডেমো", portal: "ক্লিনিক পোর্টাল" },
    hero: {
      title: "রোগীর ফোন আর মিস হবে না।",
      sub: "ByteVoice বাংলা আপনার ক্লিনিকের ফোন ধরে স্বাভাবিক বাংলায় কথা বলে: সিরিয়াল দেয়, সময় বদলায়, প্রশ্নের উত্তর দেয়, আর প্রতিটি কলের তথ্য গুছিয়ে রাখে আপনার ফ্রন্ট ডেস্কের জন্য। দিনে-রাতে, ছুটির দিনেও।",
      cta: "বাংলা কলারের সাথে কথা বলুন",
      ctaNote: "মাইক্রোফোন লাগবে। আপনি ফোন করছেন ডেমো ক্লিনিক “হাসি ডেন্টাল কেয়ার”-এ।",
      portalLink: "কলের রেকর্ড পোর্টালে দেখুন",
      facts: ["২৪/৭ উত্তর", "বাংলা + English মিশিয়ে বলা বোঝে", "বুকিংয়ের আগে সব তথ্য মিলিয়ে নেয়"],
    },
    call: {
      idle: "কল শুরু করতে বোতাম চাপুন",
      mic: "মাইক্রোফোনের অনুমতি দিন…",
      connecting: "সংযোগ হচ্ছে…",
      live: "কল চলছে",
      ending: "কল শেষ, রেকর্ড সেভ হচ্ছে…",
      saved: "কল শেষ। রেকর্ড সেভ হয়েছে।",
      errorTitle: "কলটা চালু করা যায়নি",
      agentSpeaking: "সুমি বলছেন",
      listening: "শুনছি…",
      hangup: "কল শেষ করুন",
      mute: "মিউট",
      unmute: "আনমিউট",
      again: "আবার কল করুন",
      viewRecord: "পোর্টালে রেকর্ড দেখুন",
      tryLabel: "বলে দেখতে পারেন",
      tries: [
        "আগামী রবিবার সন্ধ্যায় স্কেলিং করাতে চাই",
        "আমার দাঁতে খুব ব্যথা, কালকে কি ডাক্তার দেখানো যাবে?",
        "আপনাদের চেম্বার কোথায়, শুক্রবার খোলা?",
        "আমার appointment টা reschedule করতে চাই",
      ],
      activity: {
        availability: "খালি সময় দেখছি…", booking: "বুক করছি…", saving: "তথ্য সেভ করছি…", lookup: "অ্যাপয়েন্টমেন্ট খুঁজছি…",
        rescheduling: "সময় বদলাচ্ছি…", cancelling: "বাতিল করছি…", callback: "স্টাফের জন্য নোট রাখছি…",
      } as Record<string, string>,
      status: { booked: "অ্যাপয়েন্টমেন্ট বুক হয়েছে", rescheduled: "সময় বদলানো হয়েছে", cancelled: "বাতিল হয়েছে", enquiry: "তথ্য জানতে চাওয়া কল", follow_up: "স্টাফ ফোন করবেন", incomplete: "অসম্পূর্ণ কল", failed: "কল ব্যর্থ", processing: "কল সেভ হয়েছে, সারাংশ তৈরি হচ্ছে" } as Record<string, string>,
      errors: {
        mic_denied: "মাইক্রোফোনের অনুমতি বন্ধ আছে। ব্রাউজারের ঠিকানার পাশে লক আইকনে ক্লিক করে মাইক্রোফোন “Allow” করুন, তারপর আবার চেষ্টা করুন।",
        mic_missing: "কোনো মাইক্রোফোন পাওয়া যায়নি। হেডসেট বা মাইক লাগিয়ে আবার চেষ্টা করুন।",
        mic_busy: "মাইক্রোফোন অন্য কোনো অ্যাপ ব্যবহার করছে। সেটা বন্ধ করে আবার চেষ্টা করুন।",
        insecure: "নিরাপদ (https) পেজ ছাড়া মাইক্রোফোন চালু হয় না।",
        unsupported: "এই ব্রাউজারে লাইভ ভয়েস চলে না। Chrome, Edge, Safari বা Firefox-এর নতুন ভার্সন ব্যবহার করুন।",
        voice_unavailable: "ভয়েস সার্ভিস এখন বন্ধ আছে। কিছুক্ষণ পর আবার চেষ্টা করুন।",
        rate_limited: "অল্প সময়ে অনেকগুলো কল হয়েছে। কয়েক মিনিট পর আবার চেষ্টা করুন।",
        network: "সার্ভারের সাথে সংযোগ হয়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।",
        connection_lost: "কল মাঝপথে কেটে গেছে। এ পর্যন্ত যা বলা হয়েছে তা সেভ হয়েছে।",
        unknown: "কিছু একটা ঠিকমতো হয়নি। আবার চেষ্টা করুন।",
      } as Record<string, string>,
      you: "আপনি",
      agent: "সুমি",
    },
    how: {
      title: "একটা কল, একটা গোছানো রেকর্ড",
      sub: "রোগী যা বলেন, সুমি তা মিলিয়ে নেয়। কল শেষ হতেই নাম, নম্বর, কারণ, সময় আর ফলাফল আলাদা আলাদা ঘরে পোর্টালে চলে যায়।",
      steps: [
        { t: "রোগী নিজের মতো করে বলেন", d: "বাংলায়, ইংরেজি শব্দ মিশিয়ে, “পরশু বিকালে” বা “ডাবল সাত” বলে। কিছু মুখস্থ করতে হয় না।" },
        { t: "সুমি মিলিয়ে নিয়ে বুক করে", d: "নাম ও নম্বর পড়ে শোনায়, ক্লিনিকের আসল খালি সময় দেখে, সব কনফার্ম হলে তবেই বুক করে।" },
        { t: "রেকর্ড পোর্টালে চলে আসে", d: "পুরো কথোপকথন, ইংরেজি অনুবাদ, যাচাই করা ফোন নম্বর আর অ্যাপয়েন্টমেন্ট এক জায়গায়।" },
      ],
      recordTitle: "পোর্টালে যা জমা হয়",
    },
    problems: {
      title: "ফ্রন্ট ডেস্কের চেনা পাঁচটা সমস্যা",
      items: [
        { p: "রিসেপশন ব্যস্ত, ফোন বেজে বেজে কেটে যায়", s: "প্রতিটি কল সাথে সাথে ধরা হয়, একসাথে অনেকগুলো হলেও।" },
        { p: "রাতে বা শুক্রবারে ফোন করে কেউ পায় না", s: "সুমি ২৪ ঘণ্টা সিরিয়াল নেয়, সকালে স্টাফ তালিকা হাতে পান।" },
        { p: "খাতায় লেখা সিরিয়াল, ডাবল বুকিং", s: "ক্লিনিকের শিডিউল দেখে বুক হয়, একই সময়ে দুজনকে দেওয়া অসম্ভব।" },
        { p: "সারাদিন একই প্রশ্ন: কয়টায় খোলা, ফি কত", s: "চেম্বারের সময়, ঠিকানা, ফি, প্রস্তুতি — ক্লিনিকের দেওয়া তথ্য থেকেই উত্তর।" },
        { p: "ফোনে কী কথা হলো, কোথাও লেখা থাকে না", s: "প্রতিটি কলের ট্রান্সক্রিপ্ট, সারাংশ আর ফলাফল খোঁজা যায়, রিপোর্ট করা যায়।" },
      ],
    },
    uses: {
      title: "কাদের জন্য",
      items: [
        { t: "ডেন্টাল ক্লিনিক", d: "স্কেলিং, ফিলিং, রুট ক্যানাল, ব্রেসেস — সার্ভিস আর ডাক্তার মিলিয়ে সিরিয়াল।" },
        { t: "ডায়াগনস্টিক সেন্টার", d: "টেস্টের সময়, খালি পেটে আসতে হবে কি না, রিপোর্ট কবে — একই উত্তর বারবার।" },
        { t: "হাসপাতালের আউটডোর", d: "বিভাগ আর ডাক্তারের চেম্বার সময় অনুযায়ী সিরিয়াল, জরুরি হলে সাথে সাথে স্টাফকে জানানো।" },
        { t: "রিমাইন্ডার কল", d: "আগের দিন রোগীকে ফোন করে কনফার্ম বা সময় বদল — কম “নো-শো”।" },
      ],
    },
    language: {
      title: "মানুষ যেভাবে আসলে কথা বলে",
      sub: "বাংলাদেশে কেউ ফর্ম পূরণের ভাষায় ফোন করে না। সুমি সেটা বুঝে, আর পোর্টালে রাখে পরিষ্কার, যাচাই করা তথ্য।",
      said: "রোগী বললেন",
      stored: "পোর্টালে জমা হলো",
      rows: [
        { k: "বাংলা-ইংরেজি মিশিয়ে", said: "“next Sunday evening এ scaling এর appointment হবে?”", stored: "সার্ভিস: scaling, {nextSunday}, সন্ধ্যা" },
        { k: "নম্বর বলার ধরন", said: "“শূন্য এক সাত ডাবল এক, দুই তিন চার, পাঁচ ছয় সাত”", stored: "+8801711234567 (যাচাই করা, Grameenphone)" },
        { k: "নাম", said: "“মোঃ রাকিবুল ইসলাম”", stored: "মোঃ রাকিবুল ইসলাম / Md. Rakibul Islam" },
        { k: "আপেক্ষিক সময়", said: "“পরশু বিকাল চারটার দিকে”", stored: "{dayAfter}, ১৬:০০" },
      ],
    },
    contact: {
      title: "আপনার ক্লিনিকে চালু করতে চান?",
      sub: "আপনার চেম্বারের সময়, ডাক্তার আর ফি দিয়ে আমরা একটা ডেমো সাজিয়ে দেব।",
      name: "আপনার নাম", org: "ক্লিনিক / হাসপাতালের নাম", phone: "মোবাইল নম্বর", type: "প্রতিষ্ঠানের ধরন", message: "কিছু জানাতে চাইলে (ঐচ্ছিক)",
      types: { dental: "ডেন্টাল ক্লিনিক", diagnostic: "ডায়াগনস্টিক সেন্টার", hospital: "হাসপাতাল", other: "অন্যান্য" } as Record<string, string>,
      submit: "ডেমোর অনুরোধ পাঠান", sent: "ধন্যবাদ! আমাদের ঢাকা টিম শিগগিরই ফোন করবে।", error: "পাঠানো যায়নি। নম্বরটা দেখে আবার চেষ্টা করুন।",
    },
    footer: { by: "StrategyByte-এর তৈরি", tag: "অস্ট্রেলিয়ার ভয়েস এআই, এখন বাংলাদেশে।", demo: "ডেমো: সব রোগীর তথ্য কাল্পনিক/টেস্ট।" },
  },
  en: {
    nav: { how: "How it works", problems: "Problems solved", uses: "Who it's for", language: "Language", contact: "Demo", portal: "Clinic portal" },
    hero: {
      title: "No patient call goes unanswered.",
      sub: "ByteVoice Bangla answers your clinic's phone in natural Bangla: it books appointments, reschedules, answers questions and files every call neatly for your front desk. Day and night, holidays included.",
      cta: "Talk to our Bangla caller",
      ctaNote: "Uses your microphone. You'll be calling Hashi Dental Care, a demo clinic.",
      portalLink: "See the call records in the portal",
      facts: ["Answers 24/7", "Understands Bangla mixed with English", "Confirms every detail before booking"],
    },
    call: {
      idle: "Press the button to start a call",
      mic: "Allow microphone access…",
      connecting: "Connecting…",
      live: "Call in progress",
      ending: "Call ended, saving the record…",
      saved: "Call ended. Record saved.",
      errorTitle: "The call couldn't start",
      agentSpeaking: "Sumi is speaking",
      listening: "Listening…",
      hangup: "End call",
      mute: "Mute",
      unmute: "Unmute",
      again: "Call again",
      viewRecord: "View the record in the portal",
      tryLabel: "Try saying (in Bangla)",
      tries: [
        "আগামী রবিবার সন্ধ্যায় স্কেলিং করাতে চাই — I'd like scaling next Sunday evening",
        "আমার দাঁতে খুব ব্যথা, কালকে কি ডাক্তার দেখানো যাবে? — toothache, can I see a doctor tomorrow?",
        "আপনাদের চেম্বার কোথায়, শুক্রবার খোলা? — where are you, open on Friday?",
        "আমার appointment টা reschedule করতে চাই — I want to reschedule",
      ],
      activity: {
        availability: "Checking free slots…", booking: "Booking…", saving: "Saving details…", lookup: "Finding appointment…",
        rescheduling: "Rescheduling…", cancelling: "Cancelling…", callback: "Leaving a note for staff…",
      } as Record<string, string>,
      status: { booked: "Appointment booked", rescheduled: "Rescheduled", cancelled: "Cancelled", enquiry: "Enquiry", follow_up: "Staff will call back", incomplete: "Incomplete call", failed: "Call failed", processing: "Call saved, summary on its way" } as Record<string, string>,
      errors: {
        mic_denied: "Microphone access is blocked. Click the lock icon next to the address bar, allow the microphone, then try again.",
        mic_missing: "No microphone found. Plug in a headset or mic and try again.",
        mic_busy: "Another app is using your microphone. Close it and try again.",
        insecure: "The microphone only works on a secure (https) page.",
        unsupported: "This browser can't run live voice. Use a recent Chrome, Edge, Safari or Firefox.",
        voice_unavailable: "The voice service is offline right now. Please try again shortly.",
        rate_limited: "Too many calls in a short time. Try again in a few minutes.",
        network: "Couldn't reach the server. Check your connection and try again.",
        connection_lost: "The call dropped. Everything said so far has been saved.",
        unknown: "Something went wrong. Please try again.",
      } as Record<string, string>,
      you: "You",
      agent: "Sumi",
    },
    how: {
      title: "One call, one tidy record",
      sub: "Sumi checks what the patient says as they say it. The moment the call ends, name, number, reason, time and outcome land in the portal, each in its own field.",
      steps: [
        { t: "The patient talks the way they talk", d: "In Bangla, with English words mixed in, saying “day after tomorrow afternoon” or “double seven”. Nothing to memorise." },
        { t: "Sumi confirms, then books", d: "Reads the name and number back, checks the clinic's real free slots, and books only after a clear yes." },
        { t: "The record lands in the portal", d: "Full conversation, English translation, a validated phone number and the appointment, all in one place." },
      ],
      recordTitle: "What the portal stores",
    },
    problems: {
      title: "Five front-desk problems every clinic knows",
      items: [
        { p: "Reception is busy, the phone rings out", s: "Every call is picked up instantly, even several at once." },
        { p: "Nobody answers at night or on Friday", s: "Sumi takes bookings around the clock; staff get the list in the morning." },
        { p: "Serials in a notebook, double bookings", s: "Bookings follow the clinic's schedule, so one slot can never go to two people." },
        { p: "The same questions all day: hours, fees", s: "Chamber hours, address, fees and preparation, answered from the clinic's own information." },
        { p: "Nothing said on the phone is written down", s: "Every call has a searchable transcript, summary and outcome you can report on." },
      ],
    },
    uses: {
      title: "Who it's for",
      items: [
        { t: "Dental clinics", d: "Scaling, fillings, root canals, braces: serials matched to the right service and doctor." },
        { t: "Diagnostic centres", d: "Test timings, fasting instructions, report dates: the same answers, every time." },
        { t: "Hospital outpatients", d: "Serials by department and chamber hours, with urgent cases flagged to staff immediately." },
        { t: "Reminder calls", d: "Calls patients the day before to confirm or move their slot, so fewer no-shows." },
      ],
    },
    language: {
      title: "The way people really speak",
      sub: "Nobody in Bangladesh phones a clinic in form-filling language. Sumi understands that, and stores clean, validated data in the portal.",
      said: "Patient said",
      stored: "Stored in the portal",
      rows: [
        { k: "Bangla mixed with English", said: "“next Sunday evening এ scaling এর appointment হবে?”", stored: "Service: scaling, {nextSunday}, evening" },
        { k: "How numbers are said", said: "“zero one seven double one, two three four, five six seven”", stored: "+8801711234567 (validated, Grameenphone)" },
        { k: "Names", said: "“মোঃ রাকিবুল ইসলাম”", stored: "মোঃ রাকিবুল ইসলাম / Md. Rakibul Islam" },
        { k: "Relative dates", said: "“পরশু বিকাল চারটার দিকে” (day after tomorrow, around 4pm)", stored: "{dayAfter}, 16:00" },
      ],
    },
    contact: {
      title: "Want this for your clinic?",
      sub: "Send us your chamber hours, doctors and fees and we'll set up a demo for you.",
      name: "Your name", org: "Clinic / hospital name", phone: "Mobile number", type: "Type of organisation", message: "Anything else (optional)",
      types: { dental: "Dental clinic", diagnostic: "Diagnostic centre", hospital: "Hospital", other: "Other" } as Record<string, string>,
      submit: "Request a demo", sent: "Thank you! Our Dhaka team will call you soon.", error: "Couldn't send. Check the number and try again.",
    },
    footer: { by: "Built by StrategyByte", tag: "Australian voice AI, now in Bangladesh.", demo: "Demo: all patient data is fictional test data." },
  },
};

export type Dict = (typeof dict)["bn"];

const Ctx = createContext<{ lang: Lang; t: Dict; setLang: (l: Lang) => void }>({ lang: "bn", t: dict.bn, setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem("bv-lang");
      if (saved === "bn" || saved === "en") return saved;
    } catch { /* storage unavailable */ }
    return "bn";
  });
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem("bv-lang", lang); } catch { /* ignore */ }
  }, [lang]);
  return <Ctx.Provider value={{ lang, t: dict[lang] as Dict, setLang }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);
