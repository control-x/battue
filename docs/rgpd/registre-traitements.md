# Battue — registre simplifié des activités de traitement
Version initiale : 25 octobre 2026. Document interne à réexaminer à chaque changement significatif et au moins annuellement. **Document de travail : ne constitue pas une certification de conformité.**

## Responsable et périmètre
Responsable pressenti : Damien Cirotteau, éditeur bénévole de Battue. Contact public : contact@battue.org. Site : battue.org. Vérifier cette qualification si une association devient partenaire ou codécide des finalités. Service sans compte, destiné à coordonner des recherches de personnes disparues. La création impose une déclaration de contact préalable avec les secours (17 ou 112) ; cette déclaration n'est pas une vérification par les autorités.

## T1 — Coordination d'une recherche
**Finalité :** créer une battue, partager les informations utiles, répartir les secteurs, consigner les signalements, produire un journal et coordonner les bénévoles.

**Personnes :** personne recherchée, coordinateur, bénévoles et personnes éventuellement mentionnées dans les notes.

**Données :** prénom/nom saisi, photo facultative, description libre (potentiellement santé), dernier lieu et horaire connus, coordonnées de contact et WhatsApp, secteurs, prénoms, horaires, notes, points GPS de signalements, journal, identifiants techniques d'appareil et jetons d'accès. Aucune géolocalisation continue des bénévoles dans la version examinée.

**Fondement à confirmer :** intérêt légitime (art. 6(1)(f)), après mise en balance documentée ; vérifier une condition autonome de l'article 9 si une description contient des données de santé. L'urgence, la gratuité ou l'accord du coordinateur ne dispensent pas de cette vérification. Examiner les cas particuliers de personnes mineures et les informations relatives à des tiers.

**Destinataires :** participants munis d'un lien valide selon leur rôle ; coordinateur pour le journal ; prestataires techniques nécessaires. Transmission éventuelle aux forces de l'ordre par le coordinateur.

**Conservation :** suppression opérationnelle à la clôture, ou après 30 jours sans activité ; examiner séparément la rétention technique Cloudflare (restauration, journaux, sauvegardes). Les liens d'accès doivent être considérés comme des secrets.

## T2 — Évaluation de l'utilité et amélioration
**Finalité :** mesurer l'adoption, le délai de mobilisation, l'activité des bénévoles, les secteurs couverts, les signalements et le résultat déclaré ; décider d'améliorer, poursuivre ou arrêter le service.

**Données :** résumé par battue sans code ni identifiant direct : jour, département, raison de clôture, résultat déclaré, contribution déclarée, durées, nombre de téléphones, pic de connexions, équipes, secteurs, alertes, points et indicateurs binaires. Le croisement jour/département/résultat peut réidentifier indirectement un événement médiatisé : traiter ces enregistrements comme potentiellement personnels, et non comme anonymes par principe.

**Fondement envisagé :** intérêt légitime (art. 6(1)(f)) à confirmer par une mise en balance ; nécessité et proportionnalité documentées dans la note jointe.

**Accès :** administrateur uniquement, via jeton d'administration ; aucun accès public aux lignes détaillées. L'export de `/admin` ne produit que des totaux (par mois ; par département, masqués sous 3 battues), jamais de lignes individuelles. Communication exceptionnelle à une association ou autorité : apprécier la base, la nécessité, le niveau d'agrégation et tracer la transmission ; aucune communication systématique.

**Conservation validée le 25 octobre 2026 :** conserver les lignes quotidiennes jusqu'à cinq ans après leur collecte pour observer l'évolution pluriannuelle, avec examen annuel de leur nécessité et suppression anticipée si la finalité disparaît. Ce plafond est une proposition de gouvernance, non une durée légale ni un mécanisme technique déjà implémenté. En cas d'arrêt du service, statuer rapidement sur leur suppression ou anonymisation effective. Aucun mécanisme automatique supplémentaire n'est demandé au stade expérimental.

## T3 — Sécurité, administration et prévention des abus
**Finalité :** détecter les indisponibilités, tester le parcours critique, signaler les abus et permettre la fermeture administrative.

