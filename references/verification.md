# Verification — run all of these before delivering

A learning module with a broken quiz or dead navigation teaches the learner to distrust the whole file. Every check below caught a real problem at least once. Run them in a shell against the finished HTML; fix and rerun until clean.

**Keep verification scratch out of the delivery folder.** Write test scripts (`smoke.js`, checkers, extracted JS) to `/tmp`, never beside the module — a stray `.js` next to the deliverable reads as "you delivered a JavaScript file." Final check before finishing: the delivery folder contains exactly one file, the `.html`.

## 0. Run the bundled verifier FIRST — it must exit 0

Progress tracking and paged navigation have shipped broken more than once, each time past a hand-written smoke test. Hand-rolled tests drift; the bundled one doesn't.

**The incantation.** The verifier resolves `jsdom` from **the directory you run it in** (`process.cwd()`), not from its own path — the skill lives in a read-only cache with no `node_modules`, and resolving script-relative fails there with `ERR_MODULE_NOT_FOUND` even when jsdom is installed where you're working. So:

```bash
mkdir -p /tmp/lmb && cd /tmp/lmb && npm i jsdom          # once per machine
cd /tmp/lmb && node <skill-path>/scripts/verify-module.mjs /abs/path/to/module.html
```

If your environment still can't resolve it, **copy** the script next to your `node_modules` and run the copy, then delete it. Say it plainly: **copying the verifier is not the same as editing it.** The prohibition below is on changing its assertions to make a failing module pass — running an unmodified byte-identical copy from a writable directory is fine and expected.

It mechanically enforces both contracts: paged boot (exactly one page visible), a walk of **every** section with exclusive visibility, bad-hash fallback, link resolution (including JS-generated hrefs), CSS↔JS coherence for the paging classes, quiz completion feedback, the **full progress chain** — visible UI change on section completion, valid JSON written to storage containing the section id, **cold-reload survival** (seeded fresh DOM renders restored stamps), **no-clobber on boot** (loading must not wipe saved progress — the classic reset bug), and **blocked-storage resilience** (module still boots and routes when localStorage throws).

It also runs the universal static checks that need no module-specific knowledge: a **`prefers-reduced-motion` block exists** in the CSS (blueprint §1 — a looping hero without one is an accessibility bug); the **quote-nesting lint** over the extracted script (§5d); **extra persisted state survives boot** alongside `state.done` (§7); the **colour-independence gate** (below); and, for modules of **8+ sections**, the visual floor — at least one `input[type=range]`, at least three inline `<svg>`, and the reference half's `<table class="fixtable">` with 12+ rows (blueprint §22 and §15b). Quick explainers (4–5 sections) are exempt from the last group by design.

**The colour-independence gate** (blueprint §24, `references/palette.md`) reads every `--cat-<key>` custom property out of the CSS and fails the build if any pair falls below **ΔE00 15** under normal, deuteranope, protanope or tritanope vision (Machado 2009 simulation, CIEDE2000 distance), if any accent falls below **3:1** against `--bg`, or if any declared category lacks a `<… class="sigil" data-cat="<key>">` glyph. It exists because this class of defect is invisible from the inside: the page looks correct to the person who built it, and the report arrives from a reader weeks later. Do not chase it in Phase 4 — the same script runs standalone on bare hex values during Phase 1 theme selection:

```bash
node <skill-path>/scripts/verify-module.mjs --palette "#F6E3A5,#74C8F0,#2F8E86,#8E77DC" --bg "#0e0f13"
```

No jsdom, no module needed. A collision found there costs one edit; found after the build it costs a repaint of every diagram, chip, chart and legend in the file.

One thing the gate cannot check: whether a **non-category** distinction leans on colour alone — a highlighted timeline bar, a green/red quiz state, a two-series chart. For those, take the five-second audit: screenshot a page and view it greyscale. Anything that stops being readable was already unreadable for a colour-blind learner, and blueprint §24 has the table of what second channel each element should be carrying.

