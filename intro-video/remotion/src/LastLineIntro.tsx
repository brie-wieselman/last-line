import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Sequence,
  staticFile,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";

const { fontFamily: SANS } = loadGeist("normal", { weights: ["400", "500", "700", "800"] });
const { fontFamily: MONO } = loadGeistMono("normal", { weights: ["400", "500"] });

// App tokens (dark studio, lavender → soft-orange neon)
const BG = "#0c0d10";
const PANEL = "#15171c";
const LINE = "#2a2d36";
const INK = "#f2f3f5";
const INK3 = "#8b8f9b";
const LAV = "#c4a8ff";
const ORANGE = "#ffb48a";
const GRAD = `linear-gradient(100deg, ${LAV} 0%, #e6aedb 50%, ${ORANGE} 100%)`;
const GLOW = "0 0 40px -6px rgba(196,168,255,.55), 0 0 70px -14px rgba(255,180,138,.45)";

// Scene boundaries in frames (30fps, 36s)
const S = { hook: 0, glass: 120, key: 240, format: 390, topic: 540, voice: 690, stir: 840, end: 990, total: 1080 };

const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const fadeWindow = (f: number, a: number, b: number, edge = 12) =>
  interpolate(f, [a, a + edge, b - edge, b], [0, 1, 1, 0], clamp);

const GradText: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span style={{ background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: "drop-shadow(0 0 22px rgba(196,168,255,.35))", ...style }}>
    {children}
  </span>
);

// ---------------- captions ----------------
const CAPTIONS: [number, number, string][] = [
  [S.glass, S.key, "Here's the recipe for one that doesn't."],
  [S.key, S.format, "1. Add a free Gemini key."],
  [S.format, S.topic, "2. Pick a format."],
  [S.topic, S.voice, "3. Say what it's about."],
  [S.voice, S.stir, "4. Add your voice. Optional."],
  [S.stir, S.end, "Get 3 scripts. Each ends on a line that lands."],
  [S.end, S.total, "Your turn."],
];
const Caption: React.FC = () => {
  const f = useCurrentFrame();
  const c = CAPTIONS.find(([a, b]) => f >= a && f < b);
  if (!c) return null;
  const [a, b, text] = c;
  const o = fadeWindow(f, a, b, 10);
  const y = interpolate(f, [a, a + 14], [18, 0], { ...clamp, easing: ease });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 72, display: "flex", justifyContent: "center", opacity: o, transform: `translateY(${y}px)` }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 58, letterSpacing: "-0.03em", color: INK, background: "rgba(12,13,16,.72)", border: `1px solid ${LINE}`, borderRadius: 20, padding: "18px 34px" }}>
        {text}
      </div>
    </div>
  );
};

// ---------------- scene 1: hook ----------------
const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inA = spring({ frame: f, fps, config: { damping: 200 } });
  const strike = interpolate(f, [34, 58], [0, 100], { ...clamp, easing: ease });
  const second = spring({ frame: f - 60, fps, config: { damping: 18, mass: 0.8 } });
  const out = interpolate(f, [S.glass - 14, S.glass], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 28, opacity: out }}>
      <div style={{ position: "relative", fontFamily: SANS, fontWeight: 800, fontSize: 112, letterSpacing: "-0.05em", textTransform: "uppercase", color: INK, opacity: interpolate(inA, [0, 1], [0, 1]) * interpolate(f, [58, 80], [1, 0.4], clamp), transform: `translateY(${(1 - inA) * 30}px)` }}>
        AI scripts sound like AI.
        <div style={{ position: "absolute", left: 0, top: "52%", height: 12, width: `${strike}%`, background: GRAD, borderRadius: 6, boxShadow: GLOW }} />
      </div>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 124, letterSpacing: "-0.05em", textTransform: "uppercase", opacity: second, transform: `scale(${0.92 + 0.08 * second})` }}>
        <GradText>Keep your voice.</GradText>
      </div>
    </AbsoluteFill>
  );
};

// ---------------- the "glass": script page with measurement ticks ----------------
const GLASS = { x: 330, y: 170, w: 560, h: 700 };

// fill level (0..1) over time
const fillAt = (f: number) =>
  interpolate(
    f,
    [S.key + 40, S.key + 90, S.format + 40, S.format + 90, S.topic + 50, S.topic + 100, S.voice + 40, S.voice + 90, S.stir, S.stir + 30],
    [0, 0.15, 0.15, 0.4, 0.4, 0.65, 0.65, 0.85, 0.85, 1],
    { ...clamp, easing: ease }
  );

