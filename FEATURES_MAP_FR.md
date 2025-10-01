# Carte des Fonctionnalités (Guide Centré Utilisateur)

Version française complète de la carte fonctionnelle de l'assistant de rédaction de courriels. Référence rapide pour la formation, l'onboarding et l'exploitation quotidienne.

---
## Table des matières
- [1. Objectif Central](#1-objectif-central)
- [2. Interface & Ergonomie](#2-interface--ergonomie)
- [3. Expérience Bilingue (FR / EN)](#3-expérience-bilingue-fr--en)
- [4. Modèles (Templates)](#4-modèles-templates)
- [5. Catégories & Organisation](#5-catégories--organisation)
- [6. Variables & Champs Dynamiques](#6-variables--champs-dynamiques)
- [7. Flux d'Édition](#7-flux-déédition)
- [8. Assistance IA](#8-assistance-ia)
- [9. Recherche & Découverte](#9-recherche--découverte)
- [10. Favoris & Récents](#10-favoris--récents)
- [11. Options d’Export / Copie](#11-options-dexport--copie)
- [12. Liens Profonds (Deep Links)](#12-liens-profonds-deep-links)
- [13. Résilience & Performance](#13-résilience--performance)
- [14. Sécurité & Base Admin](#14-sécurité--base-admin)
- [15. Accessibilité & Confort](#15-accessibilité--confort)
- [16. Fonctions Power-User](#16-fonctions-power-user)
- [17. Prochaines Évolutions](#17-prochaines-évolutions)
- [18. Aide-mémoire Rapide](#18-aide-mémoire-rapide)

---
## 1. Objectif Central
- Centraliser des **modèles bilingues réutilisables**.
- Garantir cohérence, justesse linguistique et gain de temps.
- Personnalisation contrôlée via des variables.
- Combiner édition humaine + assistance IA sans changer d'outil.

## 2. Interface & Ergonomie
- Bandeau (header) collant toujours visible.
- **Fenêtre Variables flottante** : déplaçable et redimensionnable, état mémorisé.
- **Zone magnétique** : s'enclenche doucement sous le bandeau (tolérance 100 px).
- Une seule poignée de redimensionnement (coin bas‑droite), grande et contrastée.
- Boutons Minimiser / Adapter / Fermer intégrés au bandeau teal.
- **Auto-fit** : ajuste hauteur/largeur selon contenu + fenêtre.
- Défilement doux avec barre personnalisée fine teal.
- Persistance : position, taille, ouverture/fermeture.
- Panneau de secours (placeholder) si le rendu principal est retardé.

## 3. Expérience Bilingue (FR / EN)
- Commutateur immédiat d’interface FR ↔ EN.
- Champs de modèle (sujet, corps) stockés en double langue.
- Variables compatibles avec accents et caractères Unicode.
- Libellés d’actions adaptés (ex. « Réinitialiser », « Variables »).

## 4. Modèles (Templates)
- Stockage JSON structuré (portable, diff facile).
- Composants d’un modèle : sujet FR/EN, corps FR/EN, catégorie, variables.
- Préparation pour métadonnées (auteur, date modif, etc.).
- Rendu en zones éditables sûres.
- Confirmation avant action destructive (réinitialisation).

## 5. Catégories & Organisation
- Groupement logique pour réduire le temps de repérage.
- Création de catégorie possible inline (mode admin / évolutif).
- Filtrage par catégorie pour cibler rapidement.

## 6. Variables & Champs Dynamiques
- Deux syntaxes supportées : `<<NomClient>>` et `{{client_name}}`.
- Accents / caractères internationaux autorisés (ex. `<<RéférenceDossier>>`).
- Extraction via double regex → liste consolidée.
- Panneau déplacé (DOM move) → réactivité React conservée.
- Ouverture/fermeture sans perte de contenu.

## 7. Flux d'Édition
- Sujets & corps prioritaires visuellement.
- Réinitialisation protégée par modal de confirmation.
- Retour visuel clair quand le panneau variables est en attente.
- Prévu : messages toast de confirmation d’actions (copie, export...).

## 8. Assistance IA
- Proxy serveur → clé protégée côté backend.
- Cas d’usage : ton, reformulation bilingue, synthèse, extension.
- Architecture prête pour : styles préconfigurés, filtrage conformité.

## 9. Recherche & Découverte
- Recherche par mots-clés basique (titres / catégories) – extension fuzzy planifiée.
- Ciblages fuzzy envisagés :
  - Tolérance typos : `projet` ↔ `project`.
  - Préfixes : `num` → `NuméroProjet`.
  - Accents ignorés : `reference` → `Référence`.
  - Abréviations : `ref dos` → `Référence Dossier`.

## 10. Favoris & Récents
- Favoris : accès plus rapide aux modèles critiques.
- Récents : historique passif pour reprendre un brouillon.
- Pondération temporelle prévue (décroissance automatique).

## 11. Options d’Export / Copie
- Copie de sujet, corps (actuelle via sélection native, boutons dédiés prévus).
- Export combiné (Sujet + Corps + Résumé variables) planifié.
- Export `.eml`, HTML / Markdown → sur la feuille de route.

## 12. Liens Profonds (Deep Links)
- Objectif : partager un état précis (template, catégorie, langue, valeurs pré-remplies).
- Exemples prévus :
  - `...?t=accueil_fr`
  - `...?cat=onboarding`
  - `...?lang=en`
  - `...?vars=NuméroProjet=12345;Client=ACME`

## 13. Résilience & Performance
- Détection multi-couches (intervalle, observer, heuristique, fonction manuelle).
- Tentatives prolongées spécifiques Safari.
- Cache busting agressif (`?v=` + en-têtes `no-store`).
- Fallback clair au lieu d'une absence silencieuse.

## 14. Sécurité & Base Admin
- Authentification Bearer token (fichier + initialisation env).
- Proxy IA : surface d’attaque réduite, pas de clé côté client.
- Données persistées JSON (migration future DB possible).
- Préparé pour rôles différenciés (admin/éditeur/lecteur).

## 15. Accessibilité & Confort
- Cibles cliquables généreuses.
- Contrastes conformes (teal/navy). 
- Modal accessible (focus, ESC).
- Améliorations futures : navigation clavier complète du panneau, ARIA enrichi.

## 16. Fonctions Power-User
- `forceVarPopup()` pour forcer l’initialisation.
- Position et taille persistantes → mémoire spatiale.
- Auto-fit basé sur taille réelle du contenu.
- Réduction de l’espace occupé par l’ancien conteneur après extraction.

## 17. Prochaines Évolutions
| Thème | Fonction | Bénéfice |
|-------|----------|----------|
| Automatisation | Brouillon Outlook (Graph / mailto) | Réduit copier-coller |
| Snippets / Capsules | Blocs réutilisables (signature, clause) | Assemblage modulaire |
| Studio Admin | Interface gestion modèles & variables | Autonomie non-tech |
| Formatage Riche | Gras, listes, liens, placeholders stylés | Finesse rédactionnelle |
| Recherche Avancée | Pondération fuzzy + favoris | Découverte rapide |
| Préremplissage Variables | Import CSV / paires presse-papiers | Gain de temps |
| Suggestions IA Inline | Ghost text + diff | Adoption contrôlée |
| Export Étendu | .eml / HTML / Markdown | Multicanal |
| Métriques & Audit | Fréquence, obsolescence | Gouvernance |
| Accessibilité Avancée | ARIA, focus trap complet | Inclusion |

## 18. Aide-mémoire Rapide
Action | Comment | Note
------ | ------ | ----
Ouvrir Variables | Bouton « Variables » | Mémorise l'état
Déplacer | Glisser le bandeau teal | Enclenchement magnétique
Redimensionner | Poignée coin bas‑droite | Min 480×300
Adapter | Bouton ⛶ | Ajuste à la fenêtre
Minimiser | Bouton — | Cache le corps
Fermer | Bouton ✕ | Persiste fermé
Réinitialiser | « Réinitialiser » + confirmer | Modal sécurité
Changer langue | Bascule FR / EN | Instantané
Forcer panneau | `forceVarPopup()` | Diagnostic

---
*Version du document :* 1.0  
*Version script au moment de rédaction :* v1.5.3  

> Fichier compagnon francophone — maintenir en cohérence avec `FEATURES_MAP.md`.
