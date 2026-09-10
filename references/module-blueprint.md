# Module Blueprint — components and code patterns

Battle-tested patterns for the interactive components. Adapt names, colors, and copy to the module's theme; keep the mechanics. All vanilla JS, all in one file.

## Contents

1. Page shell & theming
2. State + persistence
3. Hash router (one section per page)
4. Roadmap (TOC) cards
5. Quiz engine
6. Term tooltips & "in plain words" boxes
7. Code peeks
8. Pipeline stepper
9. Timeline / waterfall demo
10. Scenario-prediction game
11. Flip-card glossary (its own page)
12. Accordion Q&A with sound-bites
13. Final quiz + completion stamp
14. Section footers (prev/next)
15. Big Picture — mental model + reference halves
16. Annotated line-by-line code walkthrough
17. Sources / further reading
18. Adversarial source review (source-grounded modules)
19. Consolidation & contrast patterns (recaps, contrast tables, reflection, cross-links)
20. Visual craft rules (carry, contiguity, signaling, coherence, pacing, pretraining)
21. Memory hooks — visual mnemonics for arbitrary facts
22. Charts and parameter exploration
23. Single source of truth and exports
24. Category encoding — colour plus a second channel

---

## 1. Page shell & theming

- Fixed left sidebar (~280px): course callsign, progress bar, one nav link per section with a completion tick. Hide it under ~1020px (the roadmap page is the TOC on mobile; section footers handle navigation).
- Main column: max-width ~880px, generous padding.
- Define the entire palette as CSS variables: `--bg`, `--panel`, `--line`, `--text`, `--text-dim`, plus one accent per concept category named **`--cat-<key>`** after the concept, never the colour (`--cat-cache`, not `--cat-teal`). Color-code categories *consistently* — if logs are amber on the overview card, logs are amber in every diagram, chip, and demo. Each category also carries a **sigil** — a hue-independent shape that travels with it everywhere (§24) — and the palette must clear the colour-blindness gate, which is cheapest to check before you write any CSS (`references/palette.md`).
- Three fonts via Google Fonts `<link>` with system fallbacks (display / body / mono). Pick characterful ones that fit the theme; never Inter/Roboto/Arial.
- **The hero animation runs the thesis.** Not a flourish: the module's **central process, executing end to end, labelled, on an 8–12 second loop**, with a beat caption underneath whose phrases light up in sync with the stage on screen. In one build that was — pieces laid onto a bench → a scan sweep crossing them → one new piece produced → a second sweep including the new piece → the bench sweeping clean — which is the module's entire thesis, running, before a word is read. Build it in the metaphor's world (references/theming.md): lanes actually metering cars onto the new roadway, envelopes actually moving through sorting bins. Never inherit a previous module's signature.

  **The test: a stranger who watches one loop and reads nothing should be able to state what the system does.** If they can't, it's decoration. Drifting motes, floating particles, and ambient steam over a still scene all fail this test — they are atmosphere, and atmosphere is *secondary*: gradients, a faint grid, texture, and motes may accompany the thesis animation but never stand in for it. CSS only, no images, no external JS.

  **Ship `@media (prefers-reduced-motion: reduce)`** for the hero and every demo — fall back to the **fully-assembled static end state** (the last frame, every label visible), never to a blank panel or a bare heading. Motion sensitivity is common enough that a perpetually looping hero without this is a real exclusion, not a checkbox; the bundled verifier checks the media query exists.

  Atmosphere obeys the **decoration quarantine** (§20): the hero animation and flourishes live on the hero, roadmap, and section headers — never inside or adjacent to a teaching diagram, demo, or code block.
- Sections are `<section class="leg" id="leg1">…`. **The mechanical hooks are frozen**: `body.paged`, `section.leg[id]`, `.current`, `.qitem[data-answer]`, `.qopt`, `.qwhy` keep these exact names in every module — the bundled verifier (`scripts/verify-module.mjs`) depends on them. Theme everything *visible* freely (call sections "shifts", "tickets", "checkpoints" in headings, nav labels, and copy), but never rename the machine-facing classes/attributes. Themed presentation, frozen plumbing.

Paged mode CSS — content is fully readable if JS never runs (graceful degradation), and pages only collapse when the script adds `body.paged`:

```css
body.paged section.leg{display:none}
body.paged section.leg.current{display:block}
body.paged #homePage{display:none}
body.paged #homePage.current{display:block}
```

## 2. State + persistence