const Glass: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = spring({ frame: f - S.glass, fps, config: { damping: 200 }, durationInFrames: 30 });
  const shake = f > S.stir && f < S.stir + 24 ? Math.sin((f - S.stir) * 1.6) * interpolate(f, [S.stir, S.stir + 24], [10, 0]) : 0;
  const out = interpolate(f, [S.stir + 40, S.stir + 58], [1, 0], clamp);
  const fill = fillAt(f);
  const wave = (i: number) => Math.sin(f / 9 + i) * 8;
  const fillH = fill * (GLASS.h - 28);
  return (
    <div style={{ position: "absolute", left: GLASS.x, top: GLASS.y, width: GLASS.w, height: GLASS.h, opacity: draw * out, transform: `translateX(${shake}px) scale(${0.96 + 0.04 * draw})` }}>
      {/* ticks */}
      <div style={{ position: "absolute", left: -78, top: 14, bottom: 14, width: 64 }}>
        {[100, 75, 50, 25, 0].map((p) => (
          <div key={p} style={{ position: "absolute", right: 0, top: `${100 - p}%`, display: "flex", alignItems: "center", gap: 8, transform: "translateY(-50%)" }}>
            <span style={{ fontFamily: MONO, fontSize: 18, color: INK3 }}>{p}%</span>
            <span style={{ width: 14, height: 2, background: LINE }} />
          </div>
        ))}
      </div>
      {/* page */}
      <div style={{ position: "absolute", inset: 0, borderRadius: 28, border: `2px solid ${LINE}`, background: PANEL, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 32, top: 28, fontFamily: MONO, fontSize: 20, letterSpacing: "0.1em", color: INK3 }}>YOUR SCRIPT</div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ position: "absolute", left: 32, top: 84 + i * 44, height: 12, width: `${[70, 88, 60, 80, 52, 74][i]}%`, borderRadius: 6, background: "#1f222a" }} />
        ))}
        {/* liquid */}
        <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, height: fillH, borderRadius: 18, background: GRAD, opacity: 0.92, boxShadow: GLOW }} />
        {fill > 0.01 && (
          <svg width={GLASS.w - 28} height={24} viewBox={`0 0 ${GLASS.w - 28} 24`} style={{ position: "absolute", left: 14, bottom: 14 + fillH - 12 }} aria-hidden="true">
            <path d={`M0 12 Q ${(GLASS.w - 28) * 0.25} ${12 + wave(0)} ${(GLASS.w - 28) * 0.5} 12 T ${GLASS.w - 28} 12 V24 H0 Z`} fill={LAV} opacity={0.9} />
          </svg>
        )}
      </div>
      {/* recipe tag */}
      <div style={{ position: "absolute", left: GLASS.w / 2, top: -64, transform: `translateX(-50%) translateY(${(1 - spring({ frame: f - S.glass - 20, fps, config: { damping: 200 } })) * 20}px)`, opacity: spring({ frame: f - S.glass - 20, fps, config: { damping: 200 } }), fontFamily: MONO, fontSize: 22, letterSpacing: "0.08em", color: INK, background: "#1c1f26", border: `1px solid ${LINE}`, borderRadius: 999, padding: "10px 22px", whiteSpace: "nowrap" }}>
        4 INGREDIENTS · 1 MINUTE
      </div>
    </div>
  );
};

// ---------------- ingredients: drop into the glass, then join the recipe list ----------------
type Ing = { at: number; chip: React.ReactNode; amount: string; name: string };
const KeyIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={BG} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.7 12.3 21 2M16 7l3 3M18 5l2 2" /></svg>
);
const PrintIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={BG} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 11c0 3-1 6-3 8M8 6.5A6 6 0 0 1 18 11c0 2-.3 4-1 6M6 9.5A6 6 0 0 0 6 13c0 2-.5 3.5-1.5 5M12 15c0 2-.6 4-1.6 5.5M15 13c0 3-.5 5-1.5 7" /></svg>
);
const chipStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 16, fontFamily: SANS, fontWeight: 700, fontSize: 36, letterSpacing: "-0.02em", color: BG, background: GRAD, borderRadius: 999, padding: "18px 30px", boxShadow: GLOW, whiteSpace: "nowrap" };

const INGREDIENTS: Ing[] = [
  { at: S.key, name: "Gemini key", amount: "1 free key · 30 sec at AI Studio", chip: <div style={chipStyle}><KeyIcon />Gemini key</div> },
  {
    at: S.format, name: "Format", amount: "1 format · 19 to pick from",
    chip: (
      <div style={{ width: 360, height: 210, borderRadius: 24, background: "#1d2140", border: `2px solid ${LAV}`, boxShadow: GLOW, padding: 26, boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <span style={{ alignSelf: "flex-start", fontFamily: MONO, fontSize: 18, letterSpacing: "0.08em", color: BG, background: GRAD, borderRadius: 8, padding: "5px 12px" }}>POPULAR</span>
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 34, color: INK, letterSpacing: "-0.03em" }}>YouTube explainer</span>
      </div>
    ),
  },
  { at: S.topic, name: "Topic", amount: "1 topic · one sentence", chip: null },
  { at: S.voice, name: "Voice", amount: "optional · your voiceprint", chip: <div style={chipStyle}><PrintIcon />my-voice.md</div> },
];
const TOPIC = "Why most budgeting apps fail by month two";

