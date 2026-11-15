// Orchestrates one live Bangla call in the browser:
//   mic permission → /api/session (call row + locked ephemeral token) → Gemini Live WebSocket
//   → audio both ways, transcripts, tool calls proxied to /api/tool → hang-up → /api/finalize.

import type { LiveServerMessage, Session } from "@google/genai";
import { MicCapture, PcmPlayer } from "./audio";
import { api, ApiError, functionsUrl, publishableKey } from "../lib/api";

export type CallPhase = "idle" | "mic" | "connecting" | "live" | "ending" | "saved" | "error";
export type Speaker = "agent" | "caller";
export type Turn = { seq: number; speaker: Speaker; text: string; offsetMs: number; interrupted?: boolean; final?: boolean };
export type CallErrorCode =
  | "mic_denied" | "mic_missing" | "mic_busy" | "insecure" | "unsupported"
  | "voice_unavailable" | "rate_limited" | "network" | "connection_lost" | "unknown";

export type CallState = {
  phase: CallPhase;
  agentSpeaking: boolean;
  callerSpeaking: boolean;
  muted: boolean;
  turns: Turn[];
  elapsedS: number;
  callId: string | null;
  finalStatus: string | null;
  error: CallErrorCode | null;
  activity: string | null; // e.g. "checking availability"
};

type Listener = (s: CallState) => void;

const SILENCE_NUDGE_MS = 9000;
const TOOL_LABEL: Record<string, string> = {
  check_availability: "availability",
  book_appointment: "booking",
  save_caller_details: "saving",
  find_appointments: "lookup",
  reschedule_appointment: "rescheduling",
  cancel_appointment: "cancelling",
  request_callback: "callback",
};

export class CallSession {
  private state: CallState = {
    phase: "idle", agentSpeaking: false, callerSpeaking: false, muted: false, turns: [],
    elapsedS: 0, callId: null, finalStatus: null, error: null, activity: null,
  };
  private listeners = new Set<Listener>();
  private session: Session | null = null;
  private mic: MicCapture | null = null;
  private player: PcmPlayer | null = null;
  private callSecret = "";
  private startedAt = 0;
  private maxCallS = 480;
  private seq = 0;
  private dirty = new Set<number>();
  private timers: number[] = [];
  private lastActivity = Date.now();
  private silenceNudges = 0;
  private hangupAfterSpeech = false;
  private ended = false;
  private setupDone = false;
  private greetSent = false;
  private agentHasSpoken = false;
  private micOpenAt = 0; // until then, hold mic audio so the agent can greet first

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<CallState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  /** Live loudness for the 3D visual: agent voice and caller mic, 0..1. */
  levels() {
    return { agent: this.player?.level() ?? 0, caller: this.mic?.level ?? 0 };
  }

