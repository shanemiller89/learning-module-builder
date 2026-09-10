#!/usr/bin/env node
/**
 * verify-module.mjs — generic contract verifier for learning modules.
 *
 * Enforces the paged-navigation, progress-tracking and colour-independence
 * contracts mechanically, so they cannot be skipped or re-derived loosely by
 * hand. Run it as-is — do NOT rewrite a bespoke smoke test instead of this.
 * Add module-specific assertions (demo counts, glossary counts, chart
 * behaviour) in a separate script on top; references/verification.md §5–§8
 * says what those must cover.
 *
 * Usage:   mkdir -p /tmp/lmb && cd /tmp/lmb && npm i jsdom     (once)
 *          cd /tmp/lmb && node <skill-path>/scripts/verify-module.mjs /abs/path/module.html
 *
 *          node verify-module.mjs --palette "#F6E3A5,#74C8F0,#2F8E86" [--bg "#0e0f13"]
 *              Standalone palette gate — no jsdom, no module needed. Run this in
 *              Phase 1 while choosing the theme, so a colliding palette costs a
 *              minute instead of a rebuild. references/palette.md explains the gate.
 *
 * jsdom is resolved from process.cwd() first, then from next to this script,
 * because the skill directory is usually a read-only cache with no node_modules.
 * Copying this file to a writable directory and running it there is fine.
 * EDITING it so a failing module passes is not.
 *
 * Exits 0 on pass; exits 1 and lists failures otherwise.
 *
 * Relies on the blueprint's frozen mechanical contract:
 *   body.paged / section.leg[id] / .current / .qitem[data-answer] / .qopt / .qwhy
 *   table.fixtable            — the reference half (blueprint §15b)
 *   --cat-<key> / .sigil      — category accents + their glyphs (blueprint §24)
 * Theme all visible copy freely — never rename these hooks.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";



/* ============================================================================
 * Colour-independence gate (blueprint §24, references/palette.md)
 *
 * Categories in these modules are colour-coded, and colour-coding fails two
 * ways: the palette collides for a colour-blind reader, or colour is the only
 * channel carrying the category. Roughly 1 in 12 men has a colour-vision
 * deficiency, so on any real audience this is not an edge case — it shipped
 * once as two indistinguishable rails on a roadmap page, reported by a reader,
 * which is the expensive way to find out.
 *
 * Simulation: Machado, Oliveira & Fernandes (2009) severity-1.0 matrices,
 * applied to linear sRGB. Distance: CIEDE2000 (verified against the Sharma,
 * Wu & Dalal reference pairs). Contrast: WCAG relative luminance.
 * ========================================================================== */
const DE_FLOOR = 15;     // min CIEDE2000 between any two category accents, under any observer
const CONTRAST_FLOOR = 3; // WCAG 1.4.11 non-text contrast, category accent vs --bg
const OBSERVERS = ["normal", "deuteranopia", "protanopia", "tritanopia"];

const clamp01 = v => Math.min(1, Math.max(0, v));
const toLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055);

function oklabToSrgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ].map(v => clamp01(toGamma(v)));
}

/** hex / rgb() / hsl() / oklch() -> [r,g,b] in 0..1, or null if unparseable. */
function parseColor(str) {
  const s = String(str).trim().toLowerCase();
  let m;
  if ((m = s.match(/^#([0-9a-f]{3,8})$/))) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map(c => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  if ((m = s.match(/^rgba?\(([^)]+)\)$/))) {
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).slice(0, 3)
      .map(v => (v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v) / 255));
    return p.length === 3 && p.every(Number.isFinite) ? p.map(clamp01) : null;
  }
  if ((m = s.match(/^hsla?\(([^)]+)\)$/))) {
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).slice(0, 3);
    const h = parseFloat(p[0]) / 360, sat = parseFloat(p[1]) / 100, l = parseFloat(p[2]) / 100;
    if (![h, sat, l].every(Number.isFinite)) return null;
    const f = n => { const k = (n + h * 12) % 12, a = sat * Math.min(l, 1 - l);
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [f(0), f(8), f(4)].map(clamp01);
  }
  if ((m = s.match(/^oklch\(([^)]+)\)$/))) {
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).slice(0, 3);
    const L = p[0].endsWith("%") ? parseFloat(p[0]) / 100 : parseFloat(p[0]);
    const C = parseFloat(p[1]), H = parseFloat(p[2]) * Math.PI / 180;
    if (![L, C, H].every(Number.isFinite)) return null;
    return oklabToSrgb(L, C * Math.cos(H), C * Math.sin(H));
  }
  return null;
}

