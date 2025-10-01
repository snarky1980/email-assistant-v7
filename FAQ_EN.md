# FAQ – Email Writing Assistant (EN)

A conversational Q&A reference for common questions. Pair this with `FEATURES_MAP.md` for maximum clarity.

---
## General
**Q: What is this assistant?**  
A: A bilingual (FR/EN) assistant that centralizes reusable email templates, dynamic variables, and optional AI rewriting to speed up drafting while preserving precision.

**Q: Who is it for?**  
A: Anyone drafting repeatable client or operational emails who needs consistency, accurate terminology, and quick personalization.

---
## Interface & Layout
**Q: Why is there a floating “Variables” panel instead of an inline section?**  
A: It saves vertical space, stays accessible while editing, and preserves reactivity by moving (not cloning) the original DOM.

**Q: Can I move or resize the panel?**  
A: Yes. Drag the teal header to move; drag the teal square in the bottom-right corner to resize.

**Q: The panel jumps (snaps) when I release it near the top—why?**  
A: That’s a soft magnetic boundary ensuring it doesn’t hide behind the main banner. You get 100 px of upward leeway.

**Q: How do I minimize it without closing?**  
A: Click the — (minus) button; click again (or expand) to restore content.

**Q: What does the ⛶ (expand) button do?**  
A: Auto-fit: recalculates panel size to fit current content within the viewport.

**Q: Will the panel remember its position and size?**  
A: Yes—persisted in your browser’s localStorage.

---
## Language & Bilingual Features
**Q: How do I switch languages?**  
A: Use the FR / EN toggle in the header. Switch is immediate; no reload.

**Q: Are template contents bilingual by default?**  
A: Each template may hold FR and EN variants (subject + body). The UI presents the matching version based on the current interface language.

**Q: Can variable names include accents?**  
A: Yes. Both `<<NomClient>>` and `<<RéférenceDossier>>` work, as do legacy `{{client_name}}` forms.

---
## Templates & Editing
**Q: How do I choose a template?**  
A: Browse categories, search by keyword (basic now; fuzzy planned), or pick from Favorites / Recents (where implemented).

**Q: Can I safely reset my draft?**  
A: Yes. The Reset action triggers a confirmation modal to prevent accidental loss.

**Q: Does editing affect the stored master template?**  
A: No. You’re editing a working copy; master models are unchanged unless updated via admin tooling.

---
## Variables
**Q: How are variables detected?**  
A: Dual regex extraction for angled `<< >>` (Unicode-capable) and legacy `{{ }}` placeholders.

**Q: What if the variables panel doesn’t appear?**  
A: A placeholder panel appears after retries. You can also run `forceVarPopup()` in the browser console to manually trigger detection.

**Q: Can I prefill variables via a link?**  
A: Planned deep link syntax (e.g., `...?vars=Client=ACME;NuméroProjet=12345`).

---
## AI Assistance
**Q: What can the AI do today?**  
A: Tone adjustments, rewriting, translation assistance, concise vs. expanded variants (depending on prompts used).

**Q: Is my API key exposed?**  
A: No. All AI calls go through a secured backend proxy.

**Q: Can I see differences before accepting AI changes?**  
A: Inline diff / ghost preview is on the roadmap.

---
## Search, Favorites & Recents
**Q: How does search work now?**  
A: Keyword matching over template names, subjects, and categories.

**Q: What’s coming for search?**  
A: Fuzzy typo tolerance, accent folding, abbreviation and prefix matching, relevance scoring.

**Q: What are Favorites?**  
A: A quick-access list for templates you mark manually (weighting planned in ranking).

**Q: What are Recents?**  
A: A passive history of recently opened/used templates to resume work quickly.

---
## Export & Copying
**Q: How do I copy the subject or body?**  
A: Currently via standard selection and copy. Dedicated one-click buttons are planned (subject-only, body-only, combined).

**Q: Will I be able to export to Outlook directly?**  
A: Yes—planned integration via mailto / Graph API / .eml generation.

**Q: Will rich text formatting be supported?**  
A: Yes—planned editor upgrade (bold, lists, links, styled placeholders).

---
## Deep Links
**Q: Can I link directly to a template?**  
A: Planned: `...?t=templateKey`.

**Q: Can I force the interface language via URL?**  
A: Planned: `...?lang=fr` or `...?lang=en`.

---
## Reliability & Fallbacks
**Q: Why so many detection layers for the Variables panel?**  
A: Some environments (Safari, embedded browsers) hydrate DOM late; layered detection ensures eventual success.

**Q: What if everything fails?**  
A: The placeholder explains status; `forceVarPopup()` serves as a manual override.

---
## Security & Admin
**Q: How is access controlled?**  
A: Bearer tokens (file + environment seed). Future: role-based admin studio.

**Q: Where are templates stored?**  
A: JSON on the server (transition to database is roadmap item for auditability).

---
## Accessibility
**Q: Is the popup keyboard accessible?**  
A: Core controls are focusable; extended ARIA roles and keyboard drag alternative are on the improvement list.

---
## Roadmap Highlights
- Outlook automation
- Snippets / capsules (signatures, legal blocks)
- Admin studio (template CRUD + metrics)
- Rich text formatting
- Advanced fuzzy search & ranking
- Inline AI diff previews
- Deep link prefill & navigation
- Export formats: HTML / Markdown / .eml
- Variable bulk import (CSV / clipboard pairs)

---
## Troubleshooting Quick List
Issue | Try This
----- | --------
Variables panel missing | Run `forceVarPopup()` or reload (state preserved)
Panel stuck partly above header | Drag slightly down; it will snap below banner
Lost previous sizing | Use ⛶ to auto-fit or resize manually
Accidentally closed panel | Click Variables button again
AI response slow | Check network; backend proxy guards the external call

---
Document version: 1.0  (Script v1.5.3 at compilation)
