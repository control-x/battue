#!/bin/sh
# Déploie battue.org (site, application, API). Lancer depuis le dossier du dépôt.
set -e
W="npx -y wrangler@4"
$W whoami 2>&1 | grep -q "You are logged in" || $W login
$W deploy
# Première fois : les secrets manquants sont demandés un par un
#   NTFY_TOPIC    sujet ntfy des alertes (test horaire, battue sans bénévole)
#   ADMIN_TOKEN   jeton de la page admin : https://www.battue.org/admin#t=<jeton>
#   CF_ACCOUNT_ID identifiant du compte Cloudflare (compteurs Analytics Engine)
#   CF_API_TOKEN  jeton d'API Cloudflare avec le droit « Account Analytics : Read »
SECRETS=$($W secret list)
for NAME in NTFY_TOPIC ADMIN_TOKEN CF_ACCOUNT_ID CF_API_TOKEN; do
  echo "$SECRETS" | grep -q "\"$NAME\"" || { echo ">>> $NAME :"; $W secret put "$NAME"; }
done
