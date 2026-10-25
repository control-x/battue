# Battue — revue technique ciblée (25 octobre 2026)
**Statut : recommandations pour agent de code ; aucun correctif appliqué.** Examen statique du dépôt `control-x/battue`, branche `main`. Pas de test d'exécution, de charge, de sécurité dynamique ni de consultation de la facture Cloudflare. Conserver l'architecture Workers + Durable Objects, et le budget cible de 10 €/mois.

## P1 — Authentification WebSocket et état affiché
**Fichiers :** `src/worker.js` (`Search.fetch /ws`, `webSocketMessage`), `public/app.html` (`connectWs`).
- Le serveur accepte un WebSocket avant le premier message `auth`; aucune expiration d'authentification n'est visible. Un client peut rester connecté sans rôle. Implémenter un timeout d'authentification compatible avec WebSocket Hibernation, et une limite de connexions si nécessaire ; tester le comportement après hibernation/réveil.
- Le client positionne `wsLive=true` et affiche « En direct » dès `onopen`, avant confirmation de `auth`. Passer à l'état « En direct » uniquement après réception d'un état authentifié valide. En cas d'erreur de parsing ou de socket silencieux, revenir à l'HTTP.
- Tester : jeton invalide, socket sans message auth, coupure Wi-Fi, changement réseau, onglet suspendu, fermeture de battue.

## P1 — Protection contre abus
**Fichier :** `src/worker.js`, `reportAbuse`.
- `POST /api/report` valide la forme du code mais ne limite pas le débit et n'exige pas que la battue existe. Peut déclencher de nombreuses notifications ntfy. Ajouter rate limiting Cloudflare adapté au plan et/ou déduplication/cooldown ; vérifier l'existence du code si cela reste peu coûteux. Ne pas exposer le motif en clair dans des logs supplémentaires.
- Examiner également `POST /api/new` : création publique sans compte, pouvant provoquer coûts, stockage et notifications. Prévoir protection anti-automatisation peu intrusive, sans empêcher un usage urgent.
- Tester le seuil choisi et l'absence de blocage des utilisateurs légitimes.

## P1 — Géolocalisation des signalements
**Fichier :** `src/worker.js`, `POST /point`.
- Le serveur vérifie seulement `isFinite(lat/lng)`, sans bornes [-90,90] et [-180,180] comme à la création. Harmoniser la validation. Éviter que des points invalides cassent le rendu de carte.
- Les notes et positions de signalement sont diffusées à tous les détenteurs du lien bénévole : comportement intentionnel à expliciter.

## P2 — Cohérence et concurrence
**Fichier :** `src/worker.js`, `Search.fetch`.
- Les Durable Objects centralisent l'état par recherche. `/sector/start` refuse une prise concurrente lorsque le secteur est déjà `doing` pour un autre identifiant d'appareil, et `/sector/stop` contrôle l'identifiant propriétaire. Vérifier par test avec deux appareils et deux requêtes proches ; ne pas conclure à une garantie absolue sans test.
- Examiner les effets d'une requête réussie côté serveur dont la réponse est perdue : répétition de `/sector/start`, `/sector/stop`, `/point` ; envisager des clés d'idempotence uniquement si un cas réel apparaît.
- Vérifier les chemins de suppression, le registre et les notifications en cas d'erreur partielle.

## P2 — Supervision
**Fichier :** `src/worker.js`, `selfTest`, cron horaire `wrangler.toml`.
- Le self-test crée, rejoint, démarre un secteur, signale, clôture et vérifie la suppression. Il n'ouvre pas de vrai WebSocket et ne teste ni reconnexion ni actions concurrentes.
- Ajouter des tests automatisés ciblés hors production pour ces scénarios ; éviter d'alourdir le cron de production.
- Vérifier que `NTFY_TOPIC` est un secret non devinable et que les notifications n'incluent pas de données personnelles.

## P2 — Localisation et confidentialité
**Fichiers :** `wrangler.toml`, `src/worker.js`, `public/confidentialite.html`.
- `JURISDICTION="eu"` est utilisé via `namespace.jurisdiction("eu")` pour Search et Registry ; le Worker frontal n'est pas pour autant régionalisé.
- Ne pas annoncer que *tous* les traitements restent en UE. Vérifier contrat/DPA et transferts ; ne pas migrer l'architecture sans besoin démontré.
- Les lignes d'historique contiennent jour, département, résultat, durées et volumes. Risque de réidentification par recoupement ; conserver la granularité pour l'analyse interne selon la note RGPD, mais éviter les exports bruts.
- La page de confidentialité dit « résumé anonyme » : nuancer et indiquer durée et accès.

## P3 — Coût
- WebSocket Hibernation déjà utilisé : conserver. Surveiller requêtes, durée d'exécution, stockage DO et Analytics Engine sur facture réelle. Impossible de garantir le plafond de 10 €/mois sans données de consommation.

## Consignes à l'agent
Créer une PR distincte pour les correctifs, avec tests, sans déploiement automatique ni modification des données historiques. Prioriser P1, conserver l'expérience sans compte et l'accès rapide en urgence. Ne pas modifier la structure des statistiques quotidiennes ni ajouter une purge automatisée à ce stade. Aucun changement de backend ou de fournisseur n'est demandé.

## Suivi (branche `fix/audit-p1-p2`)
- **P1 WebSocket** : chaque connexion doit s'authentifier en 10 s, sinon elle est refermée (code 4001) par l'alarme de la Durable Object, compatible avec l'hibernation ; 1 000 connexions au plus par battue. Le client n'affiche « En direct » qu'à la réception d'un état valide, et repasse à l'HTTP sur message illisible ou fermeture.
- **P1 Abus** : `POST /api/report` limité par battue (binding Rate Limiting), refusé si la battue n'est pas ouverte (registre) ; motif gardé dans le registre, visible dans `/admin`, supprimé à la fermeture ; ntfy ne reçoit que le code, au plus une fois toutes les 10 minutes par battue. `POST /api/new` limité largement par connexion (20/min, approximatif), sans captcha.
- **P1 Géolocalisation** : `POST /point` borné comme la création.
- **P2 Concurrence** : prise simultanée d'un même carreau par deux appareils testée (un succès, un refus).
- **P2 Supervision** : `tests/e2e.mjs`, hors production, contre `wrangler dev` : WebSocket valide, jeton invalide, connexion sans authentification, concurrence, bornes, abus (inexistant, motif, débit, battue fermée), clôture diffusée, historique.
- **P2 Confidentialité** : notice nuancée (stockage UE mais réseau mondial ; historique non qualifié d'anonyme, accès admin, totaux seulement, 5 ans au plus) ; export admin agrégé seulement.
- Non traité, comme demandé : structure des statistiques, purge automatique, fournisseur ; idempotence (aucun cas réel observé).
