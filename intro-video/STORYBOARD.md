# Last Line intro — storyboard (for approval)

**Model:** @Ror_Fly "recipe" explainer (empty glass → finished cocktail, each ingredient + measurement labeled as it pours in).
**Our version:** an empty script page fills up, ingredient by ingredient, until it becomes 3 finished scripts.
**Specs:** 36s · 1920×1080 · 30fps · silent, all meaning in on-screen text · Remotion.
**Look:** app's dark studio: #0c0d10 ground, Geist + Geist Mono, lavender → soft-orange neon gradient (#c4a8ff → #ffb48a), soft glow. Measurement tick marks down the page's left edge, like a measuring glass.

| # | Time | On screen | Caption (big, bottom third) |
|---|------|-----------|-----------------------------|
| 1 | 0–4s | "AI scripts sound like AI." in white. A gradient strike-through wipes across it, then "Keep your voice." glows in. | AI scripts sound like AI. |
| 2 | 4–8s | An empty script page (the "glass") draws in at center: outline only, tick marks 0–100% on its left edge. A recipe tag slides in: "4 ingredients · 1 minute". | Here's the recipe for one that doesn't. |
| 3 | 8–13s | Ingredient 1 drops in from the top: a key chip "Gemini key". The page fills to 15% with a gradient liquid. Measurement label: "1 free key · 30 sec at AI Studio". | 1. Add a free Gemini key. |
| 4 | 13–18s | Ingredient 2: the "YouTube explainer" format card from the app drops in. Fills to 40%. Label: "1 format · 19 to pick from". | 2. Pick a format. |
| 5 | 18–23s | Ingredient 3: the topic types itself into a pill: "Why most budgeting apps fail by month two". Fills to 65%. Label: "1 topic · one sentence". | 3. Say what it's about. |
| 6 | 23–28s | Ingredient 4: a voiceprint chip, "my-voice.md", with a fingerprint line icon. Fills to 85%. Label: "optional · your voiceprint". | 4. Add your voice. Optional. |
| 7 | 28–33s | "Stir": the page shakes once, the liquid resolves into script text, then splits into 3 cards (Take 1/2/3). Each shows HOOK · beats · and a glowing LAST LINE strip. | Get 3 scripts. Each ends on a line that lands. |
| 8 | 33–36s | Cards fade back. Logo mark + "Last Line." Under it: "Free · your key · your voice". A gradient button pulses: "Write 3 scripts". | Your turn. |

## Popup behavior (built after the video)
- Opens on a person's first visit only, centered, video autoplays muted with a Skip button and an "×".
- Closing it saves `ll.introSeen` in their browser, so it never pops again. A small "Watch intro" link in the footer replays it.

## Open choices (defaults in bold)
- Length: **36s** (fits your 30–45s range).
- Example topic: **budgeting apps** (keeps it non-clinical for the public tool).
