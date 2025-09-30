# Visual Diagrams / Diagrammes Visuels

Mermaid-based diagrams (renderable in many markdown viewers or via extensions). EN + FR captions.

## 1. High-Level Architecture / Architecture Haut Niveau
```mermaid
flowchart LR
  subgraph Browser[Browser / Navigateur]
    UI[React App UI]
    VAR[Variables Popup Script]
    LS[(localStorage)]
  end
  subgraph Server[Node.js Express Server]
    API[/Templates & Categories API/]
    AUTH[/Token Auth/]
    VARX[/Variable Extraction/]
    AIPROXY[/AI Proxy Endpoint/]
    JSON[(JSON Files)]
  end
  subgraph OpenAI[External AI]
    AI[(LLM)]
  end

  UI -->|fetch templates| API
  UI -->|fetch categories| API
  UI -->|auth bearer| AUTH
  VAR -->|moves panel DOM| UI
  VAR -->|persist state| LS
  UI -->|/extractVariables| VARX
  UI -->|/ai/proxy| AIPROXY --> AI
  API --> JSON
  AUTH --> JSON
  VARX --> JSON
  AIPROXY --> JSON
```

**EN:** The browser hosts the reactive app. The popup script augments UI post-render without breaking event bindings. Server supplies template/category data, variable parsing, token auth, and an AI proxy isolating the external key.  
**FR:** Le navigateur héberge l’application réactive. Le script du panneau ajoute la couche flottante sans casser les événements. Le serveur fournit données, extraction, authentification et un proxy IA protégeant la clé.

---
## 2. Variables Panel Detection Lifecycle / Cycle de Détection du Panneau des Variables
```mermaid
sequenceDiagram
  participant S as Script
  participant D as DOM
  participant O as Observer
  participant H as Heuristic
  participant U as User

  S->>D: Interval scan (find toggle + panel)
  alt Found early
    S->>D: Transform panel (move + style)
  else Not yet
    S->>O: Start MutationObserver
    O-->>S: Added nodes detected
    alt Panel pattern recognized
      S->>D: Transform panel
    else Timeout / still none
      S->>H: Heuristic rescue search
      H-->>S: Best candidate
      alt Candidate found
        S->>D: Transform panel
      else Nothing
        S->>D: Build placeholder shell
      end
    end
  end
  U->>S: (Optional) forceVarPopup()
  S->>D: Manual transformation or placeholder
```

**EN:** Multi-layer fallback prevents user confusion if late hydration or structural shifts occur.  
**FR:** Strates multiples évitent la confusion utilisateur en cas d’hydratation tardive ou de structure variable.

---
## 3. Magnetic Snap Behavior / Comportement d’Enclenchement Magnétique
```mermaid
flowchart TD
  A[User drags panel upward] --> B{Panel top < Banner bottom?}
  B -- No --> C[Free movement]
  B -- Yes --> D{Within leeway (≤100px above)?}
  D -- Yes --> E[Allow temporary overlap]
  E --> F[Mouseup]
  F --> G[Animate snap to boundary]
  D -- No --> H[Clamp immediately]
  H --> G
```

**EN:** Panel can float into a tolerance band for spatial feedback; release triggers smooth snap.  
**FR:** Le panneau peut entrer dans la zone tolérée; au relâchement il s’aligne doucement.

---
## 4. Roadmap Evolution Overview / Vue d’Ensemble de l’Évolution Planifiée
```mermaid
gantt
  dateFormat  YYYY-MM-DD
  title Roadmap (Indicative) / Feuille de route (Indicatif)
  section Core Enhancements
  Rich Text Editor          :active, rte, 2025-10-01, 30d
  Advanced Fuzzy Search     :search, after rte, 25d
  Outlook Automation        :outlook, after search, 20d
  section Expansion
  Snippets / Capsules       :snip, 2025-11-15, 20d
  Admin Studio              :admin, after snip, 30d
  Bulk Variable Prefill     :bulk, after admin, 15d
  section Intelligence
  Inline AI Diff Preview    :aiDiff, 2025-12-20, 20d
  Metrics & Audit Layer     :metrics, after aiDiff, 25d
```

**EN:** Indicative sequence, real delivery may reorder based on impact / dependency.  
**FR:** Séquence indicative; l’ordre réel peut changer selon impacts et dépendances.

---
## 5. Deep Link Concept / Concept de Lien Profond
```mermaid
classDiagram
  class DeepLinkParameters {
    lang: fr|en
    t: templateKey
    cat: categorySlug
    vars: key1=value1;key2=value2
    view: compact|full
  }
  class AppRouter {
    +parse(query)
    +applyState(params)
  }
  DeepLinkParameters <|-- AppRouter
```

**EN:** A minimal param grammar enables shareable, reproducible UI states.  
**FR:** Une grammaire de paramètres minimale permet des états d’interface partageables et reproductibles.

---
*Document version:* 1.0  (Script v1.5.3)
