---
name: sl-frontend-design
description: 'Build web interfaces with genuine design quality, not AI slop. Use for any frontend work - landing pages, web apps, dashboards, admin panels, components, interactive experiences. Activates for both greenfield builds and modifications to existing applications. Detects existing design systems and respects them. Covers composition, typography, color, motion, and copy. Verifies results via screenshots before declaring done.'
---

# Frontend Design

Guide creation of distinctive, production-grade frontend interfaces that avoid generic AI aesthetics. This skill covers the full lifecycle: detect what exists, plan the design, build with intention, and verify visually.

## Authority Hierarchy

Every rule in this skill is a default, not a mandate.

1. **Existing design system / codebase patterns** -- highest priority, always respected
2. **User's explicit instructions** -- override skill defaults
3. **Skill defaults** -- apply in greenfield work or when the user asks for design guidance

When working in an existing codebase with established patterns, follow those patterns. When the user specifies a direction that contradicts a default, follow the user.

## Workflow

```
Detect context -> Plan the design -> Build -> Verify visually
```

---

## Layer 0: Context Detection

Before any design work, examine the codebase for existing design signals. This determines how much of the skill's opinionated guidance applies.

### What to Look For

- **Design tokens / CSS variables**: `--color-*`, `--spacing-*`, `--font-*` custom properties, theme files
- **Component libraries**: shadcn/ui, Material UI, Chakra, Ant Design, Radix, or project-specific component directories
- **CSS frameworks**: `tailwind.config.*`, `styled-components` theme, Bootstrap imports, CSS modules with consistent naming
- **Typography**: Font imports in HTML/CSS, `@font-face` declarations, Google Fonts links
- **Color palette**: Defined color scales, brand color files, design token exports
- **Animation libraries**: Framer Motion, GSAP, anime.js, Motion One, Vue Transition imports
- **Spacing / layout patterns**: Consistent spacing scale usage, grid systems, layout components

Use the platform's native file-search and content-search tools (e.g., Glob/Grep in Claude Code) to scan for these signals. Do not use shell commands for routine file exploration.

### Mode Classification

Based on detected signals, choose a mode:

- **Existing system** (4+ signals across multiple categories): Defer to it. The skill's aesthetic opinions (typography, color, motion) yield to the established system. Structural guidance (composition, copy, accessibility, verification) still applies.
- **Partial system** (1-3 signals): Follow what exists; apply skill defaults only for areas where no convention was detected. For example, if Tailwind is configured but no component library exists, follow the Tailwind tokens and apply skill guidance for component structure.
- **Greenfield** (no signals detected): Full skill guidance applies.
- **Ambiguous** (signals are contradictory or unclear): Ask the user before proceeding.

### Asking the User

When context is ambiguous, use `AskUserQuestion` (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded). Fall back to presenting options in chat only if it is unavailable or the call errors. Never silently skip. If the user declines to pick, assume "partial" mode and proceed conservatively.

Example question: "I found [detected signals]. Should I follow your existing design patterns or create something distinctive?"

---

## Layer 1: Pre-Build Planning

Before writing code, write three short statements. These create coherence and give the user a checkpoint to redirect before code is written.

1. **Visual thesis** -- one sentence describing the mood, material, and energy
   - Greenfield examples: "Clean editorial feel, lots of whitespace, serif headlines, muted earth tones" or "Dense data-forward dashboard, monospace accents, dark surface hierarchy"
   - Existing codebase: Describe the *existing* aesthetic and how the new work will extend it

2. **Content plan** -- what goes on the page and in what order
   - Landing page: hero, support, detail, CTA
   - App: primary workspace, nav, secondary context
   - Component: what states it has, what it communicates

3. **Interaction plan** -- 2-3 specific motion ideas that change the feel
   - Not "add animations" but "staggered fade-in on hero load, parallax on scroll between sections, scale-up on card hover"
   - In an existing codebase, describe only the interactions being added, using the existing motion library

---

## Layer 2: Design Guidance Core

Read `references/design-core.md` before building. It carries the cross-cutting principles -- typography, color/theme, composition, motion, accessibility, imagery -- plus the creative-energy framing that pushes past formulaic output. These are the substance of the skill's opinion; skipping them yields generic AI-slop defaults (Inter on white, purple accents, card grids) this skill exists to prevent. Every principle still yields to the authority hierarchy above.

---

## Context Modules

Read `references/context-modules.md` and apply the one module that fits what is being built: Module A (landing/marketing, greenfield), Module B (apps/dashboards, greenfield), or Module C (components/features in an existing app -- the default when working inside an existing application). Each module carries its own section sequence, layout defaults, and copy voice. Skipping it means building a landing page with dashboard patterns, or a dashboard with marketing copy.

---

## Quality Rules & Visual Verification

Read `references/quality-checks.md` before and after building. It carries the hard rules and anti-patterns (default-against list plus the non-negotiable quality floor), the pre-verification litmus checks, and the visual-verification flow with its tool-preference cascade (existing project tooling -> browser MCP -> agent-browser -> mental review). Skipping the verification cascade ships unscreenshot work; skipping the quality floor ships broken contrast, missing focus states, and AI commentary leaking into the UI.

If the verification step produced a screenshot, include it in the deliverable. For iterative refinement beyond a single pass, see the `sl-design-iterator` agent.