**Données :** événements Analytics Engine, codes et dates des battues actives dans le registre, signalements d'abus (code et motif libre), notifications ntfy et journaux techniques du prestataire. Un motif libre peut contenir des données personnelles : il est gardé dans le registre (visible seulement dans `/admin`) et supprimé à la fermeture de la battue ; la notification ntfy ne contient que le code de la battue, au plus une fois toutes les 10 minutes par battue.

**Fondement envisagé :** intérêt légitime à la sécurité et à la prévention des abus, sous réserve de mise en balance.

**Conservation :** registre opérationnel lié au cycle de la battue ; historique et données de notification à vérifier auprès des prestataires. Définir les durées effectives et les minimiser ; ne pas prétendre qu'elles sont nulles.

## T4 — Fiche de préparation
**Finalité :** permettre à une famille de préparer, avant toute disparition, les informations utiles à une battue, et de la lancer pré-remplie le jour venu.

**Personnes :** personne susceptible de disparaître, proches qui détiennent le lien.

**Données :** prénom, photo, description, habitudes, informations destinées aux secours (potentiellement santé : traitements, appareil auditif…), domicile, lieux du passé, numéro et lien WhatsApp familial. **Chiffrées de bout en bout dans le navigateur (AES-GCM)** : le serveur ne conserve que le contenu chiffré, l'empreinte d'un jeton tiré de la clé et un numéro de version ; la clé reste dans la partie `#` du lien et n'est jamais transmise. Battue ne peut ni lire ni restaurer une fiche.

**Transfert vers une battue :** au lancement, le navigateur transmet à la battue le prénom, la photo, la description, les habitudes, les contacts et les lieux ; les informations destinées aux secours ne quittent jamais la fiche.

**Fondement envisagé :** à confirmer ; le chiffrement de bout en bout limite fortement l'exposition, mais la fiche reste une donnée personnelle (et de santé possible) pour les détenteurs du lien. Vérifier la condition de l'article 9.

**Conservation :** suppression à la demande depuis la fiche ; effacement automatique après trois ans sans ouverture.

## Prestataires, transferts et garanties
Cloudflare : Worker frontal mondial par défaut ; Durable Objects appelés avec `jurisdiction("eu")` dans la configuration examinée. La juridiction des Durable Objects ne garantit pas la localisation du traitement effectué par le Worker frontal. Vérifier DPA, sous-traitants, mesures de transfert, rétention des journaux et paramètres du compte. Services appelés depuis le navigateur mentionnés dans la notice : OpenStreetMap, Base Adresse Nationale, Open-Meteo, unpkg, cdnjs, et WhatsApp sur action de partage ; vérifier leurs flux et informations à fournir. ntfy.sh est utilisé pour les alertes administrateur : vérifier confidentialité du sujet, contenu et conservation.

## Mesures organisationnelles et droits
Accès par liens à jetons distincts coordinateur/bénévole ; administration réservée au responsable ; HTTPS ; minimisation ; effacement à la clôture ; journal consultable par le coordinateur ; revue annuelle du présent registre. Demandes : contact@battue.org ; prévoir procédure de vérification raisonnable avant toute communication ou suppression. Examiner droits d'accès, rectification, opposition et effacement selon les circonstances. Éviter les données médicales dans les champs libres tant que la condition de l'article 9 n'est pas clarifiée.

## Vérifications ouvertes
- Confirmer fondements des traitements T1/T2/T3 et exception art. 9 éventuelle.
- Confirmer DPA Cloudflare, transferts et rétention réelle des copies techniques.
- Définir la conservation des notifications et logs tiers.
- ~~Valider la durée maximale de cinq ans proposée pour T2~~ : validée le 25 octobre 2026 ; purge automatique à mettre en œuvre lorsque nécessaire.
- Confirmer le fondement et la condition de l'article 9 pour la fiche de préparation (T4).
- Vérifier les obligations d'information des personnes recherchées et les éventuelles dérogations applicables.
- Réévaluer les responsabilités avant tout partenariat associatif.
