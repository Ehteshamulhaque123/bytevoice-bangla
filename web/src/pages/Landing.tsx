import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useLang, type Lang } from "../i18n";
import { CallSession, type CallState } from "../voice/callSession";
import { CallPanel } from "../components/CallPanel";
import { supabase } from "../lib/api";

const LotusScene = lazy(() => import("../components/LotusScene"));

function LangToggle({ dark = false }: { dark?: boolean }) {
  const { lang, setLang } = useLang();
  const opt = (l: Lang, label: string) => (
    <button
      onClick={() => setLang(l)}
      aria-pressed={lang === l}
      className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
        lang === l ? (dark ? "bg-paper text-ink" : "bg-ink text-paper") : dark ? "text-paper/75 hover:text-paper" : "text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className={`flex rounded-full p-0.5 ${dark ? "bg-white/10" : "bg-mist"}`} role="group" aria-label="Language">
      {opt("bn", "বাংলা")}
      {opt("en", "English")}
    </div>
  );
}

function Logo({ light = true }: { light?: boolean }) {
  return (
    <span className={`flex items-center gap-2 ${light ? "text-paper" : "text-ink"}`}>
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      <span className="text-lg font-bold" style={{ fontVariationSettings: '"wdth" 115' }}>ByteVoice <span className="text-shapla">বাংলা</span></span>
    </span>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

// ───────────────────────── Hero ─────────────────────────

function Hero() {
  const { t } = useLang();
  const session = useMemo(() => new CallSession(), []);
  const [state, setState] = useState<CallState | null>(null);
  useEffect(() => session.subscribe(setState) as unknown as () => void, [session]);
  useEffect(() => () => void session.hangup(), [session]);
  const levels = useCallback(() => session.levels(), [session]);

  const phase = state?.phase ?? "idle";
  const inCall = phase !== "idle";
  const panelRef = useRef<HTMLDivElement>(null);
  const start = () => {
    void session.start();
    // On phones the call panel sits below the button: bring it into view.
    if (window.innerWidth < 1024) window.setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
  };

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-pond-deep via-ink to-ink text-paper">
      <header className="relative z-20 mx-auto flex max-w-7xl items-center gap-6 px-5 py-5 md:px-8">
        <Logo />
        <nav className="ml-auto hidden items-center gap-6 text-[15px] text-paper/80 lg:flex" aria-label="Sections">
          <a href="#how" className="hover:text-paper">{t.nav.how}</a>
          <a href="#problems" className="hover:text-paper">{t.nav.problems}</a>
          <a href="#uses" className="hover:text-paper">{t.nav.uses}</a>
          <a href="#language" className="hover:text-paper">{t.nav.language}</a>
          <a href="#contact" className="hover:text-paper">{t.nav.contact}</a>
        </nav>
        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          <LangToggle dark />
          <Link to="/portal" className="hidden rounded-full border border-paper/30 px-4 py-1.5 text-sm hover:bg-white/10 sm:inline-block">
            {t.nav.portal}
          </Link>
        </div>
      </header>

      <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-6 px-5 pb-12 md:px-8 lg:grid-cols-[1.05fr_1fr] lg:pb-20">
        <div className="pt-6 lg:pt-10">
          <h1 className="display max-w-[15ch] text-[clamp(2.5rem,5.6vw,5rem)] text-balance text-paper">{t.hero.title}</h1>
          <p className="prose-bn mt-6 max-w-[56ch] text-lg text-paper/85 md:text-xl">{t.hero.sub}</p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <button
              onClick={start}
              disabled={inCall && phase !== "saved" && phase !== "error"}
              className={`inline-flex items-center gap-3 rounded-full bg-shapla px-7 py-4 text-lg font-semibold text-white shadow-lg shadow-shapla/30 transition hover:brightness-110 disabled:cursor-default disabled:opacity-60 ${
                !inCall ? "ring-pulse" : ""
              }`}
            >
              <MicIcon />
              {t.hero.cta}
            </button>
            <Link to="/portal" className="text-[15px] text-paper/80 underline decoration-paper/30 underline-offset-4 hover:text-paper">
              {t.hero.portalLink}
            </Link>
          </div>
          <p className="mt-3 max-w-[52ch] text-sm text-paper/60">{t.hero.ctaNote}</p>

          <ul className="mt-10 flex flex-wrap gap-x-7 gap-y-2 text-[15px] text-paper/80">
            {t.hero.facts.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-turmeric" aria-hidden />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <div className="pond-mask relative h-[360px] sm:h-[440px] lg:h-[560px]">
            <Suspense fallback={<div className="h-full w-full" />}>
              <LotusScene levels={levels} phase={phase} />
            </Suspense>
          </div>
          <div ref={panelRef} className="relative -mt-16 lg:absolute lg:inset-x-6 lg:bottom-4 lg:mt-0">
            {state && inCall ? (
              <CallPanel
                state={state}
                onHangup={() => void session.hangup()}
                onMute={(m) => session.setMuted(m)}
                onRetry={start}
              />
            ) : (
              <div className="rounded-[22px] bg-ink/70 px-5 py-4 ring-1 ring-white/10 backdrop-blur-md">
                <p className="text-sm text-paper/60">{t.call.tryLabel}</p>
                <ul className="prose-bn mt-1.5 space-y-1 text-[15px] text-paper/90">
                  {t.call.tries.slice(0, 3).map((x) => <li key={x}>“{x}”</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── How it works ─────────────────────────

function RecordPreview() {
  const { t, lang } = useLang();
  const rows: [string, string, string?][] = lang === "bn"
    ? [["রোগী", "নাসরিন আক্তার / Nasrin Akter"], ["মোবাইল", "+8801712345678", "যাচাই করা"], ["কারণ", "দাঁতে ব্যথা (consultation)"], ["সময়", "রবিবার, সন্ধ্যা ৬টা, ডা. ফারহানা রহমান"], ["ফলাফল", "বুক হয়েছে, সিরিয়াল ৪৮২১"]]
    : [["Patient", "নাসরিন আক্তার / Nasrin Akter"], ["Mobile", "+8801712345678", "validated"], ["Reason", "Toothache (consultation)"], ["Slot", "Sunday 6:00 pm, Dr. Farhana Rahman"], ["Outcome", "Booked, serial 4821"]];
  return (
    <div className="rounded-3xl bg-white p-6 shadow-[0_30px_60px_-30px_rgba(18,48,47,0.35)] ring-1 ring-mist md:p-8">
      <p className="text-sm font-semibold text-pond">{t.how.recordTitle}</p>
      <dl className="mt-4 divide-y divide-mist">
        {rows.map(([k, v, ok]) => (
          <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-3 py-2.5 text-[15px]">
            <dt className="text-ink-soft">{k}</dt>
            <dd className="font-medium">
              {v}
              {ok && <span className="ml-2 rounded-full bg-ok/10 px-2 py-0.5 text-xs font-semibold text-ok">✓ {ok}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="prose-bn mt-5 space-y-2 rounded-2xl bg-paper p-4 text-[14px]">
        <p><b className="text-pond">সুমি</b> 00:04 — আসসালামু আলাইকুম, হাসি ডেন্টাল কেয়ার থেকে সুমি বলছি…</p>
        <p><b className="text-shapla">রোগী</b> 00:09 — আমার দাঁতে খুব ব্যথা, রবিবার সন্ধ্যায় হবে?</p>
        <p><b className="text-pond">সুমি</b> 00:14 — জি, রবিবার সন্ধ্যা ৬টায় ডা. ফারহানা রহমানের সিরিয়াল খালি আছে…</p>
      </div>
    </div>
  );
}

function How() {
  const { t } = useLang();
  return (
    <section id="how" className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="display text-[clamp(2rem,4vw,3.2rem)]">{t.how.title}</h2>
          <p className="prose-bn mt-5 max-w-[58ch] text-lg text-ink-soft">{t.how.sub}</p>
          <ol className="mt-10 space-y-8">
            {t.how.steps.map((s, i) => (
              <li key={s.t} className="grid grid-cols-[3rem_1fr] gap-4">
                <span className="display flex h-12 w-12 items-center justify-center rounded-full bg-ink text-xl text-paper">{["১", "২", "৩"][i]}</span>
                <div>
                  <h3 className="text-xl font-semibold">{s.t}</h3>
                  <p className="prose-bn mt-1 text-ink-soft">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <RecordPreview />
      </div>
    </section>
  );
}

// ───────────────────────── Problems ─────────────────────────

function Problems() {
  const { t } = useLang();
  return (
    <section id="problems" className="bg-mist/60">
      <div className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-24">
        <h2 className="display max-w-[22ch] text-[clamp(2rem,4vw,3.2rem)]">{t.problems.title}</h2>
        <ul className="mt-12 divide-y divide-ink/10 border-y border-ink/10">
          {t.problems.items.map((it) => (
            <li key={it.p} className="grid gap-2 py-6 md:grid-cols-2 md:gap-10">
              <p className="condensed text-xl text-ink-soft md:text-2xl">{it.p}</p>
              <p className="prose-bn text-lg font-medium text-ink">{it.s}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ───────────────────────── Use cases ─────────────────────────

function Uses() {
  const { t } = useLang();
  return (
    <section id="uses" className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
      <h2 className="display text-[clamp(2rem,4vw,3.2rem)]">{t.uses.title}</h2>
      <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2">
        {t.uses.items.map((u, i) => (
          <div key={u.t} className={`border-l-4 pl-5 ${["border-shapla", "border-pond", "border-turmeric", "border-ink"][i]}`}>
            <h3 className="display text-2xl md:text-[1.7rem]">{u.t}</h3>
            <p className="prose-bn mt-2 max-w-[48ch] text-lg text-ink-soft">{u.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ───────────────────────── Language ─────────────────────────

function dhakaToday() {
  return new Date(Date.now() + 6 * 3600_000);
}
function relDates(lang: Lang) {
  const d = dhakaToday();
  const dow = d.getUTCDay();
  const nextSun = new Date(d.getTime() + ((7 - dow) % 7 || 7) * 86400_000);
  const dayAfter = new Date(d.getTime() + 2 * 86400_000);
  const fmt = (x: Date) => x.toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return { nextSunday: fmt(nextSun), dayAfter: fmt(dayAfter) };
}

function Language() {
  const { t, lang } = useLang();
  const r = relDates(lang);
  const fill = (s: string) => s.replace("{nextSunday}", r.nextSunday).replace("{dayAfter}", r.dayAfter);
  return (
    <section id="language" className="bg-ink text-paper">
      <div className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
        <h2 className="display max-w-[18ch] text-[clamp(2rem,4vw,3.2rem)]">{t.language.title}</h2>
        <p className="prose-bn mt-5 max-w-[60ch] text-lg text-paper/75">{t.language.sub}</p>
        <div className="mt-12 overflow-hidden rounded-3xl ring-1 ring-white/10">
          <div className="hidden grid-cols-[12rem_1fr_1fr] gap-6 bg-white/5 px-6 py-3 text-sm text-paper/60 md:grid">
            <span />
            <span>{t.language.said}</span>
            <span>{t.language.stored}</span>
          </div>
          {t.language.rows.map((row) => (
            <div key={row.k} className="grid gap-2 border-t border-white/10 px-6 py-5 md:grid-cols-[12rem_1fr_1fr] md:gap-6">
              <span className="text-sm font-semibold text-turmeric">{row.k}</span>
              <span className="prose-bn text-lg">{row.said}</span>
              <span className="prose-bn text-lg text-shapla-soft">
                <span className="mr-2 text-paper/40 md:hidden">→</span>
                {fill(row.stored)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── Contact ─────────────────────────

function Contact() {
  const { t } = useLang();
  const c = t.contact;
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setStatus("sending");
    const { error } = await supabase.from("demo_requests").insert({
      name: String(f.get("name") ?? "").trim(),
      organisation: String(f.get("org") ?? "").trim(),
      phone: String(f.get("phone") ?? "").trim(),
      org_type: String(f.get("type") ?? "dental"),
      message: String(f.get("message") ?? "").trim() || null,
    });
    setStatus(error ? "error" : "sent");
  }

  const field = "w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-[16px] outline-none focus:border-pond";
  return (
    <section id="contact" className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <h2 className="display max-w-[16ch] text-[clamp(2rem,4vw,3.2rem)]">{c.title}</h2>
          <p className="prose-bn mt-5 max-w-[46ch] text-lg text-ink-soft">{c.sub}</p>
        </div>
        {status === "sent" ? (
          <p className="prose-bn self-center rounded-3xl bg-ok/10 p-8 text-xl font-medium text-ok" role="status">{c.sent}</p>
        ) : (
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">{c.name}<input name="name" required minLength={2} maxLength={120} className={field} autoComplete="name" /></label>
            <label className="grid gap-1.5 text-sm font-medium">{c.phone}<input name="phone" required minLength={6} maxLength={30} inputMode="tel" className={field} autoComplete="tel" /></label>
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">{c.org}<input name="org" required minLength={2} maxLength={160} className={field} autoComplete="organization" /></label>
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">{c.type}
              <select name="type" className={field} defaultValue="dental">
                {Object.entries(c.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">{c.message}<textarea name="message" rows={3} maxLength={1000} className={field} /></label>
            <div className="flex items-center gap-4 sm:col-span-2">
              <button disabled={status === "sending"} className="rounded-full bg-ink px-7 py-3.5 font-semibold text-paper hover:bg-pond-deep disabled:opacity-60">{c.submit}</button>
              {status === "error" && <p className="text-sm text-bad" role="alert">{c.error}</p>}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useLang();
  return (
    <footer className="border-t border-ink/10">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-10 text-sm text-ink-soft md:flex-row md:items-center md:px-8">
        <Logo light={false} />
        <p className="md:ml-6">{t.footer.by}. {t.footer.tag}</p>
        <p className="md:ml-auto">{t.footer.demo}</p>
        <a href="https://bytevoice.com.au" className="underline underline-offset-4 hover:text-ink">bytevoice.com.au</a>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <main>
      <Hero />
      <How />
      <Problems />
      <Uses />
      <Language />
      <Contact />
      <Footer />
    </main>
  );
}
