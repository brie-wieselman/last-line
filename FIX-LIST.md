# Fix list: Last Line (public)
Page: http://localhost:4330 · Date: 2026-10-23 · Checked by: five read-only agents + live render at 390px and 1280px

How bad: **High** = people can't finish the task or it fails a hard rule. **Medium** = looks or works badly. **Low** = polish.

## High (6)
| # | Agent | Rule | Where | Problem | Fix |
|---|---|---|---|---|---|
| 1 | 5 + render | 6 | First screen, both sizes | No way to start on the first screen. Topic box is 1123px down on a laptop and the button is 2738px down on a phone. Five tall format cards push the form off-screen | Put a compact topic box + "Write 3 scripts" button in the hero; shrink the format cards to a short row of chips |
| 2 | 3 | 11 | Inputs, ghost buttons, panel borders | Field and button outlines are 1.2:1 against the background, so they're almost invisible | Use a lighter border token (~#6b7080, 3:1) for fields and ghost buttons |
| 3 | 3 | 13 | All inputs | The focus outline is removed and replaced with a faint glow, so keyboard users can't see where they are | Real 2px accent outline on :focus-visible |
| 4 | 5 | 20 | `<head>` | No share image, so a link posted in Skool shows a blank card | Add a 1200×630 og:image (from the intro video's end frame) plus twitter:card, og:url, og:type, canonical |
| 5 | 2 | 10 | Whole stylesheet | 11 different font sizes (11, 13, 14, 15, 17, 21px…) with no scale | Define one type scale (14/16/18/22/28/36) as tokens; map every size to it |
| 6 | 3 | 12 | Colour tokens | Tokens are hex, not OKLCH (Jack's rule) | Convert tokens to OKLCH (no visual change) |

## Medium (12)
| # | Agent | Rule | Where | Problem | Fix |
|---|---|---|---|---|---|
| 7 | 5 | 5 | Tabs, tags, selected card, logo | The gradient fill is on 5 things, so it competes with the main button | Keep the gradient fill for the main button only; others get a gradient outline or tint |
| 8 | 5 | 6 | Hero copy | Doesn't say who it's for | Lede: "For YouTubers and short-form creators…" |
| 9 | 5 | 6 | Default voice + footer | Public visitors see "Brie Wieselman" selected with no explanation | Label it "Example voice: Brie", make Plain the public default |
| 10 | 5 | 19 | Topic, script, voiceprint link | Errors only appear on submit | Validate on blur |
| 11 | 3 | 13 | Text links, tabs | No hover/active/disabled on text-style buttons and tabs | Add the missing states |
| 12 | 3 | 14 | While writing | Loading shows raw scrolling text, no skeleton | Show the skeleton card until the first words arrive, then stream |
| 13 | 3 | 14 | Bad key / rate limit | Error shows by the button, the key field isn't flagged | Focus the key field and mark it invalid on key errors |
| 14 | 4 | 15 | Intro video | Autoplays even when someone has asked for reduced motion | Don't autoplay for reduced-motion users |
| 15 | 4 | 18 | Intro dialog | Focus isn't returned to where you were after closing | Restore focus on close |
| 16 | 1 | 4 | "Add facts…" toggle | 32px tall, below the 44px tap size | Make it 44px |
| 17 | 2 | 9 | Lede and card descriptions | Line height 1.4–1.45 (rule is 1.5); headline 0.98 (rule is 1.0) | Set 1.5 / 1.0 |
| 18 | 2 | 10 | Spacing | Odd gaps (2, 6, 7, 9, 10, 14, 20, 52px) | Snap to 4/8/12/16/24/32/48 |

## Low (polish, 14)
Eyebrow badge wraps to 2 lines on phones · labels under 16px (tags 11px, meta 14px) · `.btn.sm` 15px → 16px · tab gaps 4px → 8px · `.meter` and hook list squeeze at 320px · line length caps at 65ch on result text · status messages rely on colour only (add "Error:" / icon) · wordmark link points at `#` · gradient overrides leave a dead `.btn.primary` block · raw rgba colours → tokens · theme-color and favicon still the old blue · no apple-touch-icon · no JSON-LD (WebApplication, free) · meter/count-up animations over 300ms · smooth-scroll ignores reduced motion in JS · tabs lack Home/End keys · empty state doesn't say what to do next.

## Passed
No sideways scroll at 320–1440 · one h1, correct heading order, skip link · every button works, no dead buttons, no leftover placeholder text · text contrast 4.8–11:1 everywhere · JS 47KB, CSS 21KB, video only loads on open · radio cards keyboard-accessible · dialog labelled.

## Approval
GO: yes   Date: 2026-10-23 · All high, medium and low rows fixed and rechecked at 390px and 1280px.
