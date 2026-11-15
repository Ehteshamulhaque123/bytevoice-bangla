# Video overview script (≤ 3:00)

Record with Loom or OBS at 1080p, browser full screen, headset mic. Speak English; the live call is in Bangla.
Before recording: make sure `/api/health` shows `voiceConfigured: true`, sign in to the portal in a second tab, and close notifications.

| Time | Screen | What you say |
|---|---|---|
| 0:00–0:20 | Landing page hero, move the mouse; toggle বাংলা ↔ English | "This is ByteVoice Bangla, an AI receptionist for clinics in Bangladesh. The hero is a 3D shapla, the national flower, sitting on a pond. It's also the call's visual: the petals open when the call connects and move with the agent's voice, and ripples appear when the caller speaks. The page works in Bangla and English." |
| 0:20–0:35 | Scroll quickly: how it works, problems, use cases, language section | "Below the hero: how one call becomes one tidy record, the five front-desk problems it solves, who it's for, and how it handles real speech: mixed Bangla and English, spoken numbers, names and relative dates." |
| 0:35–1:50 | Scroll to top → click **বাংলা কলারের সাথে কথা বলুন** → allow mic → live call | Talk naturally, for example: "আসসালামু আলাইকুম। আমার দাঁতে খুব ব্যথা, next Sunday evening এ appointment হবে?" Give your name, give the number the way people say it ("জিরো ওয়ান সেভেন ডাবল ওয়ান…"), **interrupt the agent once**, ask "ব্যথার জন্য কোন ওষুধ খাবো?" (it declines politely), ask something off-topic like "আজকে খেলার স্কোর কত?" (it steers back), confirm the booking, hear the serial number, hang up. |
| 1:50–2:30 | Portal tab → Calls (refresh) → open the new call | "Within seconds the call is in the portal. Here's the date, duration and status. On the call page: summary in Bangla and English, the extracted fields with what was heard next to what was stored. The spoken number was normalised to E.164 and validated as a Bangladeshi mobile. Then the appointment with its serial, the full transcript with speaker labels, timestamps and an English translation, and the tool calls the agent made, with latency." |
| 2:30–2:50 | Data model page | "The data model: calls, patients, transcript turns, extractions, appointments, callbacks and an audit log, in Postgres in Singapore, with row-level security. A database constraint makes double booking impossible, and facts from tools always win over the LLM's reading of the transcript." |
| 2:50–3:00 | Back to the hero | "Gemini Live for real-time Bangla speech, Supabase for data and auth, React and Three.js for the front end. Thanks for watching." |

Tips
- Do one practice call first. Keep the real call under 75 seconds.
- If the agent mishears your name, correct it on camera. Recovery is one of the things being assessed.
