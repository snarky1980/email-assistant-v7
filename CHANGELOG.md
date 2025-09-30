# Changelog

All notable changes to this project will be documented here. The format loosely follows [Conventional Commits](https://www.conventionalcommits.org/) and semantic versioning.

## [1.5.3] - 2025-09-30
### Added
- Bilingual feature maps (`FEATURES_MAP.md`, `FEATURES_MAP_FR.md`).
- English & French FAQs (`FAQ_EN.md`, `FAQ_FR.md`).
- Visual architecture & lifecycle diagrams (`DIAGRAMS.md`).
- Magnetic snap for Variables popup (100px leeway) with smooth animation.
- Safari-resilient multi-layer detection refinements & placeholder fallback.
- `.nojekyll` to ensure static asset delivery on GitHub Pages.

### Changed
- Popup script refactored to clamp movement precisely at banner boundary.
- Favicon & branding assets replaced with Lumen identity (SVG/PNG/ICO + inline data URI fallback).
- Improved reset action with confirmation modal.
- LocalStorage key versioning to isolate layout/position persistence.

### Fixed
- Potential timing issues where popup failed to appear on slower renders.
- Header overlap / loss of panel behind sticky banner.

### Removed
- Temporary diagnostic overlay (was used to debug GitHub Pages 404).
- Legacy debug/version badge insertion.

### Security
- Continued use of backend AI proxy (no direct client-side API key exposure).

---
## [1.5.2] - 2025-09-29
### Added
- Initial clamp logic preventing panel from being dragged under the main header.

## [1.5.1] - 2025-09-29
### Added
- Extended Safari detection attempts; broadened button discovery.
- Placeholder shell panel fallback if extraction fails after retries.

## [1.5.0] - 2025-09-29
### Cleanup
- Removed unused legacy popup path & debug force-detect button.
- README overhaul documenting architecture and deployment.

---
## Versioning Strategy
Minor version increments (1.x.*) reflect feature additions and UX improvements; patch-style numbering retained for rapid iteration. Next planned milestone (1.6.0) will introduce rich text formatting + snippet scaffolding.

## Unreleased Roadmap Snapshot
- 1.6.0: Rich text editor, snippet capsules, early admin studio skeleton.
- 1.7.0: Advanced fuzzy search + deep links + bulk variable prefill.
- 1.8.0: Outlook draft automation (.eml / Graph integration) + inline AI diff.
