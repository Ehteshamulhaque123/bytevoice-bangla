import { useEffect, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/api";

export const REVIEWER = { email: "reviewer@bytevoice.demo", password: "ByteVoice-Review-2026" };

function Login() {
  const [email, setEmail] = useState(REVIEWER.email);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === "Invalid login credentials" ? "Email or password is incorrect." : error.message);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-ink px-5 text-paper">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 inline-flex items-center gap-1.5 text-sm text-paper/70 hover:text-paper">
          <span aria-hidden="true">←</span> Back to website
        </Link>
        <Link to="/" className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <span className="text-lg font-bold">ByteVoice <span className="text-shapla">বাংলা</span></span>
        </Link>
        <h1 className="display mt-8 text-4xl">Clinic portal</h1>
        <p className="mt-2 text-paper/70">Hashi Dental Care, Dhanmondi</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block text-sm font-medium">Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username"
              className="mt-1.5 w-full rounded-xl bg-white/10 px-4 py-3 text-paper outline-none ring-1 ring-white/15 focus:ring-turmeric" />
          </label>
          <label className="block text-sm font-medium">Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
              className="mt-1.5 w-full rounded-xl bg-white/10 px-4 py-3 text-paper outline-none ring-1 ring-white/15 focus:ring-turmeric" />
          </label>
          {error && <p className="text-sm text-shapla-soft" role="alert">{error}</p>}
          <button disabled={busy} className="w-full rounded-full bg-shapla py-3.5 font-semibold text-white hover:brightness-110 disabled:opacity-60">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="mt-8 rounded-2xl bg-white/5 p-4 text-sm text-paper/75 ring-1 ring-white/10">
          <p className="font-semibold text-paper">Reviewer access</p>
          <p className="mt-1">Email: {REVIEWER.email}<br />Password: {REVIEWER.password}</p>
          <button type="button" onClick={() => { setEmail(REVIEWER.email); setPassword(REVIEWER.password); }}
            className="mt-2 text-turmeric underline underline-offset-4">Fill in reviewer login</button>
        </div>
      </div>
    </main>
  );
}

const NAV = [
  { to: "/portal", label: "Calls", end: true },
  { to: "/portal/appointments", label: "Appointments" },
  { to: "/portal/callbacks", label: "Callbacks" },
  { to: "/portal/data-model", label: "Data model" },
];

export default function PortalLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [staffName, setStaffName] = useState<string>("");
  const [notStaff, setNotStaff] = useState(false);
  const navigate = useNavigate();

  // If the portal was opened directly (link, bookmark, typed URL) there is no site page behind it,
  // so the browser's Back button would leave the site. Slip the homepage in underneath, once,
  // so Back always lands on the website.
  useEffect(() => {
    const st = window.history.state as { idx?: number } | null;
    if ((st?.idx ?? 0) === 0) {
      const here = window.location.pathname + window.location.search + window.location.hash;
      window.history.replaceState({ usr: null, key: "home", idx: 0 }, "", "/");
      window.history.pushState({ usr: null, key: "portal", idx: 1 }, "", here);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase.from("staff").select("full_name, role").eq("user_id", session.user.id).maybeSingle()
      .then(({ data }) => {
        if (data) { setStaffName(`${data.full_name} (${data.role})`); setNotStaff(false); } else setNotStaff(true);
      });
  }, [session]);

  if (session === undefined) return <div className="min-h-screen bg-paper" />;
  if (!session) return <Login />;

  const signOut = async () => { await supabase.auth.signOut(); navigate("/portal"); };

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <span className="font-bold">ByteVoice <span className="text-shapla">বাংলা</span></span>
          </Link>
          <span className="hidden text-sm text-ink-soft md:inline">Hashi Dental Care</span>
          <nav className="order-last flex w-full gap-1 overflow-x-auto md:order-none md:ml-6 md:w-auto" aria-label="Portal">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => `whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium ${isActive ? "bg-ink text-paper" : "text-ink-soft hover:bg-mist"}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-ink-soft sm:inline">{staffName}</span>
            <button onClick={signOut} className="rounded-full border border-ink/15 px-3 py-1.5 hover:bg-mist">Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        {notStaff ? (
          <p className="rounded-2xl bg-warn/10 p-6 text-warn">This account isn't linked to a clinic, so no records are visible. Ask an admin to add you to the staff table.</p>
        ) : <Outlet />}
      </main>
    </div>
  );
}