Rules of engagement: run it **as-is** — do not substitute a bespoke smoke test for it, and do not edit it to make a failing module pass; fix the module. Add module-*specific* assertions (demo behavior, glossary counts, simulator outcomes) in a separate scratch script on top. The verifier depends on the blueprint's frozen mechanical hooks (`body.paged`, `section.leg[id]`, `.current`, `.qitem[data-answer]`, `.qopt`, `.qwhy`, `table.fixtable`, `--cat-<key>`, `.sigil[data-cat]`) — if it can't find them, the module broke the contract, not the other way around. Sections 1–4 below explain what it checks and cover what it can't (facts, visuals).

## 1. HTML tag balance + JS syntax + ID cross-check (one script)

```bash
python3 - <<'EOF'
import re, html.parser
src = open("MODULE.html", encoding="utf-8").read()

# extract the app script for node --check
m = re.search(r"<script>(.*?)</script>", src, re.S)
open("/tmp/module.js","w").write(m.group(1))

# tag balance
class P(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack=[]; self.errors=[]; self.void={"meta","link","br","img","input","hr"}
    def handle_starttag(self,tag,attrs):
        if tag not in self.void: self.stack.append((tag,self.getpos()))
    def handle_endtag(self,tag):
        if not self.stack: self.errors.append(f"extra </{tag}> {self.getpos()}"); return
        t,pos=self.stack.pop()
        if t!=tag: self.errors.append(f"mismatch <{t}> {pos} closed by </{tag}> {self.getpos()}")
p=P(); p.feed(src)
for t,pos in p.stack: p.errors.append(f"unclosed <{t}> {pos}")
print("HTML errors:", p.errors or "none")

# every getElementById target must exist
js = m.group(1)
ids_used = set(re.findall(r"getElementById\([\"']([\w-]+)[\"']\)", js))
ids_def  = set(re.findall(r"id=[\"']([\w-]+)[\"']", src))
print("missing ids:", sorted(ids_used - ids_def) or "none")

# quiz answer indexes in bounds (count loosely: class="qopt..." may have extra classes)
items = re.findall(r'<div class="qitem" data-answer="(\d+)">(.*?)(?=<div class="qitem"|</section>)', src, re.S)
bad = [(a, b.count('class="qopt')) for a,b in items if int(a) >= b.count('class="qopt')]
print("answer index out of range:", bad or "none", "| qitems:", len(items))
EOF
node --check /tmp/module.js && echo "JS syntax OK"
```

Gotcha already hit once: matching `class="qopt"` exactly misses buttons with extra classes (`class="qopt yes"`). Count with the loose prefix as above.

## 2. jsdom smoke test (routing, quizzes, persistence actually work)

`npm i jsdom` once, then adapt:

```js
const { JSDOM } = require("jsdom");
const html = require("fs").readFileSync("MODULE.html","utf8");
// GOTCHA 1: use an https URL — with file:// the origin is opaque and
// window.localStorage THROWS (SecurityError) when the test touches it.
const dom = new JSDOM(html, { runScripts:"outside-only", url:"https://example.com/m.html", pretendToBeVisual:true });
const { window } = dom; const d = window.document;
// GOTCHA 2: jsdom has no scrollTo — stub it BEFORE evaluating the app script.
window.scrollTo = function(){};
window.eval(html.match(/<script>([\s\S]*?)<\/script>/)[1]);

// Assert, with ~25ms waits after each hash change (hashchange dispatch is async):
// - body has the paged class; home page is .current by default
// - roadmap renders one card per section; every section got a generated footer
// - location.hash = "#leg3" → only leg3 has .current
// - clicking the correct .qopt in a section marks qitem done, ticks the sidebar,
//   bumps the progress %, stamps the roadmap card
// - "continue" button routes to the first unstamped section
// - dynamic components rendered (glossary cards, final quiz items, stepper stations,
//   waterfall bars — assert exact expected counts)
// - localStorage contains the saved state after a quiz pass
```

