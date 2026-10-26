# Battue

Une application web pour organiser une battue citoyenne quand un proche disparaît, souvent une personne âgée désorientée. La famille la lance en 5 minutes, puis les bénévoles se répartissent les carreaux de la carte et voient l'avancement en direct.

- **Zéro installation, zéro compte** : un lien pour le coordinateur, un lien pour les bénévoles, à partager sur WhatsApp.
- **Éphémère** : les données d'une battue sont supprimées à la clôture, ou après 30 jours sans activité.
- **Complément des secours** : Battue ne suit pas la personne disparue et ne remplace ni le 17 ni le 112.

Site : [battue.org](https://www.battue.org) · Feuille de route : [ROADMAP.md](ROADMAP.md) · Identité visuelle : [DESIGN.md](DESIGN.md)

## Ce qu'il y a dedans

| Page | Rôle |
| --- | --- |
| `/` | Présentation, bons réflexes, lancement |
| `/nouvelle` | Création d'une battue (Base Adresse Nationale, photo réduite dans le navigateur) |
| `/fiche`, `/f/<id>` | Fiche de préparation chiffrée dans le navigateur, pour lancer une battue pré-remplie |
| `/r/<code>` | Carte de la battue : carreaux de 500 m autour du départ, binômes, signalements, journal, affiche avec QR code |
| `/admin` | Suivi sans contenu : battues ouvertes en nombres, fermeture par code, historique sans donnée nominative (export en totaux seulement), compteurs |
| `/confidentialite`, `/mentions-legales` | Informations légales |

Tout tient dans un Worker Cloudflare (`src/worker.js`) et ses fichiers statiques (`public/`), sans étape de build :

- une **Durable Object par battue** (`Search`), qui garde l'état et le diffuse en WebSocket ;
- un **registre** (`Registry`), qui ne garde que les codes et les dates des battues ouvertes, l'historique des battues terminées (jour, département, durées, nombres ; conservé 5 ans au plus) et les motifs de signalement d'abus des battues ouvertes ;
- un **test complet toutes les heures** (tâche planifiée), avec une alerte [ntfy](https://ntfy.sh) en cas d'échec.

## Lancer en local

```sh
printf 'JURISDICTION=""\nADMIN_TOKEN="test-admin"\n' > .dev.vars   # wrangler dev ne gère pas la juridiction UE
npx wrangler@4 dev --test-scheduled
```

Puis ouvrez http://localhost:8787. L'admin est sur http://localhost:8787/admin#t=test-admin.

Pour lancer le test horaire de production : `curl "localhost:8787/__scheduled?cron=0+*+*+*+*"`. Les échecs apparaissent dans la console de wrangler.

Tests de bout en bout, hors production (Node 22, serveur local lancé) :

```sh
node tests/e2e.mjs            # BASE=http://localhost:8787 ADMIN_TOKEN=test-admin par défaut
```

Documentation RGPD et audit : [`docs/`](docs).

## Déployer

Chaque push sur `main` est testé puis déployé par GitHub Actions (`.github/workflows/deploy.yml`), avec les secrets de dépôt `CLOUDFLARE_API_TOKEN` (modèle « Edit Cloudflare Workers ») et `CLOUDFLARE_ACCOUNT_ID`. À la main :

```sh
./deploy.sh
```

Au premier lancement, le script demande ces secrets :

| Secret | Rôle |
| --- | --- |
| `NTFY_TOPIC` | sujet ntfy des alertes (test horaire, battue sans bénévole, signalement d'abus) |
| `ADMIN_TOKEN` | jeton de la page `/admin#t=<jeton>` |
| `CF_ACCOUNT_ID` | identifiant du compte Cloudflare (compteurs Analytics Engine) |
| `CF_API_TOKEN` | jeton d'API Cloudflare avec le droit « Account Analytics : Read » |

Il faut le forfait Workers Paid, pour éviter les coupures en cas de dépassement des quotas gratuits.

## Licence

[MIT](LICENSE), © 2026 Damien Cirotteau. Contact : contact@battue.org