/** Alpha of a colour string, 1 when absent. A translucent accent is not the colour
 *  the reader sees — it is that colour composited over the page, so the gate
 *  composites before judging rather than silently grading the opaque version. */
function alphaOf(str) {
  const s = String(str).trim().toLowerCase();
  let m;
  if ((m = s.match(/^#([0-9a-f]{3,8})$/))) {
    let h = m[1];
    if (h.length === 4) h = h.split("").map(c => c + c).join("");
    return h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  }
  if ((m = s.match(/^(?:rgba?|hsla?)\(([^)]+)\)$/))) {
    const p = m[1].split(/[\s,\/]+/).filter(Boolean);
    if (p.length < 4) return 1;
    const a = p[3].endsWith("%") ? parseFloat(p[3]) / 100 : parseFloat(p[3]);
    return Number.isFinite(a) ? clamp01(a) : 1;
  }
  if ((m = s.match(/^oklch\(([^)]+)\)$/)) && m[1].includes("/")) {
    const t = m[1].split("/")[1].trim();
    const a = t.endsWith("%") ? parseFloat(t) / 100 : parseFloat(t);
    return Number.isFinite(a) ? clamp01(a) : 1;
  }
  return 1;
}

const over = (fg, bg, a) => (a >= 1 || !bg ? fg : fg.map((c, i) => c * a + bg[i] * (1 - a)));

const CVD = {
  protanopia:   [[ 0.152286,  1.052583, -0.204868],
                 [ 0.114503,  0.786281,  0.099216],
                 [-0.003882, -0.048116,  1.051998]],
  deuteranopia: [[ 0.367322,  0.860646, -0.227968],
                 [ 0.280085,  0.672501,  0.047413],
                 [-0.011820,  0.042940,  0.968881]],
  tritanopia:   [[ 1.255528, -0.076749, -0.178779],
                 [-0.078411,  0.930809,  0.147602],
                 [ 0.004733,  0.691367,  0.303900]],
};

function simulate(rgb, kind) {
  if (!kind || kind === "normal") return rgb;
  const M = CVD[kind], [r, g, b] = rgb.map(toLinear);
  return M.map(row => clamp01(toGamma(row[0] * r + row[1] * g + row[2] * b)));
}

function toLab(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  let X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  let Y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b);
  let Z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  [X, Y, Z] = [f(X), f(Y), f(Z)];
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

function deltaE(lab1, lab2) {
  const [L1, a1, b1] = lab1, [L2, a2, b2] = lab2;
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const Cbar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hue = (x, y) => { if (x === 0 && y === 0) return 0; const d = Math.atan2(y, x) * deg; return d < 0 ? d + 360 : d; };
  const h1p = hue(a1p, b1), h2p = hue(a2p, b2);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (Math.abs(dhp) > 180) dhp += dhp > 180 ? -360 : 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * rad / 2);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp;
  if (C1p * C2p === 0) hbp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
  else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad)
              + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.20 * Math.cos((4 * hbp - 63) * rad);
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * (30 * Math.exp(-(((hbp - 275) / 25) ** 2))) * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