Print a single PASS line or a list of failures. If a count assertion fails after a content edit (e.g., you added glossary cards), update the expected count — that's the test doing its job.

### The progress-tracking contract (enforced by the verifier — §0)

Progress is the learner's investment in the module: if stamps vanish on reload or the bar lies, trust in the whole file dies. The bundled verifier proves **stamp propagation** (one quiz pass updates sidebar tick, progress %, and roadmap card), **persistence write**, **cold-reload survival**, **no-clobber on boot**, and **blocked-storage resilience**. Do not re-implement these by hand — that is exactly the drift the bundled verifier exists to prevent.

Two things it cannot do, which are yours:

1. **Key stability across versions.** When editing an existing module, grep the old file for the storage-key literal and assert the new one matches, so learners' progress survives your update.
2. **Extended state** — anything the module persists beyond `state.done`. See §7.

The cold-reload pattern, for your own module-specific state assertions (jsdom's localStorage does not persist across instances, so seed a *fresh* DOM **before** evaluating the script):

```js
const saved = window.localStorage.getItem(KEY);        // from the first DOM, after stamping
const dom2 = new JSDOM(html, { runScripts:"outside-only", url:"https://example.com/m.html", pretendToBeVisual:true });
dom2.window.scrollTo = function(){};
dom2.window.localStorage.setItem(KEY, saved);          // seed BEFORE the script runs
dom2.window.eval(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
```

### The paged-navigation contract (enforced by the verifier — §0)

The most user-visible failure a module can ship with — and it has shipped — is rendering as **one long scrolling page with dead navigation links**, which the graceful-degradation CSS makes look deceptively fine. The verifier proves: paged boot with exactly one page visible and it isn't a teaching section; a walk of **every** section with exclusive visibility; bad-hash fallback; every `href="#…"` (static *and* inside JS string templates) resolving to a real id; and **CSS↔JS coherence** — every paging class the router toggles must have a `display` rule in the stylesheet.

**Know the blind spot: jsdom verifies router *logic*, not what's on screen.** jsdom has no layout engine, so if the CSS rules that give `paged`/`current` meaning are missing or misspelled, every classList assertion passes and the browser still renders one long scroll with jumpy links. That bug shipped once; the coherence check is why it can't again.

Two checks remain yours:

1. **Interactive elements inside late sections work after routing** — navigate to the last section, then run one interaction there (a quiz click, a slider drag, a demo button). This catches wiring that only ran for elements visible at boot.
2. **Real browser render (the gold check).** If headless Chromium is available (Playwright/Puppeteer), load the file, assert exactly one section has a nonzero bounding box, click two sidebar links and re-assert, and check for zero console errors. A screenshot of home plus one mid-course section is cheap and definitive.

If node/jsdom is genuinely unavailable, the minimum static fallback is: the CSS↔JS coherence regex (pure regex — it runs anywhere Python does), the boot-adds-paged check, and every `href="#x"` having a matching `id="x"` — then say plainly in the delivery note that live routing wasn't executed and the user should click through the sidebar once. Never deliver silently unverified navigation.

## 3. Grounding audit — every codebase claim traces to real code, no assumptions

The module's authority comes entirely from being *true about their code*. This step verifies that — mechanically where possible, sentence-by-sentence where not.

**3a. Presence check (programmatic).** Assert the module contains the exact strings that matter — file names, env vars, endpoints, service names, thresholds:

```python
checks = ["theExactEndpoint", "the.exact.metric.name", "THE_ENV_VAR", "theFileName.ts"]
missing = [c for c in checks if c not in src]
```

**3b. Excerpt diffing (programmatic).** Every code block badged "real code" must be verbatim. Extract the module's code blocks, HTML-unescape and normalize whitespace, then verify **each line exists in the actual diff/source file** — a script, not an eyeball:

```python
import re, html as h
blocks = re.findall(r'<pre>(.*?)</pre>', src, re.S)          # pair with their badge/fname headers
source = open("the/real/file.ts").read()                      # or the diff
for line in code_lines(blocks):                               # strip <span> tags, unescape, trim
    assert norm(line) in norm(source), f"NOT IN SOURCE: {line}"
```

Any line that fails is either a transcription error (fix it) or an invention (delete it or re-badge the block "illustrative").

**3c. Identifier sweep (programmatic).** Collect every code-styled identifier the module names (function names, env vars, config keys, metric names, paths) and grep each against the diff/repo. An identifier that exists nowhere in the codebase is a hallucination wearing a monospace font.

**3d. Claims ledger (manual, sentence-by-sentence).** Reread every sentence that asserts something about the user's code or system and write down where the evidence lives (file + line, or PR-description quote). The rule is absolute: **if you didn't read it, the module doesn't claim it.** Claims with no evidence get one of three fates — go read the code that would prove it (see "read around the diff" in SKILL.md), soften it into an explicit question ("worth confirming whether other write paths invalidate this key"), or delete it. Be extra suspicious of: fields/attributes the system "sends" (verify each is in the code), behavior under failure (verify the guard/try-catch actually exists), anything "always/never/only" (absolutes need the strongest evidence), and adversarial-review items (each issue's evidence must be verbatim-quotable; each "correct pattern" clearly marked as proposed, not existing code).

