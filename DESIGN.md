---
name: Battue
description: Le plan de ville pliant quadrillé, mis au service d'une battue citoyenne.
colors:
  grid: "#c8102e"
  grid-deep: "#a50d26"
  grid-soft: "rgba(200,16,46,.28)"
  road: "#f5c842"
  park-ink: "#2c7a3a"
  park-deep: "#1f5c2a"
  street: "#f2a38a"
  water: "#7fb8e2"
  park: "#b9dc9f"
  wa: "#1d7f45"
  wa-deep: "#166637"
  focus: "#1f5fbf"
  ink: "#141414"
  ink-2: "#424242"
  ink-soft: "#333333"
  paper: "#f8f9f7"
  sheet: "#ffffff"
  hairline: "#d8d8d3"
  sheet-hover: "#efefea"
  dots: "#8f8f89"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 10vw, 4.5rem)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 66"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.9rem"
    fontWeight: 800
    lineHeight: 1.05
    fontVariation: "'wdth' 70"
  heading:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'wdth' 70"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 800
    lineHeight: 1.1
    fontVariation: "'wdth' 70"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.03em"
    fontVariation: "'wdth' 80"
  base:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.4
  small:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.3
  caption:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 700
    lineHeight: 1.25
    fontVariation: "'wdth' 80"
  margin-index:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'wdth' 80"
rounded:
  none: "0"
  sm: "3px"
  pill: "999px"
spacing:
  margin: "28px"
  margin-wide: "36px"
  cell: "64px"
  cell-wide: "80px"
  cartouche: "1.25rem"
  section: "4rem"
components:
  button:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.6em 1.1em"
    height: "48px"
  button-primary:
    backgroundColor: "{colors.grid}"
    textColor: "{colors.sheet}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.6em 1.1em"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.grid-deep}"
  button-big:
    height: "58px"
  button-done:
    backgroundColor: "{colors.park-ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.sm}"
  button-go:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.sm}"
  button-wa:
    backgroundColor: "{colors.wa}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.sm}"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0.7rem 0.8rem"
  cartouche:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "{spacing.cartouche}"
  emergency-number:
    textColor: "{colors.grid}"
    rounded: "{rounded.pill}"
    height: "44px"
    width: "52px"
  status-swatch:
    backgroundColor: "{colors.sheet}"
    size: "44px"
---

# Design System: Battue

## Overview

**Creative North Star : « Le plan de ville pliant »**

Battue est un plan de ville quadrillé à la Blay-Foldex : papier offset blanc froid, cadre de marge lettré A, B, C… et numéroté 1, 2, 3… en rouge plan, filets de carroyage rouges, rues saumon, grands axes jaunes, eau bleue, parcs verts, texte noir en grotesque condensée de cartographe. Les secteurs de la battue sont les carreaux du plan ; chaque état d'un secteur s'écrit comme une légende de plan, par un motif et un mot, jamais par la couleur seule.

Le monde est dense et lisible au soleil : grands caractères (corps 18 px), filets noirs de 2 px partout, cibles tactiles de 48 px minimum. Les éléments d'interface sont des « cartouches » : des cadres blancs à filet noir posés sur le plan. L'accueil (Persuade) déplie le plan en plein écran ; la création et la carte (Operate) héritent du monde avec retenue, la carte Leaflet étant désaturée pour que le carroyage rouge et les aplats de statut restent maîtres.

Rejets confirmés par le contrat de direction : l'avis de recherche rouge alarmiste et la page SaaS bleue à cartes arrondies.

