# Learning Module Builder

An agent skill for turning technical topics, repositories, pull requests, and documents into interactive HTML courses. Each course is a single file you can open in a browser, with plain-language explanations, quizzes, animated demos, glossary cards, progress tracking, and conversation prep.

## Use the skill

Clone this repository:

```sh
gh repo clone shanemiller89/learning-module-builder
```

Point your agent to `learning-module-builder/SKILL.md`, or place the whole repository in your agent's skill directory. Keep `SKILL.md`, `references/`, and `scripts/` together so the relative paths continue to work.

Example requests:

- "Use learning-module-builder to teach me how database indexes work. I'm a backend developer new to query planning."
- "Use learning-module-builder to help me understand this PR before a design review: <PR URL>."
- "Build a quick learning module on authentication versus authorization for our product team."

Include your audience, prior experience, desired depth, and any source files or links. The skill guides the agent through research, course planning, HTML creation, and verification.

## What's included

| File | Purpose |
| --- | --- |
| [SKILL.md](SKILL.md) | Main instructions, teaching principles, and workflow |
| [references/module-blueprint.md](references/module-blueprint.md) | Components, code patterns, and interaction contracts |
| [references/theming.md](references/theming.md) | Choosing a metaphor that explains the topic's mechanics |
| [references/palette.md](references/palette.md) | Category palettes, colour-vision checks, and shape cues |
| [references/personas.md](references/personas.md) | Tailoring explanations to engineers and executives |
| [references/verification.md](references/verification.md) | Mechanical, content, accessibility, and grounding checks |
| [scripts/verify-module.mjs](scripts/verify-module.mjs) | Automated checks for generated modules and candidate palettes |

## Verify a generated module

The verifier requires Node.js and `jsdom` for HTML checks. From this repository's root, install `jsdom` in a scratch directory and run the verifier against your generated file:

```sh
skill_dir="$PWD"
verification_dir="$(mktemp -d)"
cd "$verification_dir"
npm install jsdom
node "$skill_dir/scripts/verify-module.mjs" /absolute/path/to/module.html
```

The verifier resolves `jsdom` from the current working directory first. Keep scratch files separate from the course deliverable. Follow the rest of [the verification guide](references/verification.md) for module-specific behavior, source accuracy, numeric consistency, and visual review; the automated verifier does not cover all of those.

To check a candidate palette from the repository root, no `jsdom` installation is needed:

```sh
node scripts/verify-module.mjs --palette "#F6E3A5,#74C8F0,#2F8E86,#8E77DC" --bg "#0e0f13"
```

Generated courses use vanilla JavaScript without frameworks or CDN scripts. Optional Google Fonts have system fallbacks for offline use.
