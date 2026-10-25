# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Coordinateur** : un membre de la famille (ou un proche) d'une personne qui vient de disparaître, souvent une personne âgée désorientée (maladie d'Alzheimer). Il agit dans l'urgence, sous stress, sur téléphone, souvent dehors. Son travail : lancer la battue en moins de 5 minutes, inviter les bénévoles, suivre l'avancement, exporter le journal pour la police, clôturer.
- **Bénévole** : voisin, ami, inconnu venu aider, de tout âge, qui reçoit un lien dans un groupe WhatsApp. Il doit être opérationnel en moins d'une minute : prénom, binôme, consignes, un secteur à fouiller, signaler ce qu'il voit.

## Product Purpose
Synchroniser les bénévoles d'une battue citoyenne autour du point de départ d'une disparition : qui fouille quel secteur, ce qui est fait, ce qui a été vu. L'outil ne suit pas la personne disparue et ne remplace ni la police ni le 17/112. Succès : une famille lance une battue coordonnée en moins de 5 minutes, sans aide.

## Positioning
Zéro installation, zéro compte : une page web, deux liens (coordinateur, bénévole). Le savoir de terrain des recherches de personnes désorientées est dans l'interface (secteurs proches prioritaires, « regarder sans appeler »). Éphémère : les données sont supprimées à la clôture.

## Operating Context
- Né de la recherche réelle d'Hélène, belle-mère de l'auteur, le 25 octobre 2026 à Champs-sur-Marne (personne retrouvée).
- Partage par groupe WhatsApp ; utilisation au soleil, en marchant, d'une main, parfois de nuit, réseau mobile parfois faible.
- Affiche imprimée avec QR code ; journal remis à la police ou à la gendarmerie.
- Partenaire visé : France Alzheimer (pilote en phase 4).

## Capabilities and Constraints
- Pages : accueil (`/`), création (`/nouvelle`), carte de la battue (`/r/<code>`), Leaflet + OpenStreetMap.
- HTML/CSS/JS vanilla, sans étape de build, servi par un Worker Cloudflare ; dépendances externes minimales (Leaflet, qrcode-generator chargé à la demande).
- France d'abord : adresses via la Base Adresse Nationale, numéros 17 et 112.
- Statuts de secteur : à faire, en cours, fait, signalement ; secteurs prioritaires ; binômes en retard.

## Brand Commitments
- Nom définitif : **Battue**, domaine battue.org. Aucun logo ni élément visuel existant.
- Signé par Damien Cirotteau, à titre personnel ; la mention « créé après la recherche d'un proche » est validée (sans nommer Hélène).
- Ton : calme et direct. Phrases courtes, vouvoiement, rassurant sans être mielleux ; l'urgence sans la panique.

## Evidence on Hand
- L'histoire réelle de la recherche d'Hélène (ROADMAP.md, dépôt recherche-helene).
- Aucun témoignage, chiffre d'usage, partenaire ou logo de presse : ne pas en inventer.

## Product Principles
- Chaque élément doit faire gagner du temps le jour J ; sinon il attend.
- Un seul écran par rôle ; aucune formation nécessaire.
- Toujours rappeler que les secours passent d'abord.
- Données minimales et éphémères.

## Accessibility & Inclusion
Utilisateurs âgés comme jeunes, sous stress, en extérieur au soleil : grands caractères, forts contrastes, cibles tactiles larges, pas d'information portée par la seule couleur.