"I don't know" costs nothing; a wrong claim repeated to an expert costs the learner the exact credibility this module exists to build.

**3e. Visual grounding — required for every visual that carries a number.** Code blocks already declare "real" or "illustrative" (blueprint §7). Charts must too (blueprint §20), and this is where you check it. For **each** chart, matrix, and numeric diagram, write down in the audit which category it is and where its numbers came from:

- **Measured** → real values; the source is named in the caption; every number in it is assertable in §5a.
- **Illustrative** → the badge is in the caption itself (*"this shows the reported shape, not published values"*), plus one line on what the source does and does not report.

**Never mix measured and invented points in one series.** A chart with neither real data nor an illustrative badge is a bug. This matters more than the equivalent prose error, not less: a published finding often reports only a *shape* ("performance degrades as input length grows", "accuracy plateaus then falls with reasoning budget") while publishing no per-point data, and rendering that as a smooth authoritative curve manufactures precision the source never claimed. A chart reads as evidence; readers audit sentences and trust axes.

## 4. Visual sanity

If a browser/screenshot tool is available, open the file and check: fonts loaded, sidebar and roadmap render, one section navigates, a quiz answers, nothing overflows on a narrow viewport. If no browser is available, say so in the delivery note and rely on §1–§3.

## 5. Content integrity — the numbers must survive contact with a calculator

Every check here caught a real bug in a shipped module. They are cheap; run them in the same scratch script as §2.

**5a. Arithmetic self-check.** Any computed value the module prints — in prose, a table, a slider readout, a chart annotation — is **recomputed in the test**, never eyeballed:

```js
assert(pct(0.95 ** 20) === "35.8%");   // module claims "20 steps at 95% ≈ 35.8%"
assert(pct(0.96 ** 30) === "29.4%");
```

A module that teaches compounding and gets its own compounding wrong is worse than one that never mentioned it — it is confidently, checkably wrong in the exact place it claimed authority. Pull the claimed figures out with a regex over the source and assert each against the formula the module itself states.

**5b. Cross-panel numeric consistency.** The same figure typically appears three times: in the section that teaches it, in a chart or readout, and in the cheat sheet. Assert **all copies agree**, and wire it so divergence fails the build rather than merely printing a warning:

```js
for (const [label, expected] of KEY_NUMBERS) {
  const hits = src.split(expected).length - 1;
  assert(hits >= 2, `${label}: "${expected}" appears once — did a copy drift?`);
}
```

