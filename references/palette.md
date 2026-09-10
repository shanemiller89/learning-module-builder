# Palette — category colour that survives colour-blindness

A module's concept categories are colour-coded, and every colour-coded system fails in one of two ways:

- **The palette collides** — two accents that look distinct to you land on the same perceived colour for a reader with a colour-vision deficiency.
- **Colour is the only channel** — the category is identified by hue and nothing else, so it disappears in greyscale print, on a washed-out projector, and for that same reader.

Roughly **1 in 12 men and 1 in 200 women** has a colour-vision deficiency. On a team of ten that's better-than-even odds someone can't read the palette, and you will never notice from the inside — the page looks right to the person who built it, so the news arrives, if at all, from a reader weeks later. That is what happened: two rails on a roadmap page, indistinguishable, reported back by the reader. Both failures are now mechanically gated by `scripts/verify-module.mjs`.

## The one fact that makes this easy

**After colour-vision simulation the hue circle collapses toward a single blue↔yellow axis.** Red, orange, green and brown converge; blue and violet converge; teal and pink converge. Whatever hue drama you designed is gone.

What survives is **lightness**. So the rule that makes palettes pass on the first try:

> Two categories may share a hue family only if they are far apart in lightness. Two categories at similar lightness must sit on opposite ends of the blue↔yellow axis.

Every failure below is the same mistake — two accents separated by hue alone:

| Pair | Looks like | To a reader with… | ΔE00 |
|---|---|---|---|
| `#6c5ce7` / `#7d6bd8` | two indigos | protanopia | **3.1** |
| `#b06a2c` / `#b8386b` | rust vs. magenta | tritanopia | **9.6** |
| `#2f9e8f` / `#b8386b` | teal vs. magenta | deuteranopia | **13.0** |
| `#BE4A1C` / `#9C7414` | rust vs. ochre | deuteranopia | **2.3** |
| `#17427E` / `#6E3BA6` | navy vs. plum | protanopia | **6.4** |

The last two came from a palette that was *hand-designed to be accessible*. Intuition does not work here; the check does.

## The gate

`scripts/verify-module.mjs` reads every `--cat-<key>` custom property out of the module's CSS and enforces:

- **ΔE00 ≥ 15** between every pair, under **four observers**: normal, deuteranope, protanope, tritanope. (Simulation: Machado, Oliveira & Fernandes 2009, severity 1.0. Distance: CIEDE2000.)
- **≥ 3:1 contrast** between each accent and `--bg` (WCAG 1.4.11 — an accent too close to the background isn't an indicator at all).
- **A `.sigil` glyph for every `--cat-<key>`** — see "Sigils" below.

Where 15 comes from: Okabe–Ito, the canonical colour-blind-safe qualitative set, floors at **ΔE00 20** across its best four — and four is the most categories this skill builds (SKILL.md Phase 1). So 15 sits comfortably *below* the reference set at the count in use: it admits any palette Okabe–Ito would, while failing every pair in the table above. The margin is deliberate in the other direction too — these accents get rendered as **thin rails, 2px strokes and small chips**, and thin marks are much harder to tell apart than the swatches a ΔE threshold is usually quoted for.

**Run it in Phase 1, while you're choosing the theme** — no module and no jsdom needed:

```bash
node scripts/verify-module.mjs --palette "#F6E3A5,#74C8F0,#2F8E86,#8E77DC" --bg "#0e0f13"
```

It prints every pair sorted worst-first with the observer that struggles. Iterating here costs a minute; discovering it in Phase 4 costs a repaint of every diagram, chip and chart in the file.

## Validated anchors

These are measured, not asserted — both sets pass the gate with margin. Take them as **anchors to tune toward your metaphor's world**, not as a fixed palette to paste in; the skill's whole stance is that each module looks designed rather than templated, and hue can move a fair distance before the gate complains. What must survive tuning is the **lightness ladder**, because that ladder is what the colour-blind reader is actually reading.

### Dark ground — `--bg: #0e0f13`

| Slot | Hex | Contrast vs bg | Reads as |
|---|---|---|---|
| `--cat-1` | `#F6E3A5` | 15.0 | cream / parchment — the lightest step |
| `--cat-2` | `#74C8F0` | 10.3 | sky |
| `--cat-3` | `#90AE8B` | 7.9 | sage |
| `--cat-4` | `#8E77DC` | 5.3 | plum |
| *spare* | `#C4652F` | 4.8 | rust |
| *spare* | `#2F8E86` | 4.9 | deep teal |

All six clear the gate together at **ΔE00 16.2** (cream vs. sage, under protanopia), so any four of them do too — swap freely.

### Light ground — `--bg: #FBF8F1`

| Slot | Hex | Contrast vs bg | Reads as |
|---|---|---|---|
| `--cat-1` | `#A87D14` | 3.5 | ochre — the lightest step |
| `--cat-2` | `#7B5CB8` | 4.9 | plum |
| `--cat-3` | `#0E7A64` | 5.0 | teal |
| `--cat-4` | `#8C3010` | 7.8 | rust |
| *spare* | `#123566` | 11.5 | ink |
| *spare* | `#372A2B` | 13.0 | graphite (doubles as body text) |

All six clear the gate together at **ΔE00 19.1** (ink vs. plum, under protanopia); the four named slots alone floor at 20.1.

### Tuning without breaking it

1. Start from the anchor set with the right ground.
2. Rotate hues toward the metaphor — highway greens, kraft browns, ledger blues — **holding each slot's lightness roughly fixed**. Hue is the cheap axis; lightness is the load-bearing one.
3. Re-run `--palette`. If a pair fails, do not nudge its hue: **move one of them up or down the lightness ladder.** Hue nudging is what produced the 2.3 and 6.4 rows above.
4. **Cap the count.** SKILL.md's 2–4 is the rule, and it is doing double duty here: every added category shrinks the available space quadratically, and a learner tracking six colour meanings has a working-memory problem whatever their vision. Slots 5–6 in the tables below are spares for recolouring, not an invitation to a sixth category.

## Sigils — the second channel

A **sigil** is a small shape that carries a category's identity without hue: one per category, the same shape everywhere that category appears — roadmap card, section header, diagram node, stepper station, chart series marker, glossary card front, Big Picture legend. The markup contract the verifier enforces (`class="sigil" data-cat="<key>"`), the shape families that survive at 12px, and the drawing rules live in **blueprint §24**; this file is about the colour half.

Two naming notes that belong here, because they're palette decisions:

- **Name the keys after concepts, not colours** — `--cat-cache`, never `--cat-teal`. A colour name in a variable is a promise the theme will eventually break, and the sigil's whole point is that the category outlives its hue.
- **Pick sigil shapes at the same time as the accents, not after.** The metaphor's world supplies both (theming.md): a lane chevron, a rubber stamp, a ledger rule. Choosing shapes late produces generic geometry bolted onto a themed palette, which reads as an accessibility retrofit — which it then is.

## Where colour must never be the only carrier

Categories are the common case, but the same rule catches the rest. Each of these has a cheap non-colour channel — use it:

| Element | Colour alone | Add |
|---|---|---|
| Chart series (§22a) | line colour | `dash` pattern **and** the inline on-curve label the helper already draws |
| Diagram / stepper nodes (§8) | node fill | the category sigil, inside or beside the node |
| Timeline bars (§9) | bar colour | a hatch or border style for the culprit bar, plus its text label |
| Matrix / heatmap (§22d) | cell fill | the cell's value printed, and masks drawn as **pattern** (§22d already says so) |
| Quiz feedback (§5) | green / red | ✓ / ✗ glyph and a word — "correct" / "not quite" |
| Code diff or "real vs illustrative" badges (§7) | badge colour | the badge's text, which already exists — don't drop it for a colour-only dot |
| Progress stamps (§4) | filled vs empty | a tick glyph and a state word in the label |
| Active nav / current station (§20 signalling) | colour highlight | weight, size, or a marker — dimming the rest is a lightness cue and survives |

The general test, and it takes five seconds: **screenshot the page and view it greyscale.** If two things that mean different things now look the same, the module has a colour-only channel. The print stylesheet (§23) makes this concrete — anything that dies in greyscale print was already dead for a colour-blind reader.