  async start() {
    if (this.state.phase !== "idle" && this.state.phase !== "saved" && this.state.phase !== "error") return;
    Object.assign(this, { seq: 0, ended: false, setupDone: false, silenceNudges: 0, hangupAfterSpeech: false });
    this.dirty.clear();
    this.set({ phase: "mic", turns: [], error: null, finalStatus: null, callId: null, elapsedS: 0, muted: false, activity: null });

    if (!window.isSecureContext) return this.fail("insecure");
    if (!navigator.mediaDevices?.getUserMedia || !("AudioWorkletNode" in window)) return this.fail("unsupported");

    // 1. Microphone first, so a refusal costs nothing server-side.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      return this.fail(name === "NotAllowedError" || name === "SecurityError" ? "mic_denied"
        : name === "NotFoundError" || name === "OverconstrainedError" ? "mic_missing"
        : name === "NotReadableError" ? "mic_busy" : "unknown");
    }

    if (this.ended) { stream.getTracks().forEach((t) => t.stop()); return; } // hung up while the prompt was open
    this.set({ phase: "connecting" });
    // Create the player inside the click's user-gesture window so audio can autoplay.
    this.player = new PcmPlayer();
    await this.player.resume();
    this.player.onDrained = () => {
      this.set({ agentSpeaking: false });
      this.lastActivity = Date.now();
      if (this.hangupAfterSpeech) this.hangup("agent_ended");
    };

    // 2. Ask our backend for a call id + locked, single-use Gemini token.
    let sess: Awaited<ReturnType<typeof api.startSession>>;
    try {
      sess = await api.startSession();
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      const code = e instanceof ApiError ? e.code : "network";
      return this.fail(code === "voice_unavailable" ? "voice_unavailable"
        : code.startsWith("rate_limited") ? "rate_limited" : "network");
    }
    this.callSecret = sess.callSecret;
    this.maxCallS = sess.maxCallSeconds;
    this.set({ callId: sess.callId });
    if (this.ended) {
      stream.getTracks().forEach((t) => t.stop());
      await this.finalize("caller_hangup");
      return;
    }

    // 3. Open the Gemini Live WebSocket with the ephemeral token.
    try {
      // Loaded on demand so the landing page stays light until someone starts a call.
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: sess.token, httpOptions: { apiVersion: "v1alpha" } });
      this.session = await ai.live.connect({
        model: sess.model,
        config: sess.config as never,
        callbacks: {
          onopen: () => {},
          onmessage: (m) => this.onMessage(m),
          onerror: (e) => {
            console.error("live error", e);
            this.reportState("error", String((e as ErrorEvent)?.message ?? "ws error"));
          },
          onclose: (e) => {
            if (!this.ended) {
              console.warn("live closed", e.code, e.reason);
              this.reportState("error", `closed ${e.code} ${e.reason}`);
              this.hangup(this.setupDone ? "error" : "error", this.setupDone ? "connection_lost" : "network", `${e.code} ${e.reason}`);
            }
          },
        },
      });
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      this.reportState("error", String(e));
      await this.finalize("error", String(e));
      return this.fail("network");
    }

    if (this.ended) {
      stream.getTracks().forEach((t) => t.stop());
      try { this.session?.close(); } catch { /* ignore */ }
      return;
    }

    this.maybeGreet();

    // 4. Mic streaming begins now. Audio is held back for a moment so the agent greets first:
    // background noise would otherwise count as the caller speaking and the model would wait.
    this.mic = new MicCapture(stream, (b64) => {
      if (this.setupDone && !this.ended && (this.agentHasSpoken || Date.now() >= this.micOpenAt)) {
        this.session?.sendRealtimeInput({ audio: { data: b64, mimeType: "audio/pcm;rate=16000" } });
      }
    });
    await this.mic.start();
  }

  /** Ask the agent to open the call. Runs once both the socket is ready and setup is complete. */
  private maybeGreet() {
    if (this.greetSent || !this.setupDone || !this.session || this.ended) return;
    this.greetSent = true;
    this.micOpenAt = Date.now() + 4000;
    this.session.sendRealtimeInput({ text: "[call connected]" });
    // Fallback: if no greeting audio within 2.5 s, send it as a completed turn instead.
    window.setTimeout(() => {
      if (this.agentHasSpoken || this.ended || !this.session) return;
      try {
        this.session.sendClientContent({ turns: [{ role: "user", parts: [{ text: "[call connected]" }] }], turnComplete: true });
      } catch (e) { console.warn("greet fallback failed", e); }
    }, 2500);
  }

  private onMessage(m: LiveServerMessage) {
    if (m.setupComplete && !this.setupDone) {
      this.setupDone = true;
      this.startedAt = Date.now();
      this.set({ phase: "live" });
      this.reportState("connected");
      this.maybeGreet();
      this.startTimers();
      return;
    }

    const sc = m.serverContent;
    if (sc) {
      if (sc.interrupted) {
        // Caller barged in: stop speaking immediately and mark the cut-off turn.
        this.player?.flush();
        const last = this.lastTurn("agent");
        if (last && !last.final) this.updateTurn(last.seq, { interrupted: true, final: true });
        this.set({ agentSpeaking: false });
      }
      for (const part of sc.modelTurn?.parts ?? []) {
        const data = part.inlineData?.data;
        if (data) {
          this.agentHasSpoken = true;
          this.player?.play(data, 24000);
          if (!this.state.agentSpeaking) this.set({ agentSpeaking: true, callerSpeaking: false });
        }
      }
      if (sc.inputTranscription?.text) {
        this.lastActivity = Date.now();
        this.silenceNudges = 0;
        this.appendText("caller", sc.inputTranscription.text);
        if (!this.state.callerSpeaking) this.set({ callerSpeaking: true });
      }
      if (sc.outputTranscription?.text) this.appendText("agent", sc.outputTranscription.text);
      if (sc.turnComplete) {
        const last = this.lastTurn("agent");
        if (last) this.updateTurn(last.seq, { final: true });
        this.set({ callerSpeaking: false });
        this.lastActivity = Date.now();
      }
    }

    if (m.toolCall?.functionCalls?.length) void this.handleTools(m.toolCall.functionCalls);
    if (m.goAway) this.session?.sendRealtimeInput({ text: "[connection ending soon: summarise and say goodbye now]" });
  }

  private async handleTools(calls: { id?: string; name?: string; args?: Record<string, unknown> }[]) {
    const responses = await Promise.all(calls.map(async (fc) => {
      const name = fc.name ?? "";
      if (name === "end_call") {
        // Let the goodbye finish playing, then hang up.
        this.hangupAfterSpeech = true;
        if (!this.player?.playing) window.setTimeout(() => this.hangup("agent_ended"), 1200);
        return { id: fc.id, name, response: { ok: true } };
      }
      this.set({ activity: TOOL_LABEL[name] ?? name });
      try {
        const { result } = await api.tool(this.state.callId!, this.callSecret, name, fc.args ?? {});
        return { id: fc.id, name, response: result };
      } catch (e) {
        console.error("tool failed", name, e);
        return { id: fc.id, name, response: { ok: false, error: "network_error", say: "দুঃখিত, সিস্টেমে সংযোগ পাচ্ছি না।" } };
      } finally {
        this.set({ activity: null });
      }
    }));
    if (!this.ended) this.session?.sendToolResponse({ functionResponses: responses });
  }

  // ───────── transcript bookkeeping ─────────

  private lastTurn(speaker?: Speaker) {
    const t = this.state.turns;
    for (let i = t.length - 1; i >= 0; i--) if (!speaker || t[i].speaker === speaker) return t[i];
    return undefined;
  }

  private appendText(speaker: Speaker, chunk: string) {
    const last = this.lastTurn();
    if (last && last.speaker === speaker && !last.final) {
      this.updateTurn(last.seq, { text: joinChunk(last.text, chunk) });
    } else {
      // A new speaker closes the previous turn.
      if (last && !last.final) this.updateTurn(last.seq, { final: true });
      const turn: Turn = { seq: this.seq++, speaker, text: chunk.trim(), offsetMs: Math.max(0, Date.now() - this.startedAt) };
      this.dirty.add(turn.seq);
      this.set({ turns: [...this.state.turns, turn] });
    }
  }

  private updateTurn(seq: number, patch: Partial<Turn>) {
    this.dirty.add(seq);
    this.set({ turns: this.state.turns.map((t) => (t.seq === seq ? { ...t, ...patch } : t)) });
  }

  private async flushTurns() {
    if (!this.dirty.size || !this.state.callId) return;
    const seqs = new Set(this.dirty);
    this.dirty.clear();
    const turns = this.state.turns.filter((t) => seqs.has(t.seq));
    try {
      await api.turns(this.state.callId, this.callSecret, turns);
    } catch {
      seqs.forEach((s) => this.dirty.add(s)); // retry next tick
    }
  }

  // ───────── timers: elapsed, transcript sync, silence, max length ─────────

  private startTimers() {
    this.timers.push(window.setInterval(() => {
      const elapsedS = Math.floor((Date.now() - this.startedAt) / 1000);
      this.set({ elapsedS });
      if (elapsedS === this.maxCallS - 30) {
        this.session?.sendRealtimeInput({ text: "[time almost up: summarise what was agreed and say goodbye]" });
      }
      if (elapsedS >= this.maxCallS) this.hangup("timeout");

      // Silence: nobody has spoken for a while and the agent isn't talking.
      const micLoud = (this.mic?.level ?? 0) > 0.02;
      if (micLoud) this.lastActivity = Date.now();
      const quiet = !this.player?.playing && !this.state.activity && Date.now() - this.lastActivity > SILENCE_NUDGE_MS;
      if (quiet && this.state.turns.length > 0) {
        this.silenceNudges++;
        this.lastActivity = Date.now();
        this.session?.sendRealtimeInput({ text: this.silenceNudges >= 2 ? "[silence-final]" : "[silence]" });
      }
    }, 1000));
    this.timers.push(window.setInterval(() => void this.flushTurns(), 4000));
    window.addEventListener("pagehide", this.onPageHide);
  }

  private onPageHide = () => {
    if (this.ended || !this.state.callId) return;
    // Best effort: the tab is closing mid-call. sendBeacon survives unload.
    navigator.sendBeacon(`${functionsUrl}/finalize?apikey=${publishableKey}`, JSON.stringify({
      callId: this.state.callId, secret: this.callSecret, endReason: "abandoned", turns: this.state.turns,
    }));
    this.ended = true;
  };

  setMuted(muted: boolean) {
    if (this.mic) this.mic.muted = muted;
    this.set({ muted });
  }

  private reportState(state: string, detail?: string) {
    if (this.state.callId) void api.state(this.state.callId, this.callSecret, state, detail).catch(() => {});
  }

  /** End the call (caller pressed hang up, agent ended, timeout or error) and save the record. */
  async hangup(reason: "caller_hangup" | "agent_ended" | "timeout" | "error" = "caller_hangup", error?: CallErrorCode, detail?: string) {
    if (this.ended || this.state.phase === "idle" || this.state.phase === "saved" || this.state.phase === "error") return;
    this.ended = true;
    this.timers.forEach((t) => window.clearInterval(t));
    this.timers = [];
    window.removeEventListener("pagehide", this.onPageHide);
    try { this.session?.close(); } catch { /* ignore */ }
    this.session = null;
    this.mic?.stop();
    this.mic = null;
    // Let a goodbye that is still playing finish naturally, unless the caller hung up.
    if (reason === "caller_hangup" || reason === "error") this.player?.close();
    else window.setTimeout(() => this.player?.close(), 4000);

    const turns = this.state.turns.map((t) => ({ ...t, final: true }));
    this.set({ phase: "ending", agentSpeaking: false, callerSpeaking: false, activity: null, turns });
    if (this.state.callId) await this.finalize(reason, detail);
    else this.set({ phase: "idle" }); // hung up before the call was created
    if (error) this.set({ phase: "error", error });
  }

  private async finalize(reason: string, detail?: string) {
    if (!this.state.callId) return;
    try {
      const out = await api.finalize(this.state.callId, this.callSecret, reason, this.state.turns, detail);
      this.set({ phase: "saved", finalStatus: out.status });
    } catch {
      this.set({ phase: "saved", finalStatus: null });
    }
  }

  private fail(error: CallErrorCode) {
    this.player?.close();
    this.player = null;
    this.set({ phase: "error", error, agentSpeaking: false, callerSpeaking: false });
  }
}

/** Gemini streams transcript fragments with their own leading spaces; join verbatim, collapse doubles. */
function joinChunk(prev: string, chunk: string) {
  return prev ? (prev + chunk).replace(/\s{2,}/g, " ") : chunk.trim();
}
