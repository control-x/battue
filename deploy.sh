#!/bin/sh
# Déploie battue.org (site, application, API). Lancer depuis le dossier du dépôt.
set -e
W="npx -y wrangler@4"
$W whoami 2>&1 | grep -q "You are logged in" || $W login
$W deploy
# Première fois : sujet ntfy pour les alertes du test automatique
$W secret list | grep -q NTFY_TOPIC || { echo ">>> Sujet ntfy pour les alertes :"; $W secret put NTFY_TOPIC; }
