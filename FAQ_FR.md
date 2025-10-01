# FAQ – Assistant de Rédaction de Courriels (FR)

FAQ conversationnelle pour les questions courantes. Complément à `FEATURES_MAP_FR.md`.

---
## Général
**Q : Qu’est-ce que cet assistant ?**  
R : Un assistant bilingue (FR/EN) centralisant des modèles de courriels réutilisables avec variables dynamiques et réécriture assistée par IA.

**Q : Pour qui ?**  
R : Toute personne produisant des courriels répétitifs (clients, opérations) recherchant cohérence, gain de temps et qualité linguistique.

---
## Interface & Disposition
**Q : Pourquoi un panneau « Variables » flottant ?**  
R : Libère l’espace vertical, reste accessible durant l’édition et conserve la réactivité en déplaçant le DOM original.

**Q : Puis-je le déplacer et redimensionner ?**  
R : Oui. Glisser le bandeau teal pour déplacer; tirer le carré teal bas‑droite pour redimensionner.

**Q : Pourquoi s’enclenche-t-il sous le bandeau ?**  
R : Limite les chevauchements — zone magnétique avec tolérance 100 px.

**Q : Différence entre minimiser et fermer ?**  
R : Minimiser cache le contenu mais laisse le bandeau; fermer retire le panneau jusqu’à réouverture.

**Q : Que fait le bouton ⛶ ?**  
R : Auto-ajuste la taille selon le contenu + fenêtre.

**Q : La position est-elle mémorisée ?**  
R : Oui (localStorage).

---
## Langue & Bilinguisme
**Q : Comment changer la langue de l’interface ?**  
R : Basculer sur le commutateur FR / EN dans le bandeau.

**Q : Les modèles sont-ils tous bilingues ?**  
R : Chaque modèle peut avoir sujet + corps FR et EN; l’interface affiche la variante correspondante.

**Q : Accents dans les variables ?**  
R : Support complet (ex. `<<RéférenceDossier>>`).

---
## Modèles & Édition
**Q : Modifier un modèle modifie-t-il l’original ?**  
R : Non, vous travaillez sur une copie de brouillon.

**Q : Je veux tout réinitialiser — danger ?**  
R : Un modal de confirmation protège contre l’effacement involontaire.

---
## Variables
**Q : Comment sont détectées les variables ?**  
R : Double regex pour `<< >>` (Unicode) et `{{ }}` (héritage).

**Q : Le panneau n’apparaît pas…**  
R : Un panneau temporaire peut s’afficher; sinon exécuter `forceVarPopup()` dans la console.

**Q : Préremplir via URL ?**  
R : Prévu (ex. `...?vars=Client=ACME;NuméroProjet=12345`).

---
## IA
**Q : Capacités actuelles ?**  
R : Ajustement de ton, reformulation, assistance bilingue, condensation/extension.

**Q : Ma clé est-elle exposée ?**  
R : Non, les requêtes passent par un proxy serveur sécurisé.

**Q : Aperçu des différences avant validation ?**  
R : Fonctionnalité planifiée (diff / ghost text).

---
## Recherche, Favoris, Récents
**Q : Recherche actuelle ?**  
R : Correspondance mots-clés simples (titres / catégories).

**Q : À venir ?**  
R : Tolérance fautes, accents ignorés, abréviations, pondération par favoris / fréquence.

**Q : Favoris ?**  
R : Modèles épinglés manuellement pour accès rapide.

**Q : Récents ?**  
R : Historique passif pour reprendre rapidement.

---
## Export & Copie
**Q : Comment copier le sujet ou le corps ?**  
R : Pour l’instant via sélection classique. Boutons dédiés prévus.

**Q : Export Outlook direct ?**  
R : Planifié (mailto / Graph / .eml).

**Q : Formatage riche ?**  
R : Prévu (gras, listes, liens, placeholders stylés).

---
## Liens Profonds
**Q : Lien direct vers un modèle ?**  
R : Planifié (`...?t=cleModele`).

**Q : Forcer la langue par URL ?**  
R : Planifié (`...?lang=fr`).

---
## Fiabilité & Secours
**Q : Pourquoi autant de stratégies de détection ?**  
R : Safari / environnements intégrés retardent parfois l’hydratation DOM.

**Q : Et si tout échoue ?**  
R : Panneau placeholder + `forceVarPopup()` en dernier recours.

---
## Sécurité & Admin
**Q : Contrôle d’accès ?**  
R : Token Bearer (seed fichier / env). Rôles avancés planifiés.

**Q : Stockage des modèles ?**  
R : JSON serveur (migration DB avec audit à venir).

---
## Accessibilité
**Q : Accessible clavier ?**  
R : Boutons oui; amélioration navigation et ARIA en file d’attente.

---
## Feuille de Route Résumée
- Automatisation Outlook
- Snippets / capsules (signatures, clauses)
- Studio admin (gestion + métriques)
- Formatage riche
- Recherche fuzzy avancée
- Aperçu IA avec diff
- Liens profonds + préremplissage
- Exports (HTML / Markdown / .eml)
- Import variables par lot

---
## Dépannage Express
Problème | Solution
-------- | --------
Panneau variables absent | `forceVarPopup()` ou recharger
Panneau coupé sous le bandeau | Le faire glisser légèrement — il se repositionne
Taille perdue | Bouton ⛶ ou redimensionnement manuel
Panneau fermé | Recliquer « Variables »
Réponse IA lente | Vérifier connexion / proxy serveur

---
Version document : 1.0  (Script v1.5.3)