If a number legitimately appears once, it probably belongs in the cheat sheet's numbers panel too (blueprint §15b) — the check failing is often a content finding, not a test problem.

**5c. Sum consistency of tables.** Any table that implies a total must have that total checked. A real bug shipped in a token-budget table whose rows summed to 72K under a stated "58 tools ≈ 55K" heading — the kind of error every reader with a calculator finds and no reader without one does, which makes it exactly the wrong error for a module whose job is credibility. Parse the rows, sum them, compare to the stated total, and allow no fudge factor you can't name.

**5d. Quote-nesting lint.** Three syntax errors of the form `"… <b style="color:var(--x)">…"` — a double-quoted HTML attribute inside a double-quoted JS string — shipped in a single pass. The bundled verifier now runs this lint over the extracted script automatically; run it yourself as well anywhere you generate markup strings:

```python
BAD = re.compile(r'"[^"\n]*<[a-zA-Z][^"\n]*\s(?:style|class|id|href|src|title|data-[\w-]+)\s*=\s*"')
```

Deterministic, effectively zero false positives (escaped `\"` and single-quoted attributes don't match), and it catches a whole error class earlier and with a better message than `node --check` does.

**5e. Data-drift guard.** Any content appearing in more than one place — page and Big Picture, page and export, chart and readout — must assert that all copies agree. The better fix is structural: author it once as a data array (blueprint §23) and drift becomes impossible rather than merely detectable. Reach for the guard when you inherited static duplication you can't refactor now; reach for the array when you're still writing.

## 6. Behavioural assertions on interactive elements

"It rendered" is not a test. Every interactive element gets an assertion about **what it teaches** — and writing these is the fastest way to discover a demo that teaches the wrong thing, which is why this section is a design step disguised as a verification step. The standard, from real modules:

- temperature 0 never draws a tail token across 12 sampled runs — and temperature 1.2 draws one at least once;
- the causal mask covers exactly `n(n-1)/2` cells for the rendered n;
- every cost lever strictly reduces the total, and routing dominates caching at high settings;
- the span flagged as the culprit in the waterfall is genuinely the longest;
- dragging the reliability slider from max to min produces a monotonically decreasing success curve.

Each of those is a claim the module makes visually. If an assertion is awkward to write because the demo's outcome isn't well-defined, that *is* the finding: the demo has no lesson yet, and no amount of animation will give it one.

## 7. Extended state must not break the progress contract

If the module persists anything beyond `state.done` — a ticked checklist (blueprint §15b), a chosen tab, a slider position — assert:

1. both survive a **cold reload together**: seed a fresh DOM with a state blob containing stamps *and* ticks, then assert both render;
2. **neither write path clobbers the other**: tick a checklist item, then pass a quiz, then read storage and confirm both are present — then repeat in the opposite order, because the bug is usually asymmetric.

One writer, one key, one `saveState()` (blueprint §2). Two writers racing on one key is how a checklist quietly ate a learner's progress. The bundled verifier catches the general case (top-level keys present before boot must still be present after), but only your test knows what the extra keys mean.

## 8. Export fidelity

Where the module ships exports (blueprint §23):

- **Counts and key strings match the page** — the Markdown export contains the same number of table rows, panels, and checklist items as the rendered DOM, and the same headline strings. This is the assertion that proves exports are generated from the shared data arrays rather than re-typed; if it's hard to write, they were re-typed.
- **No HTML leaks into the Markdown** — assert the payload contains no `<` followed by a tag name.
- **The standalone HTML is standalone** — zero `<script>`, zero `<link>`, no `http://` or `https://` URLs. It is a document, not a second app.
- **Persisted ticks flow through** — tick two checklist items, generate the export, assert both appear ticked.
- **Both download paths work** — Blob URL *and* the data-URI fallback, since `file://` is the normal way these get opened.