const relLum = rgb => { const [r, g, b] = rgb.map(toLinear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrastRatio = (c1, c2) => {
  const a = relLum(c1), b = relLum(c2);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

/**
 * The gate. `cats` is {name: cssColorString}; `bgStr` is the page background.
 * Returns {problems, warnings, worst, rows} — `problems` is empty on a pass.
 *
 * Values the gate cannot read produce a WARNING, not a failure. A colour it
 * can't parse is not evidence of a collision, and a hard fail on an
 * unrecognised-but-valid CSS value would block a module that is perfectly fine —
 * the expensive error for a blocking check. (Wholesale evasion is still caught:
 * a full module must declare at least two accents the gate can actually read.)
 */
function gatePalette(cats, bgStr) {
  const problems = [], warnings = [], rows = [];
  const bg = bgStr ? parseColor(bgStr) : null;
  if (bgStr && !bg) warnings.push(`could not read --bg ("${bgStr}") — contrast against the page ground was not checked`);
  else if (!bgStr) warnings.push("no --bg found — contrast against the page ground was not checked");

  const rgb = {};
  for (const n of Object.keys(cats)) {
    const c = parseColor(cats[n]);
    if (!c) {
      warnings.push(`--cat-${n}: could not read "${cats[n]}" — the gate reads hex, rgb(), hsl() and oklch(); this accent was skipped, so check it by eye or pass it to --palette directly`);
      continue;
    }
    rgb[n] = over(c, bg, alphaOf(cats[n]));
  }
  const ok = Object.keys(rgb);

  if (bg) for (const n of ok) {
    const cr = contrastRatio(rgb[n], bg);
    if (cr < CONTRAST_FLOOR)
      problems.push(`--cat-${n} contrast vs --bg is ${cr.toFixed(2)}:1 (needs ${CONTRAST_FLOOR}:1, WCAG 1.4.11) — this accent is too close to the background to read as an indicator`);
  }

  let worst = null;
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
    const A = rgb[ok[i]], B = rgb[ok[j]];
    let lo = Infinity, loObs = "";
    for (const o of OBSERVERS) {
      const d = deltaE(toLab(simulate(A, o)), toLab(simulate(B, o)));
      if (d < lo) { lo = d; loObs = o; }
    }
    rows.push({ a: ok[i], b: ok[j], dE: lo, observer: loObs });
    if (!worst || lo < worst.dE) worst = rows[rows.length - 1];
    if (lo < DE_FLOOR)
      problems.push(
        `--cat-${ok[i]} (${cats[ok[i]]}) and --cat-${ok[j]} (${cats[ok[j]]}) are \u0394E00 ${lo.toFixed(1)} apart ` +
        `under ${loObs} (floor ${DE_FLOOR}) — a reader with ${loObs} sees one colour where the module means two. ` +
        `Fix by pulling them apart in LIGHTNESS, not hue: after simulation the hue circle collapses toward a ` +
        `blue-yellow axis, so lightness is the channel that survives. references/palette.md has validated anchors.`);
  }
  return { problems, warnings, worst, rows, readableKeys: ok };
}

/* ---------- standalone palette mode: no module, no jsdom (Phase 1 pre-check) ---------- */
{
  const argv = process.argv.slice(2);
  const pi = argv.indexOf("--palette");
  if (pi !== -1) {
    const list = (argv[pi + 1] || "").split(/[,\s]+/).filter(Boolean);
    const bi = argv.indexOf("--bg");
    const bg = bi !== -1 ? argv[bi + 1] : "#0e0f13";
    if (list.length < 2) {
      console.error('usage: node verify-module.mjs --palette "#aabbcc,#ddeeff,…" [--bg "#0e0f13"]');
      process.exit(1);
    }
    const cats = Object.fromEntries(list.map((c, i) => [String(i + 1), c]));
    const { problems, warnings, rows } = gatePalette(cats, bg);
    rows.sort((x, y) => x.dE - y.dE);
    console.log(`palette gate — ${list.length} accents on ${bg}  (floor ΔE00 ${DE_FLOOR}, contrast ${CONTRAST_FLOOR}:1)`);
    for (const r of rows)
      console.log(`  ${r.dE >= DE_FLOOR ? "ok  " : "FAIL"}  ΔE00 ${r.dE.toFixed(1).padStart(5)}  ${cats[r.a]} vs ${cats[r.b]}  (worst under ${r.observer})`);
    for (const w of warnings) console.log("  note: " + w.replace(/^--cat-(\d+)/, "accent $1"));
    if (problems.length) {
      console.error(`\nFAIL — ${problems.length} problem(s):`);
      for (const p of problems) console.error("  ✗ " + p.replace(/--cat-(\d+)/g, "accent $1"));
      process.exit(1);
    }
    if (!rows.length) {
      console.error("\nNothing to compare — fewer than two of those values are colours the gate can read (hex, rgb(), hsl(), oklch()).");
      process.exit(1);
    }
    console.log(`\nPASS — every pair separates by at least ΔE00 ${rows[0].dE.toFixed(1)} for normal, deuteranope, protanope and tritanope readers.`);
    process.exit(0);
  }
}

/* ---------- resolve jsdom from the CWD, then from beside this script ---------- */
let JSDOM;
{
  const tries = [];
  try {
    JSDOM = createRequire(path.join(process.cwd(), "package.json"))("jsdom").JSDOM;
  } catch (e) { tries.push(`cwd (${process.cwd()}): ${e.code || e.message}`); }
  if (!JSDOM) {
    try { JSDOM = (await import("jsdom")).JSDOM; }
    catch (e) { tries.push(`script dir: ${e.code || e.message}`); }
  }
  if (!JSDOM) {
    console.error(
      "jsdom not found.\n  " + tries.join("\n  ") +
      "\n\nFix:\n  mkdir -p /tmp/lmb && cd /tmp/lmb && npm i jsdom" +
      "\n  cd /tmp/lmb && node " + (process.argv[1] || "<this script>") + " /abs/path/module.html" +
      "\n\n(The skill directory is typically read-only. Run this from the directory where" +
      "\n jsdom is installed, or copy this file there and run the copy — copying is not editing.)"
    );
    process.exit(1);
  }
}

const file = process.argv[2];
if (!file) { console.error("usage: node verify-module.mjs <module.html>"); process.exit(1); }
const html = fs.readFileSync(file, "utf8");
const fails = [];
const ok = (cond, name, detail = "") => { if (!cond) fails.push(name + (detail ? ` — ${detail}` : "")); };
const tick = () => new Promise(r => setTimeout(r, 40));

/* ---------- static layer ---------- */
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim());
ok(scripts.length >= 1, "inline <script> present (a '// placeholder' script = unfinished build)");
const js = scripts.join("\n");
const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join("\n");
ok(css.length > 500, "inline <style> present");

// accessibility: anything that animates needs a reduced-motion fallback (blueprint §1)
ok(/@media[^{]*prefers-reduced-motion/.test(css),
  "CSS has an @media (prefers-reduced-motion: reduce) block — the hero and demos must fall back to a static end state");

/* ---------- colour-independence: the palette gate (blueprint §24) ----------
   Category accents are declared as --cat-<key> so this check can find them.
   Only the first declaration of each name is read (the :root block); theme
   overrides further down are the author's business. */
/* Read the palette out of the ground-state CSS only. Comments are stripped (a
   commented-out accent is not a live category — and it is exactly what an author
   writes right after the gate reports a collision), and @-blocks are removed
   brace-matched, because blueprint §23 requires a print stylesheet that inverts
   to a light scheme and that override is not the module's ground. */
function stripAtBlocks(str) {
  let out = "", i = 0;
  while (i < str.length) {
    const at = str.indexOf("@", i);
    if (at === -1) { out += str.slice(i); break; }
    out += str.slice(i, at);
    const brace = str.indexOf("{", at), semi = str.indexOf(";", at);
    if (brace === -1 || (semi !== -1 && semi < brace)) { i = semi === -1 ? str.length : semi + 1; continue; }
    let depth = 0, j = brace;
    for (; j < str.length; j++) {
      if (str[j] === "{") depth++;
      else if (str[j] === "}" && --depth === 0) { j++; break; }
    }
    i = j;
  }
  return out;
}
const cssScan = stripAtBlocks(css.replace(/\/\*[\s\S]*?\*\//g, " "));
const rootBlock = (cssScan.match(/:root[^{]*\{([^}]*)\}/) || [])[1] || "";
const declSource = (rootBlock.match(/--cat-/gi) || []).length >= 2 ? rootBlock : cssScan;

/* every custom property in scope, so a `--cat-x: var(--brand-y)` alias resolves */
const allVars = {};
for (const m of declSource.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)(?=[;}]|$)/g))
  if (!(m[1] in allVars)) allVars[m[1]] = m[2].replace(/!important/gi, "").trim();

const deref = (v, depth = 0) => {
  const m = String(v).trim().match(/^var\(\s*(--[\w-]+)\s*(?:,([\s\S]+))?\)$/);
  if (!m || depth > 4) return String(v).trim();
  if (allVars[m[1]] != null) return deref(allVars[m[1]], depth + 1);
  return m[2] ? deref(m[2].trim(), depth + 1) : String(v).trim();
};

const catVars = {};
for (const [name, raw] of Object.entries(allVars)) {
  const m = name.match(/^--cat-([a-z0-9][\w-]*)$/i);
  if (m) catVars[m[1].toLowerCase()] = deref(raw);
}
const bgVar = allVars["--bg"] ? deref(allVars["--bg"]) : null;
const catKeys = Object.keys(catVars);
let catsReadable = [];
if (catKeys.length >= 2) {
  const { problems, warnings, worst, readableKeys } = gatePalette(catVars, bgVar);
  catsReadable = readableKeys;
  for (const p of problems) fails.push("palette gate: " + p);
  for (const w of warnings) console.log("  note: palette gate — " + w);
  if (!problems.length && worst) globalThis.__paletteWorst = worst;
}

/* Colour is never the ONLY channel (blueprint §24): every declared category needs a
   hue-independent glyph. Checked wherever categories are declared, not just on full
   modules — a two-category quick explainer has the same reader. */
const sigilCheck = doc => {
  if (catsReadable.length < 2) return;
  const sigils = [...doc.querySelectorAll(".sigil")];
  ok(sigils.length >= 1, "category sigils present (.sigil) — blueprint §24: colour alone never identifies a category");
  const covered = new Set(sigils.map(e => (e.dataset.cat || "").toLowerCase()).filter(Boolean));
  const missing = catsReadable.filter(k => !covered.has(k));
  ok(missing.length === 0,
    'every --cat-<key> has at least one <… class="sigil" data-cat="<key>"> — blueprint §24',
    missing.length ? `no sigil for: ${missing.join(", ")}` : "");
};

// quote-nesting lint: an HTML attribute opened with " inside a "-quoted JS string.
// Template literals and '-strings are blanked first (newlines preserved) so their
// legitimate double-quoted attributes cannot false-positive.
{
  const blank = m => m.replace(/[^\n]/g, " ");
  const scan = js.replace(/`(?:[^`\\]|\\.)*`/g, blank).replace(/'(?:[^'\n\\]|\\.)*'/g, blank);
  const QN = /"[^"\n]*<[a-zA-Z][^"\n]*\s(?:style|class|id|href|src|title|alt|type|value|role|aria-[\w-]+|data-[\w-]+)\s*=\s*"/;
  const hits = scan.split("\n").map((line, i) => (QN.test(line) ? i + 1 : 0)).filter(Boolean);
  ok(hits.length === 0,
    "quote-nesting: HTML attribute opened with a double quote inside a double-quoted JS string (use single quotes for the attribute, or a template literal)",
    hits.length ? `script line(s) ${hits.join(", ")}` : "");
}

// CSS <-> JS coherence: the paging classes the router toggles must have display rules
for (const cls of ["paged", "current"]) {
  const toggled = new RegExp(`classList\\.(add|remove|toggle)\\((["'])${cls}\\2`).test(js);
  ok(toggled, `router toggles '${cls}'`);
  if (toggled) ok(new RegExp(`\\.${cls}\\b[^{}]*\\{[^}]*display`).test(css),
    `CSS gives '${cls}' a display rule (jsdom can't see layout — this catches the invisible-paging bug)`);
}

// every #href (static AND inside JS string templates) resolves to a real id.
// "home" is the router's virtual fallback page (element is usually #homePage) — always valid.
const ids = new Set([...html.matchAll(/id=\\?["']([\w-]+)\\?["']/g)].map(m => m[1]));
ids.add("home");
const hrefs = [...html.matchAll(/href=\\?["']#([\w-]+)/g)].map(m => m[1]);
for (const h of new Set(hrefs)) ok(ids.has(h), `nav link target #${h} exists`);

/* ---------- booted layer ---------- */
function boot(mode) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.com/m.html", pretendToBeVisual: true });
  dom.window.scrollTo = () => {};
  if (mode === "THROW") {
    Object.defineProperty(dom.window, "localStorage", { get() { throw new Error("storage blocked"); } });
  } else if (mode && typeof mode === "object") {
    for (const [k, v] of Object.entries(mode)) dom.window.localStorage.setItem(k, v);
  }
  try { for (const s of scripts) dom.window.eval(s); }
  catch (e) { fails.push(`script threw on boot (${mode === "THROW" ? "blocked-storage" : "normal"}): ${e.message}`); }
  return dom;
}

const dom = boot(null); const w = dom.window; const d = w.document;
await tick();

// paged boot: exactly one page visible, and it isn't a teaching section
ok(d.body.classList.contains("paged"), "body has 'paged' class after boot");
const legs = [...d.querySelectorAll("section.leg")].map(s => s.id).filter(Boolean);
ok(legs.length >= 3, "found section.leg[id] sections", `found ${legs.length}`);
ok(d.querySelectorAll(".current").length === 1, "exactly ONE .current element at boot",
  `found ${d.querySelectorAll(".current").length}`);
ok(!d.querySelector("section.leg.current"), "boot lands on home, not a section");
sigilCheck(d);

// walk EVERY section — exclusive visibility each time
for (const id of legs) {
  w.location.hash = "#" + id;
  await tick();
  const cur = [...d.querySelectorAll(".current")];
  ok(cur.length === 1 && cur[0].id === id, `routing to #${id} shows exactly that section`,
    `current: ${cur.map(c => c.id || c.className).join(",")}`);
}
// bad hash falls back to a non-section page
w.location.hash = "#zzz-nonexistent";
await tick();
ok(d.querySelectorAll(".current").length === 1 && !d.querySelector("section.leg.current"),
  "bad hash falls back to home");

/* ---------- rich-module floor (full "zero to hero" builds only) ----------
   Checked after the section walk so lazily-rendered visuals are in the DOM.
   Quick explainers (4–5 sections) are exempt by design. */
if (legs.length >= 8) {
  const sliders = d.querySelectorAll('input[type="range"]').length;
  const svgs = d.querySelectorAll("svg").length;
  ok(sliders >= 1, "8+ section module has at least one learner-driven control (input[type=range]) — blueprint §22b");
  ok(svgs >= 3, "8+ section module has at least 3 inline <svg> visuals — blueprint §22", `found ${svgs}`);
  // A full module colour-codes its concept categories (blueprint §1), so the gate must
  // have something to read. Two *readable* accents, so an unparseable palette can't dodge it.
  ok(catsReadable.length >= 2,
    "8+ section module declares its category accents as --cat-<key> CSS variables the gate can read — blueprint §24",
    `${catKeys.length} declared, ${catsReadable.length} readable`);
  const fix = d.querySelector("table.fixtable");
  ok(!!fix, ' 8+ section module has the symptom-cause-fix table (<table class="fixtable">) — blueprint §15b'.trim());
  if (fix) {
    const rows = fix.querySelectorAll("tbody tr").length;
    ok(rows >= 12, "fixtable has 12+ rows (the cheat sheet's centrepiece)", `found ${rows}`);
  }
}

/* ---------- progress contract ---------- */
const firstLeg = legs[0];
w.location.hash = "#" + firstLeg;
await tick();
const keysBefore = new Set(Object.keys(w.localStorage));
const items = [...d.querySelectorAll(`#${firstLeg} .qitem`)];
ok(items.length >= 1, "first section has .qitem quiz items");
const bodyClassesBefore = [...d.querySelectorAll("[class]")].map(e => e.className).join("|");
for (const item of items) {
  const ans = parseInt(item.dataset.answer, 10);
  const opts = item.querySelectorAll(".qopt");
  ok(!isNaN(ans) && ans < opts.length, "qitem data-answer in bounds");
  // exercise the retry path (no strict assertion — feedback styles vary), then answer correctly.
  if (opts.length > 1) opts[(ans + 1) % opts.length].click();
  const before = item.outerHTML;
  opts[ans].click();
  // behavioral contract only: a correct answer must produce visible feedback of SOME kind
  ok(item.outerHTML !== before, "correct answer visibly changes the quiz item (lock/reveal/state)");
}
await tick();
// stamp visible somewhere: the DOM must have changed in class terms
const bodyClassesAfter = [...d.querySelectorAll("[class]")].map(e => e.className).join("|");
ok(bodyClassesAfter !== bodyClassesBefore, "completing the section visibly changes the UI (stamp/tick/progress)");
// persistence write
const newKeys = Object.keys(w.localStorage).filter(k => !keysBefore.has(k));
const allKeys = Object.keys(w.localStorage);
ok(allKeys.length >= 1, "a localStorage key exists after completing a section");
const storeKey = newKeys[0] ?? allKeys[0];
let savedRaw = null;
try { savedRaw = w.localStorage.getItem(storeKey); JSON.parse(savedRaw); ok(true, ""); }
catch { fails.push("saved progress state is not valid JSON"); }
ok(savedRaw && savedRaw.includes(firstLeg), "saved state records the completed section id",
  `key='${storeKey}'`);

// cold-reload survival: seed a FRESH dom with the saved state before the script runs
if (savedRaw) {
  const dom2 = boot({ [storeKey]: savedRaw });
  await tick();
  const d2 = dom2.window.document;
  const fresh = boot(null);
  await tick();
  const freshClasses = [...fresh.window.document.querySelectorAll("[class]")].map(e => e.className).join("|");
  const seededClasses = [...d2.querySelectorAll("[class]")].map(e => e.className).join("|");
  ok(seededClasses !== freshClasses, "seeded reload renders differently than a fresh boot (stamps restored)");
  // clobber check: booting must not wipe or reset previously saved progress
  const after = dom2.window.localStorage.getItem(storeKey);
  ok(after != null && after.includes(firstLeg), "boot does not clobber saved progress (the classic reset bug)");
  // extended state: anything else the module persists (checklist ticks, tab choice) must
  // survive boot alongside progress — one writer, one key (blueprint §2, verification.md §7)
  try {
    const beforeObj = JSON.parse(savedRaw), afterObj = JSON.parse(after);
    const lost = Object.keys(beforeObj).filter(k => !(k in afterObj));
    ok(lost.length === 0, "extra persisted state survives boot alongside progress", `lost key(s): ${lost.join(", ")}`);
  } catch { /* non-JSON already reported above */ }
}

// storage-failure resilience: module still boots and routes with throwing storage
const dom3 = boot("THROW");
await tick();
const d3 = dom3.window.document;
ok(d3.body.classList.contains("paged"), "boots with blocked localStorage");
dom3.window.location.hash = "#" + legs[1];
await tick();
ok(d3.querySelector(`#${legs[1]}`)?.classList.contains("current") === true, "routes with blocked localStorage");

/* ---------- verdict ---------- */
if (fails.length) {
  console.error(`FAIL — ${fails.length} contract violation(s):`);
  for (const f of fails.filter(Boolean)) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`PASS — paged-navigation + progress + static contracts hold (${legs.length} sections walked, key='${typeof storeKey !== "undefined" ? storeKey : "n/a"}'${legs.length >= 8 ? ", rich-module floor checked" : ""}${globalThis.__paletteWorst ? `, palette gate passed — tightest pair ΔE00 ${globalThis.__paletteWorst.dE.toFixed(1)}` : ""})`);
process.exit(0); // modules run setInterval/rAF animations that would otherwise keep node alive forever