**Key Characteristics:**
- Carroyage rouge et index de marge lettré/numéroté comme signature, y compris en direct sur la carte (l'index suit le déplacement).
- Cartouches blancs à filet noir de 2 px, coins nets ou à peine adoucis (3 px).
- Capitales condensées d'Archivo (largeur 66 à 85 %) pour la voix du plan ; Archivo pleine largeur pour la lecture.
- Statuts = motif + mot : carreau nu, aplat jaune, hachure verte, rouge plein, double filet noir, tirets rouges.
- Icônes au trait 24 × 24, trait 2, une seule épaisseur.

## Colors

La palette est celle d'un plan imprimé : un rouge de carroyage, les teintes d'aplat de la cartographie, et le noir d'imprimerie sur blanc.

### Primary
- **Rouge plan** (`grid`) : filets de carroyage, lettres et numéros de marge, bouton d'action principal (« Lancer la battue », « Signaler », « Inviter »), numéros d'urgence cerclés, puces de listes ordonnées, statut « signalement », retard en tirets. Survol : **Rouge plan foncé** (`grid-deep`).
- **Rouge plan voilé** (`grid-soft`) : filets fins du quadrillage de l'accueil, bord intérieur de l'index de marge, sous-lignage discret.

### Secondary
- **Jaune grand axe** (`road`) : statut « en cours » (aplat), sélection de texte, un quart de la marque.
- **Vert parc encre** (`park-ink`) : hachure du statut « fait », bouton « Terminé », pastille « En direct », lien vers son propre secteur. Survol : **Vert parc foncé** (`park-deep`).

### Tertiary
- **Saumon rue** (`street`), **Bleu eau** (`water`), **Vert parc** (`park`) : teintes du plan dessiné de l'accueil, écrites dans `plan.svg` (pas de variable CSS : une image de fond ne lit pas les variables de la page) ; réservées au fond cartographique, jamais à l'interface.
- **Vert WhatsApp** (`wa`) : uniquement le bouton de partage vers WhatsApp. Survol : **Vert WhatsApp foncé** (`wa-deep`).
- **Bleu repère** (`focus`) : anneau de focus clavier (3 px), carreau sélectionné sur la carte (trait 5 px), position « Moi ». Seul bleu du système, réservé à « ici et maintenant ».

### Neutral
- **Encre** (`ink`) : texte, filets de 2 px de tous les cadres, champs et boutons, statut prioritaire, cercles de distance.
- **Encre seconde** (`ink-2`) : indications, messages, mentions de pied.
- **Papier** (`paper`) : fond de page et de carte, boutons discrets.
- **Feuille** (`sheet`) : cartouches, champs, boutons secondaires, barres hautes.
- **Filet fin** (`hairline`) : séparateurs de listes et de fiches (1 px), partout le même gris.
- **Pointillé** (`dots`) : points de conduite de l'index et bordure tiretée de l'ajout de lieu.
- **Encre douce** (`ink-soft`) et **Feuille survolée** (`sheet-hover`) : survols du bouton noir et des boutons blancs.

Les couleurs de la carte (carroyage, encre, repère, aplat « en cours », hachure « fait ») sont lues dans ces variables par le JavaScript : une seule source.

### Named Rules
**La règle du rouge de carroyage.** Le rouge trace la grille, numérote la marge et porte l'action principale ou l'alerte ; il ne remplit jamais un fond de page ni un bandeau. Un écran rouge serait l'avis de recherche alarmiste que Battue refuse.

**La règle de la légende.** Aucun statut n'est porté par la couleur seule : chaque état a un motif (nu, aplat, hachure, plein, double filet, tirets) et un mot.

## Typography

**Display Font:** Archivo, variable auto-hébergée (OFL), largeur 62–125 %, graisse 100–900 (repli system-ui)
**Body Font:** Archivo, même fichier, largeur normale
**Label/Mono Font:** Archivo condensée (80 %), chiffres tabulaires pour les numéros et références

**Character :** Une seule famille, la grotesque de cartographe : condensée en capitales pour nommer comme un plan nomme, pleine largeur pour expliquer comme une notice.

Chaque taille est une variable `--fs-*` de `style.css` (headline, heading, title, body, label, base, small, caption) ; `h1` et `h2` gardent leur valeur écrite pour rester lisibles par le détecteur.

### Hierarchy
- **Display** (800, clamp 2.5–4.5rem, 0.95, largeur 66 %, capitales) : la question du cartouche d'accueil, le titre de la création.
- **Headline** (800, 1.9rem, 1.05, largeur 70 %, capitales) : titres de sections, chiffres clés de l'admin.
- **Heading** (800, 1.5rem, 1, largeur 70 %, capitales) : titres des fenêtres et des fiches de carreau, marque.
- **Title** (800, 1.35rem, 1.1, largeur 70 %, capitales) : légendes de groupes de champs, filet noir dessous ; gros bouton, numéros d'urgence, marque de la barre de carte. Les sous-titres de fenêtre prennent la taille Label (72 %).
- **Body** (400, 1.125rem, 1.5) : texte courant, champs, chapeau ; mesure 62ch.
- **Base** (400, 1rem) : corps de la carte et de ses fiches, indications sous les champs, messages.
- **Small** (0.9rem) : légende et horloge de la carte, libellés des fiches, petits boutons, notes de l'admin.
- **Caption** (700, 0.85rem, largeur 80 %) : puces d'état, en-têtes de tableau, libellés des outils de barre, étiquettes du plan. Rien en dessous, sauf les noms de carreaux dessinés sur la carte (px) et l'affiche imprimée (pt).
- **Label** (700, 1.05rem, +0.03em, largeur 80 %, capitales) : boutons, liens d'outils, références d'index.
- **Margin index** (700–800, Caption à Small, largeur 80 %, rouge plan) : lettres et numéros de marge, sur accueil et carte.

### Named Rules
**La règle de la voix du plan.** Ce qui nomme (titres, boutons, secteurs, marge) est en capitales condensées 66–85 % ; ce qui explique reste en bas de casse pleine largeur. Jamais de capitales condensées pour une phrase.

## Layout

L'unité est le carreau. Sur l'accueil, un cadre de marge (`margin`, 28 px, 36 px dès 760 px) entoure le plan ; le quadrillage suit `cell` (64 px, 80 px dès 760 px) et les lettres/numéros occupent la marge, centrés sur chaque carreau. Le cartouche d'action se pose au tiers inférieur sur mobile (au pouce), en bas à gauche sur grand écran (31rem max). Le contenu éditorial suit en colonne unique (44rem, sections espacées de 4rem) ; la création en colonne de 36rem.

La carte est plein écran : barre d'outils blanche en haut (filet noir dessous), index de marge vivant collé aux bords haut (22 px) et gauche (24 px), et en bas à droite un dock au pouce : bouton « Signaler » au-dessus du cartouche de légende. Le dock s'efface quand une fiche est ouverte. Un seul point de rupture d'interface par page : 640 px (carte) ou 760 px (accueil).

### Named Rules
**La règle de l'index de marge.** Toute vue du quadrillage porte son index : lettres en haut, numéros à gauche, en rouge plan, alignés sur les centres des carreaux visibles.

## Elevation & Depth

Le plan est plat ; seuls les cartouches posés dessus s'en détachent, par une ombre douce et diffuse, jamais décalée en dur. Les fenêtres modales ont une ombre plus profonde et un voile d'encre. Sur la carte, les étiquettes de carreaux se détachent par un halo blanc, comme les noms de rues d'un plan imprimé.

### Shadow Vocabulary
- **Cartouche posé** (`box-shadow: 0 6px 18px rgba(20,20,20,.18)`) : cartouches, fiches, contrôle de zoom, bouton « Signaler ».
- **Fenêtre** (`box-shadow: 0 10px 40px rgba(20,20,20,.35)`, voile `rgba(20,20,20,.45)`) : dialogues.
- **Halo de plan** (`text-shadow: 0 0 3px #fff ×2, 0 0 4px #fff ×2`) : étiquettes de carreaux sur la carte.

### Named Rules
**La règle du papier posé.** L'ombre signifie « posé sur le plan », pas « cliquable ». Les boutons n'ont pas d'ombre, sauf l'action d'urgence flottante.

## Shapes

Formes d'imprimerie : rectangles et filets. Les cartouches ont des coins nets (0) ; boutons, champs, fiches et fenêtres ont un coin à peine adouci (3 px). Le filet noir de 2 px est le trait d'union de tout le système ; 1 px pour les séparateurs, 3 px pour le cadre « prioritaire ». Les seules formes rondes sont les numéros d'urgence cerclés (pilule 999 px), le point de départ et les cercles de distance en tirets, comme les repères d'un plan.

## Components

### Buttons
Des étiquettes de plan : capitales condensées dans un filet noir.
- **Shape :** coin à peine adouci (3 px), filet 2 px, hauteur 48 px minimum (58 px en grande taille).
- **Primary :** rouge plan plein, texte blanc ; un seul par écran.
- **Défaut :** feuille blanche, filet encre ; survol gris papier (`#efefea`) ; appui : descente de 1 px (0.15s ease-out).
- **Variantes de fiche :** encre pleine (« J'y vais »), vert parc encre (« Terminé »), papier (discret) ; vert WhatsApp pour le partage.
- **Outils de barre :** icône 24 px au-dessus d'un libellé Caption (0.85rem), 52 × 52 px, filet transparent qui apparaît au survol ; icône à gauche dès 640 px.

### Inputs / Fields
- **Style :** feuille blanche, filet encre 2 px, 3 px de coin, corps 1.125rem ; libellé gras au-dessus, indication en encre seconde.
- **Focus :** contour bleu repère 3 px, décalé de 1–2 px.
- **Case à cocher :** 28 px, teinte rouge plan.
- **Erreur :** message en rouge plan gras sous le formulaire.

### Cartouche
Le cadre blanc à filet noir posé sur le plan : accueil (action), légende de la carte, écran « recherche clôturée ». Coins nets, ombre « cartouche posé », marge intérieure 1.25rem. Les fiches Leaflet et les fenêtres sont des cartouches à 3 px de coin.

### Numéros d'urgence
Le 17 et le 112 sont des boutons d'appel cerclés : pilule à filet rouge 2 px, chiffres 800 tabulaires, 44 px de haut ; plein rouge au survol. Présents sur chaque écran.

### Carreau de statut (signature)
Le même vocabulaire en trois tailles (carte Leaflet, démo de l'accueil, pastilles de légende de 14 et 44 px) :
- **À faire :** carreau nu, filet rouge fin.
- **En cours :** aplat jaune grand axe.
- **Fait :** hachure verte à 45°.
- **Signalement :** rouge plan plein (voilé à 42 % sur la carte).
- **Prioritaire :** double filet noir (trait 3 px + filet intérieur fin).
- **En retard :** contour rouge en tirets.
- **Sélectionné :** trait bleu repère 5 px.

### Index de marge
Bandes semi-opaques blanches (88 %) aux bords de la carte, lettres et numéros en rouge plan 800 condensé, recalculés à chaque déplacement ; sur l'accueil, cadre blanc lettré sur les quatre côtés.

### Index « comme au dos du plan »
Listes de type index des rues : terme en gras, points de conduite pointillés, référence en rouge capitales tabulaires, filet encre en tête et filets fins entre lignes.

### Navigation
Marque (carreau 2 × 2 à filet noir : un quart hachuré vert, un quart jaune, filets rouges) + nom en capitales condensées. Accueil : marque et « Mode d'emploi » en étiquettes blanches à filet noir. Création : barre blanche à filet noir dessous. Carte : barre d'outils, marque seule sous 640 px.

### Icônes
Pictogrammes au trait d'après Lucide, 24 × 24, trait 2, extrémités arrondies, couleur `currentColor`, servis par un sprite SVG ; 1.25em dans le texte.

## Do's and Don'ts

### Do:
- **Do** poser toute interface sur le plan comme un cartouche blanc à filet noir de 2 px.
- **Do** écrire chaque statut par un motif et un mot, avec le même vocabulaire sur la carte, la démo et la légende.
- **Do** accompagner tout quadrillage de son index de marge rouge.
- **Do** garder le 17 et le 112 cerclés et appelables sur chaque écran.
- **Do** utiliser les capitales condensées d'Archivo pour nommer, la pleine largeur pour expliquer.
- **Do** tenir les cibles tactiles à 44 px minimum (48 px pour les boutons) et le corps de texte à 1.125rem.
- **Do** désaturer le fond cartographique (`saturate(.55)`) pour que carroyage et statuts dominent.

### Don't:
- **Don't** remplir un fond ou un bandeau de rouge plan : pas d'avis de recherche alarmiste.
- **Don't** faire une page SaaS bleue à cartes arrondies et ombrées ; le bleu repère reste réservé au focus et à « ici ».
- **Don't** porter une information par la seule couleur.
- **Don't** utiliser les teintes du plan (saumon, eau, parc) pour l'interface.
- **Don't** utiliser d'ombre décalée en dur ni d'arrondi supérieur à 3 px, hors pilules d'urgence et repères ronds.
- **Don't** mélanger les épaisseurs d'icônes ni utiliser des caractères comme icônes.