const Drop: React.FC<{ ing: Ing }> = ({ ing }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = f - ing.at;
  if (local < 0 || local > 110) return null;
  const cx = GLASS.x + GLASS.w / 2;
  if (ing.name === "Topic") {
    const n = Math.floor(interpolate(local, [6, 46], [0, TOPIC.length], clamp));
    const sink = interpolate(local, [56, 96], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
    return (
      <div style={{ position: "absolute", left: cx, top: 360 + sink * 300, transform: `translateX(-50%) scale(${1 - sink * 0.5})`, opacity: 1 - sink, fontFamily: SANS, fontWeight: 500, fontSize: 34, color: INK, background: "#1c1f26", border: `2px solid ${LAV}`, borderRadius: 20, padding: "22px 30px", boxShadow: GLOW, whiteSpace: "nowrap" }}>
        {TOPIC.slice(0, n)}
        <span style={{ opacity: Math.floor(f / 8) % 2 ? 1 : 0, color: LAV }}>|</span>
      </div>
    );
  }
  const fall = spring({ frame: local, fps, config: { damping: 14, mass: 0.9 } });
  const sink = interpolate(local, [46, 86], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const y = interpolate(fall, [0, 1], [-260, 300]) + sink * 330;
  return (
    <div style={{ position: "absolute", left: cx, top: y, transform: `translateX(-50%) rotate(${(1 - fall) * -8}deg) scale(${1 - sink * 0.55})`, opacity: 1 - sink }}>
      {ing.chip}
    </div>
  );
};

const RecipeList: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const listIn = spring({ frame: f - S.key, fps, config: { damping: 200 } });
  const out = interpolate(f, [S.stir + 40, S.stir + 58], [1, 0], clamp);
  return (
    <div style={{ position: "absolute", left: 1040, top: 220, width: 760, opacity: listIn * out, display: "flex", flexDirection: "column", gap: 26 }}>
      <div style={{ fontFamily: MONO, fontSize: 22, letterSpacing: "0.12em", color: INK3 }}>RECIPE</div>
      {INGREDIENTS.map((ing, i) => {
        const s = spring({ frame: f - ing.at - 50, fps, config: { damping: 200 } });
        const active = f >= ing.at && f < (INGREDIENTS[i + 1]?.at ?? S.stir);
        return (
          <div key={ing.name} style={{ display: "flex", alignItems: "center", gap: 24, opacity: 0.25 + 0.75 * s, transform: `translateX(${(1 - s) * 24}px)` }}>
            <div style={{ width: 54, height: 54, borderRadius: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: s > 0.5 ? GRAD : "#1c1f26", border: `1px solid ${LINE}`, boxShadow: active && s > 0.5 ? GLOW : "none" }}>
              {s > 0.5 ? (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={BG} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5 10 17 19 7" /></svg>
              ) : (
                <span style={{ fontFamily: MONO, fontSize: 22, color: INK3 }}>{i + 1}</span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 40, letterSpacing: "-0.03em", color: INK }}>{ing.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 22, color: INK3 }}>{ing.amount}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---------------- scene 7: three finished scripts ----------------
const TAKES = [
  { fam: "CONTRARIAN", title: "The app isn't the problem", last: "A budget you open beats a perfect one you don't." },
  { fam: "PRECISE NUMBER", title: "[YOUR NUMBER] days to quit", last: "You didn't fail the budget. It failed you." },
  { fam: "STORY", title: "The spreadsheet I deleted", last: "Fourteen tabs. Opened twice. That was the lesson." },
];
const Scripts: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const out = interpolate(f, [S.end - 4, S.end + 14], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 120, opacity: out }}>
      <div style={{ display: "flex", gap: 36 }}>
        {TAKES.map((t, i) => {
          const s = spring({ frame: f - S.stir - 50 - i * 6, fps, config: { damping: 16 } });
          const glow = interpolate(f, [S.stir + 90 + i * 8, S.stir + 110 + i * 8], [0, 1], clamp);
          return (
            <div key={t.fam} style={{ width: 520, height: 560, borderRadius: 28, background: PANEL, border: `1px solid ${LINE}`, padding: 34, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 20, opacity: s, transform: `translateY(${(1 - s) * 80}px) scale(${0.9 + 0.1 * s})` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: MONO, fontSize: 18, letterSpacing: "0.08em", color: LAV, background: "#1d2140", padding: "6px 14px", borderRadius: 999 }}>{t.fam}</span>
                <span style={{ fontFamily: MONO, fontSize: 18, color: INK3 }}>TAKE {i + 1}</span>
              </div>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 38, lineHeight: 1.12, letterSpacing: "-0.03em", color: INK }}>{t.title}</div>
              <div style={{ borderLeft: `3px solid ${LAV}`, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 16, letterSpacing: "0.08em", color: INK3 }}>0:00 · HOOK</span>
                <div style={{ height: 12, width: "86%", borderRadius: 6, background: "#232731" }} />
                <div style={{ height: 12, width: "64%", borderRadius: 6, background: "#232731" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 19 }}>
                <div style={{ height: 12, width: "78%", borderRadius: 6, background: "#1f222a" }} />
                <div style={{ height: 12, width: "58%", borderRadius: 6, background: "#1f222a" }} />
              </div>
              <div style={{ marginTop: "auto", borderRadius: 18, padding: "18px 20px", background: "#1d2140", boxShadow: glow > 0 ? `0 0 ${40 * glow}px -6px rgba(196,168,255,${0.6 * glow})` : "none", border: `1px solid ${glow > 0.5 ? LAV : LINE}` }}>
                <div style={{ fontFamily: MONO, fontSize: 16, letterSpacing: "0.08em", marginBottom: 8 }}><GradText>LAST LINE</GradText></div>
                <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 26, lineHeight: 1.3, color: INK }}>{t.last}</div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------------- scene 8: end card ----------------
const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - S.end - 8, fps, config: { damping: 18 } });
  const pulse = 1 + Math.sin((f - S.end) / 6) * 0.025;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 30, paddingBottom: 120, opacity: s }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24, transform: `scale(${0.9 + 0.1 * s})` }}>
        <div style={{ width: 96, height: 96, borderRadius: 26, background: GRAD, boxShadow: GLOW, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12, padding: "0 22px", boxSizing: "border-box" }}>
          <div style={{ height: 9, borderRadius: 5, background: BG, opacity: 0.5 }} />
          <div style={{ height: 9, width: "70%", borderRadius: 5, background: BG, opacity: 0.5 }} />
          <div style={{ height: 12, borderRadius: 6, background: BG }} />
        </div>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 120, letterSpacing: "-0.05em", color: INK }}>
          Last Line<GradText>.</GradText>
        </div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 30, letterSpacing: "0.08em", color: INK3 }}>FREE · YOUR KEY · YOUR VOICE</div>
      <div style={{ marginTop: 10, fontFamily: SANS, fontWeight: 700, fontSize: 40, color: BG, background: GRAD, borderRadius: 999, padding: "22px 48px", boxShadow: GLOW, transform: `scale(${pulse})` }}>
        Write 3 scripts
      </div>
    </AbsoluteFill>
  );
};