One state object, one guarded storage key. localStorage can throw (file:// in some browsers, privacy modes) — never let persistence break the module:

```js
var LEGS = ["leg1","leg2", /* … */];
var state = { done:{}, last:"home" };
function loadState(){
  try{
    var raw = localStorage.getItem("<module-slug>");
    if(raw){ var p = JSON.parse(raw); if(p && p.done) state = p; }
  }catch(e){}
}
function saveState(){
  try{ localStorage.setItem("<module-slug>", JSON.stringify(state)); }catch(e){}
}
function markLegDone(id){
  if(!state.done[id]){ state.done[id]=true; saveState(); refreshProgress(); }
}
```

`refreshProgress()` updates the sidebar ticks, the % bar, and re-renders roadmap cards. When shipping a v2 of an existing module, keep the same storage key so progress survives.

Implement this pattern **verbatim, as one path**: quiz completion → `markLegDone()` → `saveState()` + `refreshProgress()` — never stamp UI surfaces directly from a quiz handler or write storage from more than one place. Every progress bug that has shipped came from splitting this path (UI updated but state never saved, or state saved but a boot-time reset clobbered it). The bundled verifier tests the whole chain, including reload survival and the no-clobber rule.

## 3. Hash router

```js
function showPage(id){
  if(id!=="home" && LEGS.indexOf(id)<0) id = "home";
  document.querySelectorAll("#homePage, section.leg").forEach(function(el){ el.classList.remove("current"); });
  ((id==="home") ? document.getElementById("homePage") : document.getElementById(id)).classList.add("current");
  // sidebar active state, scrollTo(0,0), state.last = id, saveState()
}
function route(){ var h=(location.hash||"").replace("#",""); showPage(h || state.last || "home"); }
window.addEventListener("hashchange", route);
// boot: loadState(); document.body.classList.add("paged"); …wire everything…; route();
```

All navigation is plain `<a href="#legN">` — sidebar links, roadmap cards, section footers. Back/forward buttons work for free.

## 4. Roadmap (TOC) cards

Home page = hero (what you'll be able to do afterward — as concrete "you will be able to say…" bullets) + a grid of section cards. Each card: section number chip, title, 1-line description, time estimate, and a stamp state ("quiz to stamp" → "✓ STAMPED"). Keep card metadata in one `LEG_META` object so cards, footers, and titles never drift apart. Add a "Continue" button that jumps to the first unstamped section.

**Warm-up guesses (pretesting).** Below the section cards, 2–3 ungraded guess questions on the module's most important facts ("Take a guess — no stamp, no score; you'll meet these again"). A wrong guess is the point: a failed retrieval attempt primes encoding of exactly that material when it arrives for real. Reuse the quiz markup unstamped (don't wire these to `markLegDone`), and have the final quiz re-ask the same facts so the learner feels the arc from guess to knowledge. Aim pretests only at facts the module explicitly teaches — the measured boost is specific to the pretested material, near zero for surrounding material.

## 5. Quiz engine

One engine for section checks AND the final quiz. Markup contract:

```html
<div class="qitem" data-answer="1">
  <div class="qq">The question?</div>
  <div class="qopts">
    <button class="qopt">Wrong</button><button class="qopt">Right</button><button class="qopt">Wrong</button>
  </div>
  <div class="qwhy"><b>Right.</b> The explanation — teach here, not just confirm.</div>
</div>
```

Behavior: wrong click → brief red flash, stays enabled (retry is the learning loop); on the **second** wrong click of the same item, also reveal a one-line misconception hint under the options — naming the wrong model, never the answer ("that's the X assumption — check who actually enforces it"). Bare right/wrong feedback is the weakest form measured in the feedback literature; a misconception-naming hint upgrades the retry loop into elaborated feedback while keeping the retry worth something. Correct click → lock the item, reveal `.qwhy`, record whether the *first* attempt was right (for final-quiz scoring), and check whether every `.qitem` in the section is done → `markLegDone(sectionId)`. Explanations only reveal on success so the reveal never spoils retries.

Distractors must be plausible misconceptions; the `.qwhy` names why the tempting wrong answer is wrong ("people assume X — actually Y"). Default to **three options** — one correct, two plausible-misconception distractors. Decades of item-design research converge here: fourth and fifth options are nearly always nonfunctional (almost nobody picks them), costing writing effort and reading time without adding discrimination. Add a fourth only when a third *genuine* misconception exists.

**Fade guidance across the module.** Sequence quiz demands to the learner's growing competence: early sections lean on recognition items ("which of these is the span?"), middle sections on completion items ("which line completes this handler?"), and the final quiz on generation and spot-the-issue items. Worked-example-first with fading guidance is how novices become competent — but it inverts for experienced learners: full-novice scaffolding measurably *hurts* people with real prior knowledge (expertise reversal). If Phase 0 revealed genuine experience, start further down the fade — fewer recognition items, lead with completion and generation.

Two quiz patterns worth reaching for deliberately: **discrimination items** for the module's confusable pairs — "Which one is this: CSP or CORS?" / "staleTime or gcTime?" — because telling twins apart is a distinct skill from knowing each; and **prediction items placed *before* a demo** ("Before you press Run: which span will be longest?") so the demo becomes the answer reveal. A learner who committed to a guess remembers the outcome; one who just watched, doesn't.

Final quiz: render from a data array so a Reset button can rebuild it; score = first-try correct count; show the completion stamp (an animated bordered "certified" panel) only above a threshold (e.g., 10/12).

## 6. Term tooltips & plain-words boxes

Inline term with hover definition (CSS-only, works on the `data-def` attribute):

```html
<span class="term" data-def="One timed unit of work: name, start, end, labeled details.">span</span>
```

```css
.term{border-bottom:1.5px dotted var(--accent);cursor:help;position:relative;white-space:nowrap}
.term:hover::after{content:attr(data-def);position:absolute;left:0;bottom:calc(100% + 8px);
  width:270px;white-space:normal; /* panel styling */ }
```

"In plain words" box: a visually distinct callout (left accent border) used after every dense passage. If a section has three paragraphs with no plain-words box, it's too dense — add one or simplify.

Tooltip density rule: because sections are viewed **in isolation**, never assume the reader saw an earlier page's definition. Every technical term gets a tooltip on its first use *within each section*, even if it was formally introduced two sections ago. Learners report the always-available hover definition is one of the highest-value features — it's their orientation system when they jump around. Cheap to add, so err on too many.

For rows of measured things (metrics, limits, config values): a badge-per-row layout where the badge tooltips the formal definition, the row shows the spelled-out name, thresholds as good/poor chips, and a "what moves it" line. Learners asked for exactly this level when they said "more detail."

## 7. Code peeks

```html
<div class="codepeek">
  <div class="cphead"><span class="fname">src/…/theFile.ts</span><span class="real">real code from your PR</span></div>
  <pre>…8–15 line excerpt, trimmed, minimal <span> highlighting…</pre>
  <div class="cpsay"><b>In plain words</b>What this excerpt means and why it exists.</div>
</div>
```

Rules: excerpts must be verbatim from the fact sheet source (badge only says "real" if it is; illustrative examples get an "illustrative" badge instead — and the same measured-or-illustrative declaration governs **every visual that carries a number**, see §20). Escape `<` and `>` in code. Every peek carries a plain-words caption — never show code and assume it explains itself. Showing a wire-format payload (the actual JSON that travels) is consistently one of the highest-value peeks: it demystifies "protocol" words instantly.

## 8. Pipeline stepper

For any multi-stage process (a request's journey, a build pipeline, data flow): a horizontal station map (icon circles + connecting dashes) with prev/next buttons and a body panel per station — plain-words paragraph + which real file/system implements it. Track position in one index variable; render map + body from a `STATIONS` array. Let users click stations directly. Final station's Next button becomes "Journey complete ✓" (disabled). Signal the position (§20): the active station lit in its category color **and** wearing its sigil (§24), passed stations dimmed-done, future stations dimmed-pending — the map itself should answer "where am I?" at a glance.

A stepper is **explanation**, not visualization — it can't be the module's only animated element. Pair it with a simulator (§9) or a driven chart (§22) that animates the subject itself: the learner should be able to *watch the core cycle happen* (dots of traffic actually moving between versions, requests actually bouncing off the cache), not only read stations about it. When feedback compares modules, the one whose animation shows the domain's real moving parts wins every time.

## 9. Timeline / waterfall demo

For anything with durations and nesting (traces, request lifecycles, render pipelines): rows = labeled items, bars positioned/sized by start/duration percentages, animated in sequence on a "Run" button (transition width, staggered setTimeout), click a bar → detail panel with its attributes and a teaching note. Make one bar visibly the culprit — the demo should let the learner *diagnose* something, not just watch. If items come from different systems (browser vs backend), color them differently and say so in the detail note. Apply §20's signaling and pacing: highlight the bar under discussion and dim the rest, keep Run replayable (a second watch after reading the detail panel is where the diagnosis clicks), and never advance the teaching state on a timer the learner can't pause.

## 10. Scenario-prediction game

A quiz variant for rule systems (gates, permissions, failure modes): each item is a concrete scenario, options are usually just Yes/No ("does it get through?"), and the explanation traces *which rule* decided the outcome. 4–6 scenarios covering each rule at least once, including one where the system is fine but the *record* is filtered (rule-vs-record distinction). This is the single best format for "what determines whether X happens" content.

## 11. Flip-card glossary (its own page)

Grid of cards: front = term + tiny category hint, back = 1–2 sentence plain definition (rotateY flip on click). 20+ terms for a full module. Write backs as standalone — each card must make sense to someone who skipped every section. Render from a data array.

**Dual-code the fronts.** Give each card its category's **sigil** (§24) — the same shape + accent color that category wears in every diagram and demo (a picture-plus-word pair out-remembers a word alone, but only when the picture is meaningful and distinctive). One consistent glyph per *category*, not clip-art variety per term: the glyph's job is to sort the deck visually and give the memory a second retrieval route, not to decorate.

Give the glossary its **own roadmap card and nav entry** — don't bury it inside conversation prep. It's the page learners revisit most after finishing; a dedicated entry makes it one click from anywhere. (Its quiz-free nature is fine: mark it stamped on first visit, or leave it stampless.)

## 12. Accordion Q&A (conversation prep)

`<details class="acc">` per likely expert question. Body: 1–2 honest paragraphs (including tradeoffs and limitations — those build credibility) ending in a highlighted **sound-bite answer** box: one or two sentences the learner can say verbatim. 8–10 questions. Source real ones from: the PR's design choices ("why X instead of Y?"), the domain's classic objections (cost, security, privacy, performance, vendor lock-in), and anything still broken/open.

## 13. Final quiz + completion stamp

12-ish questions spanning every section, rendered from data (see §5). Below it, a "your 30-second summary" plain-words box: one memorizable paragraph compressing the whole module — this is frequently the single most-used artifact of the entire course.

## 14. Section footers

Generated in JS from `LEG_META` (never hand-written per section): home link, prev link, spacer, "Next — <title> →" (last section links back home). Keeps navigation impossible to desync from the section list.

## 15. Big Picture — mental model + reference (one page, two halves)

Modules are consumed twice: **learned once, referenced forever.** Design for both. This page is the poster a learner pins above their desk *and* the cheat sheet they reopen mid-review six weeks later — and only the first of those is about learning. A single legible diagram satisfies the first and fails the second; when a reviewer says the Big Picture "should be much fuller and richer to be a reliable cheat sheet," the reference half is what was missing.

### 15a. The mental-model half

The module's central diagram (pipeline, lifecycle, architecture) with everything pinned onto it: key terms at the spot where they live, important numbers (defaults, thresholds, intervals) as small chips, the concept-category legend (sigil + colour + name — §24, so the legend still works in greyscale), a one-line takeaway per major stage, and the memory hook (§21) in miniature for its spaced second exposure.

Contiguity is the whole game here (§20): every term, chip, and takeaway sits **on the diagram at the spot it describes** — the legend exists for category colours only, never as the place meaning lives. If a label needs a leader line to reach its referent, move the label. Open with one **generation beat**: a single line at the top — "before you scroll: sketch the pipeline from memory, however rough" — because the attempt, even a failed one, measurably deepens what the reveal encodes.

### 15b. The reference half (required for modules over ~8 sections)

A panel grid below the diagram, built for scanning under time pressure rather than reading in order. This half is what works when the reader isn't learning — they're debugging.

- **Symptom → cause → fix table — the required centrepiece.** 12–20 rows: *what you'll observe* → *what's actually happening* → *what fixes it*, each row carrying a `#legN` cross-link to the section that teaches it. In a real build this was the single highest-value artifact in the entire module, and nothing in this skill had asked for it. Mark it up as `<table class="fixtable">` — the bundled verifier checks it exists with enough rows.
- **Every number in one place**, grouped by the module's concept categories, each paired with **what moves it**. A number without its lever is trivia; a number with its lever is a decision.
- **Decision rules** — the module's recurring forks as lookup cards: `condition → do this`. One card per fork, no prose.
- **Minimum-viable code skeleton** — the smallest thing that actually works, with the 3–5 load-bearing lines called out. Everything else in it is scaffolding and should be visibly dimmer.
- **Checklists** — at least one **interactive and persisted** (ticks survive reload, written through the same single `saveState()` path as §2, never a second writer on the same key) and flowing into the exports (§23). Verification.md §7 has the no-clobber assertions.
- **Anti-patterns** — "things not to say in a review," each paired with the correction. Learners repeat these verbatim, so a wrong one costs double.
- **Vocabulary spine** — 15–20 terms, one line each, purely scannable. Deliberately distinct from the flip-card glossary (§11): the deck is for *learning* a term you don't know, this list is for *scanning* past terms you do.

Mechanics: pure CSS/SVG (no images), its own roadmap card ("The Big Picture") and nav entry, the exact colours and terms used everywhere else so it reads as compression rather than a new lesson, and the export controls (§23) attached to the reference half. Place it after the deep-dive sections, before conversation prep. A learner who finished the course should be able to re-derive every section from the mental-model half; a learner who finished it six weeks ago should be able to solve a live problem from the reference half without re-reading anything.

## 16. Annotated line-by-line code walkthrough

For source-grounded modules (PR/diff/repo provided), short code peeks are not enough for the files that carry the lesson — those deserve a **full annotated walkthrough**: the real code with per-line or per-block annotations explaining what each piece does and why it's there.

Mechanics: a two-column grid (code left, annotations right) or numbered markers on lines that expand/highlight a note on click or hover; annotation and line highlight together. Rules: verbatim code only (badge it "real code"); annotate meaningful units (a guard clause, a config block), not literally every semicolon; each annotation says what the unit does AND why it exists — the "why" is the teaching. Limit to the 1–3 most instructive files, and keep using compact code peeks (§7) everywhere else. Learners consistently rate this the single most valuable element of PR-grounded modules — it's the moment abstract concepts snap onto their actual code.

## 17. Sources / further reading

A short annotated list, rendered near the end (own small page, or the closing block of the final section): each entry = title, a type chip (official docs / article / repo / the PR itself), a link, and one line of "read this if…" guidance so learners know which door to open next.

Populate it from the Phase 1 fact sheet's source log — only links actually consulted during research, plus the official documentation of the libraries/tools taught and (for grounded modules) the PR/files themselves. Never invent or guess URLs: a dead or wrong link in a "further reading" list quietly poisons trust in everything else. If nothing was fetched (a stable-fundamentals module built from trained knowledge), list only the canonical official docs and say so plainly.

## 18. Adversarial source review (source-grounded modules)

A dedicated section near the end that refuses to take the PR/source at face value — because a module that presents flawed code as gospel *teaches the flaw*, and because the learner's real upcoming conversation (an eng review!) will contain exactly these critiques. The goal is to train them to run the review themselves.

Structure it two-sided and specific:

- **Issues** — each one: the verbatim code (or the precise location), a severity chip (e.g., "will bite" / "worth raising" / "nit"), *why* it's a problem in plain words, and **the correct pattern shown as code**. Draw from the Phase 1 issues log: inconsistencies, best-practice violations, missing tests, edge cases, drift between config and code.
- **Strengths** — each deliberate good decision with *why* it's good ("fail-open means the cache can never take down a request — that's the right default"). Praising the right things teaches judgment as much as catching the wrong things.

Rules: every claim traces to the actual source (severity and critique are judgment, but the *evidence* is verbatim); don't manufacture issues to seem rigorous — if the source is clean, a short "what I'd double-check anyway" list is honest and still useful; and connect each item to the conversation ("if asked about X, here's your answer"). Also teach issues **inline** at the moment the relevant concept comes up ("notice this line hard-codes the default the config already owns — here's the fix"), then aggregate them here. A closing quiz item that asks the learner to *spot* one of the issues in a fresh code snippet is a strong finisher.

## 19. Consolidation & contrast patterns

Small, cheap patterns that convert reading into retention — use them throughout rather than as a section of their own:

- **Recap box** ("What we just did and why it worked"): 2–3 lines at the end of a dense section or after a demo, *before* the quiz. It's the breath between learning and testing — a compressed restatement in already-introduced vocabulary, never new material.
- **Contrast table / twin cards** for confusable pairs: two columns, the same 4–5 rows (what it is, who enforces it, when it bites, how to check it), so the eye can diff. Follow immediately with a discrimination quiz item (§5). One well-chosen contrast beats two separate explanations.
- **Varied examples**: when a core concept gets one example, give it a second in different clothes (another endpoint, another failure mode, another data shape) — same principle, different surface. Two examples that rhyme teach the pattern; label the rhyme explicitly ("same rule, new costume").
- **Cross-links as spacing**: when a later section touches an earlier idea, add a one-line reminder plus a `#section` anchor ("batching again — same mail-bag trick from Leg 05") instead of re-explaining or assuming memory. The hash router makes these free, and each re-encounter is spaced practice.
- **Closing reflection prompt**: one open question at the very end, after the certificate — "Where in *your* project would this apply first?" Unlike quizzes it has no right answer; its job is transfer, moving the module's ideas onto the learner's own work. One is plenty; ritualized reflection prompts everywhere lose their signal.

## 20. Visual craft rules (carry, contiguity, signaling, coherence, pacing, pretraining)

These rules from multimedia-learning research — among the largest measured effects in the field — govern **every** diagram, infographic, and demo. They cost nothing to follow and are invisible when followed; violating any one of them is measurable lost retention.

- **Carry.** A visual earns its place by showing what prose can't: structure, flow, proportion, nesting, simultaneity. A diagram that repeats the adjacent paragraph is decoration wearing a diagram's clothes — cut it or redesign it until the caption and the visual each carry load the other can't.
- **Contiguity.** Words and the things they describe sit **together**: labels on the diagram at the point of relevance, numbers as chips pinned where they apply, annotations beside the code line (§16 already does this — apply the same rule to every diagram). Never a legend across the page for *meaning* (legend for category colors only), never "see the table below." Physical distance between a word and its referent is pure extraneous load — the eye-shuttle is cognition spent on navigation instead of learning. This is the single strongest effect in the multimedia literature; treat violations as bugs.
- **Signaling.** At every step of a demo or walkthrough, the visual answers "look *here*": highlight the active element in its category color, dim everything else, and cue the destination *before* motion fires ("watch the third lane"). Cueing is the mechanism by which an animation outperforms a static diagram at all — an uncued animation is often *worse* than three static panels, because motion without a pointer scatters attention.
- **Redundancy.** Every distinction the visual makes carries **two channels**, one of which is not colour: shape, position, dash pattern, printed value, or a word. Colour is the fastest channel and the least reliable — it fails for about 1 in 12 male readers, in greyscale print, and on a washed-out projector, and it fails silently, because the visual still looks fine to you. A signalled element highlighted *only* by turning its category colour brighter is signalling to a subset of your readers. Mechanics, the sigil contract, and the verifier gate: §24.
- **Coherence — the decoration quarantine.** Interesting-but-irrelevant material measurably reduces retention, and it does the most damage when it sits next to an informative visual or animates perpetually. So: atmosphere (the signature hero animation, textures, flourishes) lives on the **hero, roadmap, and section headers only**. Teaching diagrams, demos, and code blocks get zero decorative elements, and no teaching page has ambient animation running while the learner reads. On teaching pages the metaphor appears as *structure* — the diagram drawn in the metaphor's world — never as ornament beside it.
- **Grounding — measured or illustrative, declared.** §7 badges code blocks "real" or "illustrative"; the identical rule governs **every visual that carries a number**. A **measured** visual plots real values, names its source in the caption, and every number in it must be assertable in a test (verification.md §5a). An **illustrative** visual — the common case, when a published finding reports a *shape* ("performance degrades as input length grows"; "accuracy plateaus then falls with reasoning budget") but publishes no per-point data — carries the badge **in the caption itself**: *"this shows the reported shape, not published values,"* plus one line on what the source does and does not report. **Never mix measured and invented points in one series.** A smooth authoritative curve rendered from numbers you made up is a fabrication wearing a chart's clothes — and it is harder to catch than a bad sentence, because a chart reads as evidence.
- **Pacing.** Demos advance in meaningful beats under learner control — a click, never an unpausable timer — and every Run button is replayable, because the second run (watched after reading the explanation) is where half the learning happens. A continuous animation needs either a step mode or a replay; "you had to catch it live" is a bug.
- **Pretraining.** No term or component makes its **first appearance inside a demo**. By the time the learner presses Run, every moving part on screen has been met by name and one-line behavior (a hover tooltip is a safety net, not an introduction). Learning the names-and-characteristics of the parts *before* watching the process is one of the most reliable effects in the multimedia literature — the demo's job is the interaction between known parts, never the introduction of new ones. If a demo needs a part the module hasn't taught yet, add a pretraining card directly above it: the parts laid out statically, each with name + one-line behavior, in their category colors.

Quick audit before Phase 4: for each visual, ask carry? (shows what prose can't) — contiguity? (no label more than a glance from its referent) — signaled? (a stranger could say where to look) — quarantined? (nothing decorative within the visual's bounding box) — paced? (learner-controlled, replayable) — pretrained? (every part in the demo was introduced before the demo) — grounded? (measured with a named source, or badged illustrative) — redundant? (every distinction readable with the colour removed) — reduced-motion? (a static end state exists for anything that animates).

## 21. Memory hooks — visual mnemonics for arbitrary facts

Most of a module's knowledge is *derivable* — understand the mechanism and the facts follow; that's what the mental-model sections are for, and no mnemonic needed. But every module carries a residue of **arbitrary facts**: value tables, ordered stage lists, port numbers, flag defaults, threshold sets. For the 1–2 most critical such clusters, build a **memory-hook panel**: a visual mnemonic where spatial structure encodes the facts.

The calibration example is the trig hand trick: fingers numbered 0–4, and sin θ = √n̅/2 by finger position — 30° is finger 1 (√1/2 = ½), 90° is finger 4 (√4/2 = 1). The image isn't a reminder *about* the values; it's a **lookup device the learner re-runs** — position maps to value, so the fact is re-derivable from the picture alone. That property (visual mnemonics with explicit structure-to-fact binding) carries some of the largest effect sizes in the memory literature. That's the bar.

Design tests — a hook ships only if it passes all four:

- **The derivation test.** Could the learner reconstruct the *exact* fact from the image alone, weeks later? A hook that merely *reminds* ("the one with the shelves") fails; a hook that *encodes* (shelf height = cache tier latency, in order) passes. If you can't state the mapping rule in one sentence ("position n = √n/2"), redesign.
- **One structure, one variable.** Map a single spatial dimension to a single variable: position → order, height → magnitude, distance → latency, count → quantity. A hook that encodes three things three ways is a diagram, not a mnemonic — it stops fitting in the mind's eye.
- **In-theme when possible.** Build the hook in the metaphor's world (shelf positions for cache tiers, sorting bins in dispatch order for partitions, breakers top-to-bottom for flag precedence) — the metaphor's familiar spatial layout is free mnemonic scaffolding. But mechanics beat theme: if the metaphor has no natural slot, a plain spatial hook beats a themed non-hook.
- **Never quiz the mnemonic.** Quiz the *applied* fact ("which stage runs second?" / "what's the default TTL?"), never the hook ("what does finger 3 stand for?"). Mnemonic recitation produces fluent recall that masquerades as understanding — the fluency illusion is documented and the quiz is where you catch it. The hook gets the learner to the fact; the quiz proves they can use it.

Mechanics: a bordered panel, pure CSS/SVG, the visual on one side and a **"how to re-run it"** caption on the other — the mapping rule stated in plain words, once ("count the finger, take its square root, halve it"). Place the panel where the fact cluster first appears, and pin a miniature of it onto the Big Picture (§15) for the spaced second exposure. One or two hooks per module, for the facts that matter most in the learner's real conversation — a module bristling with mnemonics has inverted its priorities: understanding first, hooks for the residue.

## 22. Charts and parameter exploration

Nearly every module has numeric relationships at its core — reliability compounding across steps, cost scaling with volume, latency against payload size, quality against budget. Prose *states* a relationship; a chart *shows its shape*; a chart the learner can drive teaches the shape by letting them break it. **A module whose only visuals are steppers, cards, and diagrams is under-built.** This is the most common first-draft gap and the one reviewers name first ("the visual aides, interactive demos, and charts are sparse — this is an area ripe with data"). Twelve visuals added in a second round should have been in the first.

Plan the charts in Phase 1, from the fact sheet: every threshold, rate, ratio, and growth claim you wrote down is a candidate axis.

### 22a. One line-chart helper, many charts

Write **one** SVG helper and call it four or five times. Bespoke SVG per chart is the failure mode — it triples the code, drifts in style, and makes the fifth chart feel too expensive to add, which is precisely why first drafts ship with none.

```js
// returns an SVG string; the module never hand-writes <svg> for a line chart again
function lineChart({ w, h, xmin, xmax, ymin, ymax, series, xticks, yticks,
                     marker, xtitle, ytitle }) { /* … */ }

// series: [{ pts:[[x,y], …], color:"var(--accent2)", label:"99% per step",
//            labelAt:0.72, dash:false, dim:false }, …]
// marker: { x, y, label:"20 steps → 35.8%" }
```

What the helper must enforce, so you can't forget it per-chart:

- **Series labels are drawn on the curve**, at each series' `labelAt` (a 0–1 position along its own points), in that series' colour — **never a legend**. This is contiguity (§20), and legend-instead-of-inline-label is the single most common chart bug.
- **Every series is distinguishable without colour**: the on-curve label above already does most of this, and `dash` is the second channel for any chart where two series run close (§24). A chart whose series differ only in stroke colour is one reader away from being unreadable.
- **`marker`** plots the learner's current slider position as a dot with its value spelled out, so the chart and the numeric readout can never disagree about where they are.
- `dash` for projected/illustrative series; `dim:true` renders a comparison series greyed and behind — signalling (§20) applied to series.
- Axis titles required, tick labels carry units.

### 22b. Slider-driven readouts

A chart earns its place when the learner can **move something and watch a number change**. The pattern:

- 1–4 `<input type="range">` controls, each labelled with its live value;
- a `.readout` strip of 3–4 large numeric values under uppercase micro-labels;
- chart re-render plus marker move on every `input` event (cheap: the helper returns a string, so `el.innerHTML = lineChart(...)`).

Worked examples that landed in a real build: **per-step reliability × step count → end-to-end success** (drag to 20 steps at 95% and watch 35.8% arrive — the entire argument for short agent loops, delivered in one gesture); **context length → pairwise relationships** (quadratic growth felt rather than asserted); **thinking budget → accuracy vs. cost** (two curves crossing, and the crossing point *is* the lesson).

**Put a prediction beat in the chart header**, not only on demos: "Before you drag — how many steps can a 99%-per-step agent survive before it's a coin flip?" One line of copy, and it converts a chart from decoration into retrieval practice (§5's prediction items, applied to visuals).

### 22c. Relative-unit calculators for anything price-like

Absolute currency goes stale within a quarter and visibly dates the artifact. Express cost as a **multiple of a stated baseline** — "naive pipeline = `1.00×`" — and let the levers scale it; the ratios stay true long after the prices move. Show **headroom remaining per lever as bars**, not only a combined total: the teaching is *which lever is still worth pulling*, and a single total hides exactly that.

### 22d. Matrix / heatmap for pairwise structure

Anything with n×n structure gets a grid, not a paragraph. In one build a **10×10 attention matrix with a hatched causal mask** taught in three seconds what three paragraphs had failed to convey — that a token cannot see the future — and it was strong enough to become a quiz item *and* a test assertion (`the mask covers exactly n(n-1)/2 cells`). Cells carry their value; the mask is drawn as pattern, not colour alone, so it survives greyscale printing and colour-vision deficiency.

### 22e. Before/after state toggles

For measured comparisons — a context-window bar switching between two strategies, a latency profile before and after batching — toggle two states over the **same** visual rather than placing two charts side by side: the eye diffs a change in place far better than it diffs across a gap. **Pin the measured numbers to each state** so the values swap with the shape.

### 22f. Grounding badge (mandatory)

Every chart, matrix, and numeric diagram declares whether it is **measured** or **illustrative** — see §20's grounding rule. A visual with neither real data nor an illustrative badge is a bug, not a style choice.

## 23. Single source of truth and exports

**Author every repeated element as a data array first, then render from it.** Panels, tables, glossary cards, checklists, quiz items, station lists, cheat-sheet rows: if content will appear in a section *and* the Big Picture *and* an export, it must have exactly one definition in the file. Authoring the reference panels as static HTML and only later needing them in a Markdown export buys you a drift-guard test where a shared array would have cost nothing — and the array makes each export a ten-line function instead of a second authoring pass.

**Exports (required for any module with a reference half, §15b).** A cheat sheet's value is proportional to how easily it leaves the page:

- **Copy as Markdown** — `navigator.clipboard.writeText`, with a hidden `textarea` + `document.execCommand("copy")` fallback. The clipboard API is unavailable in some `file://` contexts, which is exactly how these artifacts get opened.
- **Download `.md`** and **download a self-contained `.html`** — Blob URL **with a data-URI fallback**, for the same reason: object URLs are sometimes blocked under `file://`.
- **A print stylesheet** — `@media print`: invert to a light scheme, drop the sidebar, nav, and buttons, and set `break-inside: avoid` on every panel so the reference half prints as intact cards rather than shredded columns.
- **Generated from the same data arrays as the page**, never re-typed — with a test asserting the counts and key strings match (verification.md §8).
- **Persisted UI state flows into the export.** Ticked checklist items export as ticked, which turns a cheat sheet into a shareable status snapshot — the artifact a learner actually sends to their lead.

Export hygiene: no HTML tags leaking into the Markdown, and the standalone HTML must contain **zero `<script>`, zero `<link>`, and no external URLs**. It is a document, not a second app.

## 24. Category encoding — colour plus a second channel

Concept categories are the module's colour system: one accent per category, worn consistently by every diagram, chip, card, station and chart series (§1). That consistency is what makes the colour *mean* something — and it is exactly why colour alone is not enough to carry it.

Two independent failures, both now gated by `scripts/verify-module.mjs`:

**The palette collides.** Accents that look distinct to you converge for a reader with a colour-vision deficiency, and no amount of staring will tell you which ones. Declare accents as `--cat-<key>` custom properties and the verifier simulates deuteranopia, protanopia and tritanopia and fails the build on any pair below ΔE00 15. The rule that makes a palette pass first time — separate categories by **lightness**, treat hue as decoration on top — plus validated anchor sets and the standalone mode to run in Phase 1: `references/palette.md`.

**Colour is the only carrier.** Give every category a **sigil** — one small shape, drawn in CSS/SVG, that identifies it without hue and travels with it everywhere: roadmap card, section header, diagram node, stepper station, chart series marker, glossary card front (§11's dual-coded fronts, generalised), Big Picture legend.

```html
<span class="sigil" data-cat="cache" aria-hidden="true">
  <svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5"/></svg>
</span>
<span class="cat-name">Cache</span>
```

`class="sigil"` and `data-cat="<key>"` are frozen hooks — the verifier requires one per declared `--cat-<key>`. Shapes come from families that survive at 12px (circle, square, triangle, diamond, hexagon, cross, and their hollow variants), one shape per category forever; the glyph is `aria-hidden` because the adjacent words carry the accessible name. Sigils are also free mnemonic structure — a shape plus a word out-remembers a word alone, which is why §11 wanted them on the glossary deck in the first place.

The same rule reaches past categories: dash patterns and on-curve labels for chart series (§22a already draws both), printed values and hatched masks in matrices (§22d), ✓/✗ glyphs plus a word on quiz feedback (§5), badge *text* on real-vs-illustrative markers (§7). `references/palette.md` has the full table of what to add where.

Cheapest possible audit, worth doing once per build: **view the page greyscale.** Anything that dies there was already dead for a colour-blind reader — and it will die again in the print stylesheet (§23), which inverts to a light scheme where dark-ground accents were never tested.
