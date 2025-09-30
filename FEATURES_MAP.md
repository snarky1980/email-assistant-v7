# Feature & Capability Map (User-Centric Guide)

A concise, skimmable master list of everything the Email Writing Assistant ("Lumen") offers today—plus what’s coming next. Use this as a map for discovery, onboarding, training, or quick reference. Nearly every bullet is intentionally action-oriented or outcome-focused.

---
## Table of Contents
- [1. Core Purpose](#1-core-purpose)
- [2. Interface & Ergonomics](#2-interface--ergonomics)
- [3. Bilingual Experience (FR / EN)](#3-bilingual-experience-fr--en)
- [4. Templates (Models)](#4-templates-models)
- [5. Categories & Organization](#5-categories--organization)
- [6. Variables & Dynamic Fields](#6-variables--dynamic-fields)
- [7. Editing Workflow](#7-editing-workflow)
- [8. AI Assistance](#8-ai-assistance)
- [9. Search & Discovery](#9-search--discovery)
- [10. Favorites & Recents](#10-favorites--recents)
- [11. Export / Copy Options](#11-export--copy-options)
- [12. Deep Links](#12-deep-links)
- [13. Resilience, Performance & Reliability](#13-resilience-performance--reliability)
- [14. Security & Admin Foundations](#14-security--admin-foundations)
- [15. Accessibility & UX Comfort](#15-accessibility--ux-comfort)
- [16. Power-User Touches](#16-power-user-touches)
- [17. Planned / Next Implementations](#17-planned--next-implementations)
- [18. Quick Reference Cheat Sheet](#18-quick-reference-cheat-sheet)

---
## 1. Core Purpose
- Centralizes **bilingual reusable email models** (templates) used by internal or client-facing teams.
- Ensures **consistency, accuracy, and linguistic correctness**.
- Accelerates drafting while preserving personalization via variable fields.
- Bridges human editing + AI augmentation in one workflow (no context switching).

## 2. Interface & Ergonomics
- Clean, padded layout with steady visual rhythm (balanced spacing, rounded radii consistent with brand system).
- **Sticky banner header**: key controls always visible.
- **Movable & resizable Variables popup** with persistent position/size across sessions (localStorage-backed).
- **Magnetic boundary**: popup snaps gently below the main banner if dragged upward (100 px soft leeway).
- **Single resize handle (bottom‑right)**: reduces visual clutter; large, teal, high‑contrast.
- **Minimize / Expand / Close controls** in popup header (compact cluster, no wasted width).
- **Auto-fit button**: intelligently re-sizes panel to fit content + viewport.
- Smooth scroll areas with **custom, thin teal scrollbar** (comfort + brand alignment).
- Subtle **backdrop blur** behind floating panel for depth without distraction.
- State persistence: open/closed + geometry survive page reloads.
- Fallback placeholder panel appears if dynamic app rendering delays underlying React mount (esp. Safari) – communicates status transparently.

## 3. Bilingual Experience (FR / EN)
- **Instant interface language switcher** (FR / EN toggle pill) – no reload required.
- Template data supports bilingual content (subject, body, variables). 
- Variable labels may appear in either language; interface remains consistent.
- All control labels (e.g., *Réinitialiser*, *Variables*) adapt per locale.

## 4. Templates (Models)
- Stored as structured JSON (ensures portability and ease of versioning).
- Each template may include:
  - Subject (FR / EN)
  - Body (FR / EN)
  - Category / grouping
  - Variables placeholders
  - Meta info (e.g., created or updated timestamp – internal usage).
- Rendered into editable zones for user personalization.
- Protected from accidental data loss via confirmation on destructive actions (e.g., reset flow).

## 5. Categories & Organization
- Templates grouped into **categories** to reduce mental scanning effort.
- Category creation inline (admin or power-user mode) – no separate configuration page needed.
- Category-driven filtering aids narrowing in large libraries.
- Visual & semantic grouping reduces cognitive load for new staff.

## 6. Variables & Dynamic Fields
- Supports two syntaxes for backward compatibility:
  - Angled: `<<NomClient>>`, `<<NuméroProjet>>`
  - Legacy double-curly: `{{client_name}}`
- Accented & Unicode characters fully supported (e.g., `<<RéférenceDossier>>`).
- Variable extraction uses dual regex pass; surfaces name set for editing/hints.
- Variables panel relocated (moved, not cloned) → **preserves React reactivity** (no stale event bindings).
- Auto-expands original collapsible when needed before extraction.
- Variables popup can be opened/closed without losing unsaved values.
- Planned compatibility for rich format validation (future enhancement placeholder).

## 7. Editing Workflow
- Editable subject & body fields placed prominently (banner context for purpose clarity).
- Reset function now protected by **confirmation modal** (reduces accidental erase).
- Inline feedback (e.g., placeholder panel or fallback button) when detection isn’t immediate.
- Smooth interplay between manual edits and potential AI rewrites.

## 8. AI Assistance
- Backend proxy to AI provider (OpenAI) hides API key & enforces perimeter.
- Supports sending current draft + structured instructions.
- Use cases:
  - Tone adjustment (formal ↔ neutral ↔ concise)
  - Bilingual rewriting or translation assistance
  - Summarization / expansion
- Future-ready for: style presets, compliance filters, guided chain-of-thought (not exposed to user).

## 9. Search & Discovery
(Current implementation summary — plus envisioned fuzzy refinements)
- Keyword search on template titles / subjects / category labels.
- Planned/Designed fuzzy matching logic examples:
  - Typo tolerance: `projet` → matches `project`, `projet`, `NuméroProjet`.
  - Partial prefix: `num` → `NuméroProjet`, `Numero client`.
  - Abbreviation: `ref dos` → `Référence Dossier`.
  - Accent-insensitive: `reference` → `Référence`.
- Potential ranking signals: recency, favorite weight, usage frequency (future).

## 10. Favorites & Recents
- Favorites: mark high-frequency templates for top-of-list fast access.
- Recents: passive history of last used – supports re-entry into in-progress drafting.
- Potential heuristics (planned): time-decay so stale templates fall back naturally.

## 11. Export / Copy Options
(Current + conceptual roadmap)
- Copy Subject – single click.
- Copy Body – single click (plain text).
- Copy Combined (Subject + Body + Variables summary) – planned.
- Export as formatted block (for pasting into Outlook / Gmail) – planned.
- Future: one-click `.eml` draft generation; optional HTML vs. plaintext toggle.
- Clipboard success feedback (subtle ephemeral status) – planned.

## 12. Deep Links
- Design intention: shareable links that pre-select a template or category.
- Pattern examples (planned):
  - `...?t=welcome_fr` → opens specific template.
  - `...?cat=onboarding` → filters list to “Onboarding” category.
  - `...?lang=en` → forces interface language on load.
  - `...?vars=NuméroProjet=12345;Client=ACME` → pre-fills variable fields.
- Enables onboarding guides, knowledge base, or LMS embedding.

## 13. Resilience, Performance & Reliability
- Multi-layer panel detection (interval retry + mutation observer + heuristic rescue + manual force function).
- Safari-specific extended attempts (acknowledges delayed DOM hydration behaviors).
- Placeholder shell ensures user is never “stuck waiting” without context.
- Aggressive cache busting for popup & favicons (`?v=` query + `no-store` headers).
- Local state isolation (localStorage keys namespaced with version token) – safe incremental migrations.

## 14. Security & Admin Foundations
- Bearer token authentication (file + env seeded) for administrative actions.
- Server acts as **controlled proxy** to AI provider (prevents direct client key leakage).
- JSON storage currently (portable & inspectable) → future move to DB with audit trails.
- Potential RBAC layering (admin vs. editor vs. consumer) future-ready.

## 15. Accessibility & UX Comfort
- Large interactive targets (buttons, resize handle) meet minimum dimension guidance.
- High-contrast teal + navy color pairing; avoids low-contrast grayscale dependence.
- Sticky header reduces pointer travel for high-frequency toggles.
- Modal confirmation uses focus management & ESC to dismiss.
- Planned: ARIA roles & landmarks on popup, improved keyboard-only drag substitute (arrow nudge), skip link to main editing region.

## 16. Power-User Touches
- Manual global `forceVarPopup()` escape hatch in console (diagnostic / fallback in odd embedding contexts).
- Persistent geometry encourages spatial muscle memory.
- Auto-fit recalculates natural height based on real rendered content (not naive line estimates).
- Intelligent collapse of original DOM footprint after extraction to reclaim vertical space.

## 17. Planned / Next Implementations
| Theme | Planned Feature | Benefit |
|-------|-----------------|---------|
| Automation | Outlook one‑click draft (MAPI / mailto / Graph API) | Eliminates manual copy/paste friction |
| Snippets / Capsules | Reusable micro-blocks (signatures, disclaimers, CTA blocks) | Compose modularly; reduces duplication |
| Admin Studio | Web dashboard for template CRUD, variable schema management, usage metrics | Empowers non-technical owners |
| Rich Text Formatting | Bold, italics, lists, links, placeholders with formatting guard | Higher-fidelity output; reduces off-platform editing |
| Advanced Fuzzy Search | Weighted multi-signal scoring (favorites boost, accent fold, typo distance) | Faster discovery at scale |
| Bulk Variable Prefill | Import from CSV / clipboard pairs | Reduces manual variable typing workload |
| Inline AI Suggestions | Ghost text / diff view vs. original | Safer acceptance of AI rewrites |
| Export Enhancements | .eml / HTML / Markdown export options | Multi-channel adaptability |
| Metrics & Audit | Usage counts, last-updated, orphan detection | Lifecycle governance |
| Accessibility Pass | ARIA labeling, focus traps, high-contrast alt theme | Inclusive experience |

## 18. Quick Reference Cheat Sheet
Action | How | Notes
------ | --- | -----
Open Variables | Click “Variables” (header button) | Remembers last open state
Move Panel | Drag teal header | Snaps below main banner when released above it
Resize Panel | Drag bottom-right teal square | Min width 480px / min height 300px
Auto-Fit | ⛶ button | Reflows content + clamps to viewport
Minimize | — button | Hides body, preserves header only
Close | ✕ button | Stored as closed; persists on reload
Reset Draft | Click “Réinitialiser” (then confirm) | Confirmation modal prevents accidental loss
Switch Language | FR / EN toggle pill | Immediate switch; no reload
Force Panel (debug) | `forceVarPopup()` in DevTools console | Rescue when detection failed
Copy Content (current) | Use native selection + copy | Dedicated buttons pending (see roadmap)

---
## Why This Matters
- Reduces onboarding time: everything structured & discoverable.
- Protects linguistic quality: consistent bilingual models.
- Encourages safe speed: guardrails (confirm modal, variable clarity) + AI assist.
- Scales gracefully: architecture anticipates fuzzy search, admin studio, export layers.

## Feedback Loop
Have an idea or friction point? Collect it under the upcoming **Admin Studio** feedback channel or file an internal issue referencing feature code names (e.g., `VAR_POPUP`, `AI_PROXY`, `SNIPPETS_PIPELINE`).

---
*Document version:* 1.0  
*Companion script version at time of writing:* v1.5.3  

> This companion file is intentionally user-facing and training-friendly. Keep the primary `README.md` focused on architecture & operational setup; evolve this file as features mature.