// ---------------- voiceover (Brie's ElevenLabs clone, approved script 2026-10-23) ----------------
const VO: [number, string][] = [
  [10, "vo/l1.wav"], [S.glass + 15, "vo/l2.wav"], [S.key + 10, "vo/l3.wav"], [S.format + 10, "vo/l4.wav"],
  [S.topic + 10, "vo/l5.wav"], [S.voice + 10, "vo/l6.wav"], [S.stir + 20, "vo/l7.wav"], [S.end + 15, "vo/l8.wav"],
];
const Voiceover: React.FC = () => (
  <>
    {VO.map(([from, src]) => (
      <Sequence key={src} from={from} layout="none">
        <Audio src={staticFile(src)} />
      </Sequence>
    ))}
  </>
);

// ---------------- root ----------------
export const LastLineIntro: React.FC = () => {
  const f = useCurrentFrame();
  const show = (a: number, b: number) => f >= a && f < b;
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: SANS, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `radial-gradient(1100px 520px at 30% -160px, rgba(196,168,255,.16), transparent 70%), radial-gradient(1100px 520px at 75% -160px, rgba(255,180,138,.12), transparent 70%)` }} />
      {show(S.hook, S.glass) && <Hook />}
      {show(S.glass, S.stir + 60) && <Glass />}
      {show(S.key, S.stir + 60) && <RecipeList />}
      {INGREDIENTS.map((ing) => <Drop key={ing.name} ing={ing} />)}
      {show(S.stir + 40, S.end + 16) && <Scripts />}
      {show(S.end, S.total) && <EndCard />}
      <Caption />
      <Voiceover />
    </AbsoluteFill>
  );
};
