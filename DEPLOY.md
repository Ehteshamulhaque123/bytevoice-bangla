# Deploy guide (about 15 minutes)

The database and backend are **already live** on Supabase project `bytevoice-bangla` (ref `wpzyihompqxnrjuxiovh`, Singapore).
What's left: add the Gemini key, put the code on GitHub, and host the website on Vercel.

## 1. Add the Gemini API key (2 min)

1. Get a free key at https://aistudio.google.com/apikey.
2. Supabase dashboard → project **bytevoice-bangla** → **Edge Functions** → **Secrets** → add:
   - `GEMINI_API_KEY` = your key
3. Check it: open https://wpzyihompqxnrjuxiovh.supabase.co/functions/v1/api/health
   You should see `"voiceConfigured": true`.

Optional secrets (only if needed):

| Secret | Default | When to change |
|---|---|---|
| `GEMINI_LIVE_MODEL` | `gemini-3.8-live` | If your key can't use it, try `gemini-3.1-flash-live-preview` |
| `GEMINI_VOICE` | `Sulafat` (warm female) | e.g. `Aoede`, `Leda`, `Kore` |
| `GEMINI_TEXT_MODEL` | `gemini-3.8-flash` | Post-call extraction model |
| `ALLOWED_ORIGINS` | `*` | Set to your Vercel URL after step 3, e.g. `https://bytevoice-bangla.vercel.app` |
| `MAX_CALL_SECONDS` | `480` | Maximum call length |

Secrets take effect on the next call. No redeploy needed.

## 2. Push the code to GitHub (3 min)

```bash
unzip bytevoice-bangla.zip && cd bytevoice-bangla
git init && git add . && git commit -m "ByteVoice Bangla: landing, Bangla caller, portal"
# create an empty repo on github.com named bytevoice-bangla (public, or private + invite the reviewers), then:
git remote add origin https://github.com/<you>/bytevoice-bangla.git
git branch -M main && git push -u origin main
```

## 3. Host the website on Vercel (5 min)

1. https://vercel.com/new → **Import** your `bytevoice-bangla` repo.
2. **Root Directory**: `web`. Framework preset: **Vite** (auto-detected). Build command `npm run build`, output `dist`.
3. **Environment Variables** (both are public values and safe in a browser):
   - `VITE_SUPABASE_URL` = `https://wpzyihompqxnrjuxiovh.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_4QL-KCtdFndosU5fjUBk8Q_cwCinUdQ`
4. Click **Deploy**. `web/vercel.json` already handles `/portal` routes and allows the microphone.

(Netlify works too: base directory `web`, build `npm run build`, publish `web/dist`, same two env vars. `web/public/_redirects` is included.)

## 4. Lock down and test (5 min)

1. Supabase → Edge Functions → Secrets: set `ALLOWED_ORIGINS` to your Vercel URL.
2. Supabase → **Authentication → Sign In / Providers → Email**: turn off **Allow new users to sign up**. Only the reviewer account can log in. Row Level Security already hides data from non-staff, so this is extra protection.
3. Open your site → **বাংলা কলারের সাথে কথা বলুন** → allow the microphone → book an appointment in Bangla → hang up.
4. Open `/portal` → sign in as `reviewer@bytevoice.demo` / `ByteVoice-Review-2026`. Your call appears at the top within a few seconds, with transcript, English translation, extracted fields and the appointment.
5. Make 3–4 real test calls of different kinds (booking, enquiry, a medical question, an off-topic question) so the portal has your own calls next to the scripted ones.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "ভয়েস সার্ভিস এখন বন্ধ আছে" (voice unavailable) | Key missing or the model isn't available for your key. Check `/api/health`, then try another `GEMINI_LIVE_MODEL`. Supabase → Edge Functions → `api` → **Logs** shows the exact error. |
| "সার্ভারের সাথে সংযোগ হয়নি" (couldn't reach server) | `ALLOWED_ORIGINS` doesn't match your site URL (include `https://`, no trailing slash). |
| Microphone blocked | Site must be https. Click the lock icon → allow the microphone. |
| Call connects but stays silent | Click anywhere on the page once (browser autoplay rules), check speaker volume, or try Chrome. |
| Portal says "account isn't linked to a clinic" | You signed in with a different user. Use the reviewer account. |
