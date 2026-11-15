import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../i18n";
import type { CallState } from "../voice/callSession";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function CallPanel({ state, onHangup, onMute, onRetry }: {
  state: CallState;
  onHangup: () => void;
  onMute: (m: boolean) => void;
  onRetry: () => void;
}) {
  const { t } = useLang();
  const c = t.call;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [state.turns]);

  const live = state.phase === "live";
  const statusText = state.phase === "error" ? c.errorTitle
    : live ? (state.activity ? c.activity[state.activity] ?? c.live : state.agentSpeaking ? c.agentSpeaking : c.listening)
    : c[state.phase as "mic" | "connecting" | "ending" | "saved" | "idle"];

  return (
    <div
      className="rounded-[22px] bg-ink/88 text-paper shadow-2xl backdrop-blur-md ring-1 ring-white/10"
      role="region"
      aria-label={c.live}
    >
      {/* Status bar */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            live ? "bg-shapla blink" : state.phase === "error" ? "bg-bad" : state.phase === "saved" ? "bg-ok" : "bg-turmeric blink"
          }`}
          aria-hidden
        />
        <p className="flex-1 text-[15px] font-medium" aria-live="polite">{statusText}</p>
        {(live || state.phase === "ending") && <span className="tabular-nums text-sm text-paper/70">{fmt(state.elapsedS)}</span>}
      </div>

      {/* Live captions */}
      {state.turns.length > 0 && (
        <div ref={scroller} className="thin-scroll max-h-52 space-y-2.5 overflow-y-auto px-5 pb-3" aria-live="polite">
          {state.turns.slice(-8).map((turn) => (
            <div key={turn.seq} className={`flex ${turn.speaker === "caller" ? "justify-end" : ""}`}>
              <p
                className={`prose-bn max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] ${
                  turn.speaker === "caller" ? "bg-paper text-ink rounded-br-md" : "bg-pond/70 rounded-bl-md"
                } ${turn.interrupted ? "opacity-70" : ""}`}
              >
                <span className="mb-0.5 block text-[11px] font-semibold opacity-60">{turn.speaker === "caller" ? c.you : c.agent}</span>
                {turn.text}
                {turn.interrupted && <span aria-hidden> …</span>}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {state.phase === "error" && state.error && (
        <div className="px-5 pb-3">
          <p className="prose-bn rounded-xl bg-bad/20 px-3.5 py-2.5 text-[15px] text-paper" role="alert">{c.errors[state.error]}</p>
        </div>
      )}

      {/* Saved */}
      {state.phase === "saved" && state.finalStatus && (
        <div className="px-5 pb-3">
          <p className="rounded-xl bg-ok/25 px-3.5 py-2.5 text-[15px]">{c.status[state.finalStatus] ?? state.finalStatus}</p>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3">
        {live && (
          <>
            <button
              onClick={() => onMute(!state.muted)}
              className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20"
              aria-pressed={state.muted}
            >
              {state.muted ? c.unmute : c.mute}
            </button>
            <button onClick={onHangup} className="ml-auto rounded-full bg-bad px-5 py-2 text-sm font-semibold hover:brightness-110">
              {c.hangup}
            </button>
          </>
        )}
        {(state.phase === "connecting" || state.phase === "mic") && (
          <button onClick={onHangup} className="ml-auto rounded-full bg-white/10 px-4 py-2 text-sm">{c.hangup}</button>
        )}
        {(state.phase === "saved" || state.phase === "error") && (
          <>
            <button onClick={onRetry} className="rounded-full bg-shapla px-5 py-2 text-sm font-semibold hover:brightness-110">{c.again}</button>
            {state.callId && (
              <Link to={`/portal/calls/${state.callId}`} className="ml-auto text-sm text-paper/80 underline underline-offset-4 hover:text-paper">
                {c.viewRecord}
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
