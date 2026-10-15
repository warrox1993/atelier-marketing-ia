# Revue de sécurité des signatures Ed25519 (preuve d'approbation `apv1`, enveloppe `aev1`), 15/10/2026

Revue en lecture seule, faite par l'agent `securite` (Opus 5.5, effort xhigh). Aucun fichier suivi n'a été modifié,
rien n'a été commité. Périmètre : `plugin-atelier/src/serveur/{signatures,preuve-approbation,regles-diffusion,regles-donnees-demo}.ts`,
les routes `tache.diffusions`, `tache.diffusions.issue` et `tache.donnees.deposer` de `services.ts`,
`passerelle/src/{signature-enveloppe,outils}.ts`, `passerelle/src/reel/social-crm/{approbation,execution,coffre,hubspot}.ts`,
confrontés à `docs/contrats.md` §13 et §14, `docs/revue-securite-passerelle.md` §5, §6, §6 bis et §7,
`docs/revue-independante.md` (« Suites données ») et `docs/passerelle.md`.

Attention : `passerelle/src/reel/social-crm/approbation.ts` était en cours de modification par un autre agent pendant
la revue. Les numéros de ligne de ce fichier sont ceux de la copie de travail lue le 15/10/2026 et peuvent bouger.

## 1. Verdict

**Pas prêt pour un vrai compte.** La cryptographie elle-même est saine : Ed25519 de Node, préfixe signé, signature
vérifiée avant toute lecture de la charge, clés lues sans fuite, échecs fermés. Les défauts sont dans **ce qui est
lié** par les signatures :

- **Preuve `apv1`** : la preuve lie exactement l'appel exécuté (empreinte des arguments recalculée par la passerelle sur
  les arguments qu'elle exécute), mais cet appel est **choisi par l'agent après l'approbation**. L'humain approuve une
  révision et une portée (action, canal, compte), jamais l'appel. Le contrôle « figure tel quel » est une recherche de
  sous-chaîne, et les champs qui désignent la cible (destinataire du message, contact ou fiche CRM modifiés, nom des
  propriétés CRM) ne sont liés à rien. Un agent, éventuellement poussé par une injection de consignes, publie un
  fragment quelconque du livrable (note interne comprise), modifie un autre contact que celui approuvé, ou écrit à
  n'importe quel destinataire, avec une preuve valide (S-1, élevée, confirmé).
- **Enveloppe `aev1`** : le correctif §6 bis (constat M2, déclaré « corrigé ») se contourne de deux façons simples. Une
  structure JSON non signée glissée dans `texte` à côté d'une structure signée est acceptée comme réelle (S-2,
  confirmé). Et la passerelle signe en mode réel, sans erreur, la réponse « préparée » d'un outil d'écriture appelé
  sans preuve, qui recopie les arguments choisis par l'agent : c'est un oracle de signature de chiffres arbitraires
  (S-3, confirmé). Dans les deux cas, des chiffres inventés passent pour réels, ce que §6 bis devait empêcher.

Les autres constats sont faibles mais réels : une preuve re-signée à chaque rejeu prolonge sa durée de vie et
annule la correction S5 (double exécution possible, S-4, confirmé) ; le journal d'idempotence de la passerelle
n'est indexé que par la clé choisie par l'agent (S-5, confirmé sur le code, conditions plausibles) ; le dépôt n'exige
pas les arguments de l'appel et ne contrôle pas le compte (S-6) ; aucune révocation d'une preuve déjà émise (S-7) ;
aucune garde contre l'usage d'une même paire de clés pour les deux rôles (S-8).

| Gravité | Nombre | Constats |
| --- | --- | --- |
| Critique | 0 | |
| Élevée | 1 | S-1 |
| Moyenne | 2 | S-2, S-3 (chacun annule §6 bis à lui seul : bloquants pour M2) |
| Faible | 5 | S-4, S-5, S-6, S-7, S-8 |

Barème CVSS 3.1 : même convention que `docs/revue-securite-passerelle.md` S9 (l'attaquant est un agent, `AV:L`,
`PR:L`, éventuellement manipulé par une donnée de plateforme).

## 2. Preuves d'exploitation

Script unique qui importe le **vrai code** du plugin et de la passerelle (aucune copie), empaqueté par l'esbuild du
projet dans un dossier temporaire, sans aucune écriture dans le dépôt :

```
bash /tmp/claude-1000/-home-utilisateur/fac0401f-90db-40ef-b6ce-7a3239232a9a/scratchpad/poc-signatures/lancer.sh
```

(`poc.ts` dans le même dossier ; le dossier temporaire de session peut être effacé : le recopier ailleurs, hors du
dépôt, pour le garder.) Sortie du 15/10/2026, code de retour 0, « tous les défauts sont reproduits » :

| Preuve | Résultat obtenu |
| --- | --- |
| F-A (S-2) | dépôt `ok`, `mode: "reel"`, chiffres retenus `[120, 48211, 1250000, 48331, 24165.5]` : 48 211 et 1 250 000 viennent du JSON non signé |
| F-B (S-3) | `crm_modifier_contact` réel sans preuve : `isError: false`, `etat: "preparee"`, signé ; déposé : `ok`, `mode: "reel"`, chiffres `[48211, 1250000]` |
| F-C (S-1) | preuves signées pour : autre contact (2002, exclu par la note interne) et acceptée par `VerificateurPreuves` ; publication d'un fragment de note interne avec un lien de source concurrente ; message à un destinataire quelconque ; valeur CRM `"1"` |
| F-D (S-4) | coffre réel (taille visée 1 au lieu de 5 000) : preuve 1 expire à 1792663200, preuve re-signée 8 jours plus tard expire à 1793354400 ; seconde réponse `executee`, `rejeu: false`, **2 exécutions réelles** |
| F-E (S-5) | deux comptes, même clé d'idempotence, mêmes arguments : le compte B reçoit `executee`, `rejeu: true`, `resultat: {id: "post-1"}` du compte A ; **1 seule exécution** |

## 3. Constats

### S-1. L'appel signé est choisi par l'agent après l'approbation : fragment publié, cible libre (élevée, confirmé)

- **CVSS 3.1 : 7.3** `AV:L/AC:L/PR:L/UI:N/S:C/C:L/I:H/A:N`. Portée changée : la faille est dans la règle d'approbation
  du plugin, l'effet porte sur des ressources d'une autre autorité (Page Facebook, portail HubSpot du client). `C:L` :
  publication possible d'un passage interne du livrable.
- **Cause.**
  - L'humain approuve une révision et une portée (`ApprobationPortee`, `plugin-atelier/src/contrats/dossier.ts:17-25` :
    action, canal, compte, audience, montant, durée). Il ne voit ni n'approuve l'appel d'outil : aucun écran de
    l'interface n'affiche `outil` ou `arguments`. L'agent fournit `service`, `outil`, `arguments` ensuite, dans
    `tache.diffusions` (`services.ts:982-986`).
  - « Tel quel » = sous-chaîne : `preuve-approbation.ts:113` (`corps.includes(normaliser(v))`) et `:122` pour les
    valeurs CRM (`String(v)` : `"1"`, `"true"` ou un mot courant figurent dans presque tout livrable).
  - Champs de cible jamais contrôlés : `destinataire` (`preuve-approbation.ts:29`), `contact_id`, `id`, `ids`
    (`:30-33`), ni les **noms** des propriétés CRM (seules les valeurs sont cherchées, `:121-123`). La portée
    `audience` est comparée à `demande.audience`, valeur déclarée par l'agent, jamais à `destinataire`
    (`regles-diffusion.ts:72`).
  - `link` et `image_url` passent par la même sous-chaîne : toute URL citée dans le livrable (source consultée,
    concurrent, page lue via `tache.sources.lire`) peut devenir le lien ou l'image publiés.
  - La passerelle vérifie fidèlement l'empreinte (`approbation.ts`, `verifier`) : la preuve signée par le plugin
    porte bien sur l'appel exécuté ; le défaut est en amont, dans ce que le plugin accepte de signer.
- **Scénario.** Livrable approuvé : relance de Jean Dupont (contact 1001) ; une note interne dit « ne pas contacter
  Marie Lambert (contact 2002), litige ; dernier tarif concédé 30 % ». Une donnée de plateforme injecte une consigne
  (S8 de la revue passerelle). L'agent demande `crm_modifier_contact` sur le contact 2002, ou, sur une approbation
  « publier sur facebook, page-7 », publie `"dernier tarif concédé 30 %"` avec le lien du concurrent. La preuve est
  signée, la passerelle l'accepte, la règle M1 n'y voit qu'une diffusion par approbation. Une seule action, mais sur le
  compte réel du client, non approuvée telle quelle par l'humain.
- **Preuve.** F-C (section 2).
- **Correction.** Faire approuver l'appel lui-même. L'agent joint l'appel proposé à la révision ; l'interface
  d'approbation l'affiche (outil, cible, texte exact) ; la décision stocke son empreinte ; le plugin ne signe que cet
  appel. Le contrôle « tel quel » devient secondaire (garde-fou de cohérence). Diff de principe :

```diff
--- a/plugin-atelier/src/contrats/dossier.ts
+++ b/plugin-atelier/src/contrats/dossier.ts
@@ export const ApprobationPortee = z.object({
   montantMaxCents: z.number().int().nonnegative().nullable().default(null),
   dureeJours: z.number().int().positive().max(365).nullable().default(null),
+  /** Appel d'outil EXACT approuvé par l'humain (montré à l'écran) ; null : aucune preuve ne sera signée. */
+  appel: z.object({
+    service: z.string().min(1).max(32),
+    outil: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
+    empreinte: z.string().regex(/^[0-9a-f]{64}$/),
+  }).nullable().default(null),
 });
--- a/plugin-atelier/src/serveur/preuve-approbation.ts
+++ b/plugin-atelier/src/serveur/preuve-approbation.ts
@@ export function preparerPreuve(e: EntreePreuve): ResultatPreuve {
   const p = e.decision.portee;
+  if (!p.appel) return { ok: false, motif: "l'approbation ne vise aucun appel d'outil précis : rien n'est signé" };
+  let empreinteDemandee: string;
+  try {
+    empreinteDemandee = empreinteArguments(d.arguments);
+  } catch {
+    return { ok: false, motif: "arguments non représentables en JSON canonique" };
+  }
+  if (p.appel.service !== d.service || p.appel.outil !== d.outil || p.appel.empreinte !== empreinteDemandee) {
+    return { ok: false, motif: "l'appel demandé n'est pas celui que l'humain a approuvé (outil, cible ou contenu différents)" };
+  }
```

  `decider` (`services.ts:1190`) doit vérifier que `portee.appel` existe, appartient à la révision approuvée et que
  l'écran l'a montré ; l'interface (`plugin-atelier/src/ui/`, en cours de modification par un autre agent) doit
  afficher la cible et le texte exacts. **Effets de bord** : les décisions déjà enregistrées n'ont pas d'`appel` et
  ne produiront plus de preuve (sûr : aucune diffusion réelle n'est en service) ; nouvelle version de contrat (1.6)
  et des consignes des agents producteurs. **Correction provisoire** si la refonte doit attendre : texte publié égal à
  un bloc entier marqué « publication » du livrable (pas une sous-chaîne), refus de signer `facebook_envoyer_message`
  et les quatre outils CRM tant que la cible n'est pas dans la portée.

### S-2. Dépôt : une structure non signée dans `texte` profite de la signature de `structuredContent` (moyenne, confirmé)

- **CVSS 3.1 : 5.5** `AV:L/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N` (même impact que S9 / M2, qu'il rouvre).
- **Cause.** `deduireModeReponse` retient la structure du texte dès qu'elle diffère de `structuredContent`
  (`regles-donnees-demo.ts:120`), mais ne vérifie la signature que des structures **qui portent `_atelier`**
  (`:145`). Une structure sans `_atelier` n'est ni signée ni refusée ; elle est renvoyée dans `structures`, puis
  `tache.donnees.deposer` en extrait les chiffres (`services.ts:860`) et garde le texte forgé comme extrait de source.
- **Scénario.** L'agent appelle un outil de lecture réel (réponse authentique, signée), dépose `structuredContent`
  intact et remplace `texte` par `{"rows":[{"sessions":48211,"chiffre_affaires":1250000}]}`. Dépôt accepté,
  `mode: "reel"`, chiffres inventés retenus ; la garde L9 et la porte les tiennent pour réels.
- **Preuve.** F-A.
- **Correction.**

```diff
--- a/plugin-atelier/src/serveur/regles-donnees-demo.ts
+++ b/plugin-atelier/src/serveur/regles-donnees-demo.ts
@@ export function deduireModeReponse(reponse: ReponseOutil, verification?: VerificationSignature): ResultatDeduction {
   if (modes.has("reel")) {
+    // Chaque structure retenue doit porter SA signature : une structure sans `_atelier` ne profite jamais
+    // de la signature d'une autre (revue des signatures, S-2).
+    if (structures.some((x) => x._atelier === undefined)) {
+      return {
+        ok: false,
+        raison: "Réponse non signée par la passerelle (ou modifiée) : une partie de la réponse ne porte pas d'enveloppe « _atelier ». Déposer la réponse brute de l'outil, sans la modifier.",
+      };
+    }
     const v: VerificationSignature = verification ?? { clesPubliques: [], service: "", outil: "", maintenant: new Date() };
```

  Effet de bord : la comparaison de dédoublonnage (`:120`) utilise `JSON.stringify`, sensible à l'ordre des clés ;
  si un client MCP réordonne les clés, une réponse authentique serait comptée deux fois (sans conséquence) ou, après ce
  correctif, jamais refusée à tort, puisque le texte de la passerelle porte lui aussi `_atelier`. Comparer de
  préférence par `jsonCanonique`. Ajouter un test « structure du texte sans enveloppe à côté d'une structure signée :
  refus ».

### S-3. La passerelle signe en « réel » des chiffres choisis par l'agent (réponse « préparée » d'un outil d'écriture) (moyenne, confirmé)

- **CVSS 3.1 : 5.5** `AV:L/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N`.
- **Cause.** Un outil d'écriture réel appelé sans preuve renvoie normalement (pas d'erreur) une réponse
  `etat: "preparee"` qui recopie les arguments dans `action.parametres` (`execution.ts:95` et `:103`). `appelerOutil`
  la signe avec `erreur: false` en mode réel (`outils.ts:146`). Le dépôt accepte n'importe quel outil déclaré, y
  compris d'écriture, et `extraireChiffres` parcourt `action.parametres.properties.*` (clés non ignorées).
- **Scénario.** L'agent appelle `crm_modifier_contact` sans preuve avec
  `properties: {"sessions": "48211", "chiffre_affaires": "1250000"}` : rien n'est écrit chez HubSpot, mais la
  réponse signée, déposée comme `crm · crm_modifier_contact` (arguments déclarés compris), est acceptée comme
  réelle avec ces chiffres. Aucun accès à HubSpot n'est même nécessaire (le chemin « préparée » sort avant
  `autorisation.acces`).
- **Preuve.** F-B.
- **Correction.** Côté plugin, n'accepter au dépôt que les outils de lecture ; côté passerelle, en défense en
  profondeur, signer la nature de l'outil.

```diff
--- a/plugin-atelier/src/serveur/services.ts
+++ b/plugin-atelier/src/serveur/services.ts
@@   routes["tache.donnees.deposer"] = async (r) => {
     const entree = analyser(DeposerDonneesConnexionEntree, r.corps, "Dépôt de données de connexion");
+    // Revue des signatures S-3 : une réponse d'outil d'écriture recopie les arguments de l'agent ; ce n'est jamais une mesure.
+    if (Object.hasOwn(OUTILS_ECRITURE, entree.outil)) {
+      erreur("entree_invalide", "Réponse d'un outil d'écriture : ce n'est pas une donnée de mesure (rapporter l'issue par la route de diffusion).");
+    }
--- a/passerelle/src/outils.ts
+++ b/passerelle/src/outils.ts
@@ export async function appelerOutil(
   const signer = (argsSignes: unknown): SignatureAppel | undefined =>
     signataire
-      ? { signataire, service: contexte.service, outil: nom, compte: contexte.identite.propriete?.id ?? contexte.identite.compte, args: argsSignes }
+      ? { signataire, service: contexte.service, outil: nom, compte: contexte.identite.propriete?.id ?? contexte.identite.compte, args: argsSignes,
+          // Signé : seule une réponse d'outil de lecture peut être tenue pour une mesure par le plugin.
+          lecture: catalogue.outils.get(nom)?.annotations?.readOnlyHint === true }
       : undefined;
```

  Le second diff ajoute un champ `lecture` à la charge `aev1` (à propager dans `SignatureAppel`,
  `SignataireEnveloppe.signer` et `ChargeEnveloppe`, et à exiger `lecture === true` dans `controlerSignature`) :
  c'est un changement de format, à coordonner (`v: 2`, ou champ facultatif traité comme `false` s'il manque). Le
  premier diff suffit à fermer S-3 et n'a pas d'effet de bord, la route d'issue des diffusions restant la seule
  consommatrice des réponses d'écriture. Une liste blanche des outils de lecture (plutôt qu'une liste noire) est
  préférable dès que le catalogue grandit. Import à ajouter dans `services.ts` :
  `import { OUTILS_ECRITURE, preparerPreuve } from "./preuve-approbation.js";`.

### S-4. Re-signature au rejeu : durée de vie illimitée, correction S5 annulée (double exécution) (faible, confirmé)

- **CVSS 3.1 : 2.5** `AV:L/AC:H/PR:L/UI:N/S:U/C:N/I:L/A:N` ; `AC:L` (3.3) si le fichier d'état de la passerelle est
  perdu, restauré d'une ancienne sauvegarde ou si une seconde instance sert le même compte
  (`docs/evolution-deploiement.md`).
- **Cause.** Tant qu'une diffusion réelle reste `preparee`, chaque rejeu de la demande re-signe une preuve avec
  `emis` et `expire` recalculés sur l'heure courante (`services.ts:1007` et `:1017`, `preuve-approbation.ts:134-136`).
  C'est l'agent qui décide de rapporter l'issue : s'il ne le fait pas, la diffusion reste `preparee` indéfiniment.
  La passerelle n'oublie une mutation exécutée qu'une fois `expirePreuve` passé (`coffre.ts:187`), et cette valeur
  ne vient que de la preuve présentée à l'exécution (`execution.ts:169`) ; le chemin « déjà exécutée »
  (`execution.ts:137`) ne la prolonge pas.
- **Scénario.** Publication exécutée le jour J, issue non rapportée. Après J+7 et plus de 5 000 mutations, l'entrée est
  oubliée ; l'agent rejoue sa demande, reçoit une preuve neuve pour la même clé et republie.
- **Preuve.** F-D (taille visée du journal ramenée à 1 pour le test).
- **Correction.** Figer la charge à la première signature et la re-signer à l'identique (Ed25519 est déterministe :
  même jeton), plus la défense en profondeur côté passerelle.

```diff
--- a/plugin-atelier/src/serveur/preuve-approbation.ts
+++ b/plugin-atelier/src/serveur/preuve-approbation.ts
@@ export interface EntreePreuve {
   maintenant: Date;
+  /** Rejeu : horodatages de la PREMIÈRE preuve de cette diffusion (colonnes de la diffusion) ; jamais prolongés. */
+  premiere?: { emis: number; expire: number };
 }
@@
-  const emis = Math.floor(e.maintenant.getTime() / 1000);
+  const maintenantS = Math.floor(e.maintenant.getTime() / 1000);
+  const emis = e.premiere?.emis ?? maintenantS;
   const finDecision = p.dureeJours !== null ? Math.floor(new Date(e.decision.creeLe).getTime() / 1000) + p.dureeJours * 86_400 : Number.POSITIVE_INFINITY;
-  const expire = Math.min(emis + DUREE_MAX_PREUVE_S, finDecision);
-  if (expire <= emis) return { ok: false, motif: "l'approbation a expiré" };
+  const expire = e.premiere?.expire ?? Math.min(emis + DUREE_MAX_PREUVE_S, finDecision);
+  if (expire <= maintenantS) return { ok: false, motif: "la preuve de cette diffusion a expiré : une nouvelle approbation est nécessaire" };
--- a/passerelle/src/reel/social-crm/execution.ts
+++ b/passerelle/src/reel/social-crm/execution.ts
@@
-        if (existante?.etat === "executee") return executee(existante, true);
+        if (existante?.etat === "executee") {
+          // Une preuve plus longue ne doit jamais survivre à l'entrée qui la rend inoffensive (revue S5, S-4).
+          if (existante.expirePreuve !== undefined && existante.expirePreuve < verdict.charge.expire * 1000) {
+            dep.coffre.ecrireMutation({ ...existante, expirePreuve: verdict.charge.expire * 1000 });
+          }
+          return executee(existante, true);
+        }
```

  Effets de bord : migration (deux colonnes `preuve_emis`, `preuve_expire` sur `diffusions`, nulles pour l'existant :
  la première re-signature les remplit) ; après expiration, une diffusion restée `preparee` exige une nouvelle
  approbation, ce qui est le comportement annoncé (« 7 jours au plus »).

### S-5. Journal d'idempotence indexé par la seule clé choisie par l'agent (faible, confirmé sur le code, conditions plausibles)

- **CVSS 3.1 : 3.6** `AV:L/AC:H/PR:L/UI:N/S:U/C:N/I:L/A:L`.
- **Cause.** `coffre.mutation(cle)` (`coffre.ts:176`) et le contrôle `execution.ts:134` comparent empreinte, outil
  et service, jamais le compte ni l'octroi. L'unicité de `cleIdempotence` n'est garantie que par entreprise dans le
  plugin (`lireDiffusionParCle(companyId, …)`), et la clé est choisie par l'agent.
- **Scénario.** Une même passerelle sert deux entreprises (ou deux Pages). L'agent de B reprend la clé déjà utilisée
  par A, avec le même texte : B reçoit `executee` (`rejeu`, résultat de A), rien n'est publié chez B, et la route
  d'issue marque la diffusion de B `confirmee`. Avec un autre texte : refus définitif de B (déni de service).
- **Preuve.** F-E.
- **Correction.**

```diff
--- a/passerelle/src/reel/social-crm/execution.ts
+++ b/passerelle/src/reel/social-crm/execution.ts
@@
-        if (existante && (existante.empreinte !== empreinte || existante.outil !== def.outil.nom || existante.service !== contexte.service)) {
+        if (existante && (existante.empreinte !== empreinte || existante.outil !== def.outil.nom || existante.service !== contexte.service
+          || (existante.compte !== undefined && existante.compte !== acces.compte.id))) {
           return preparee("cette clé d'idempotence a déjà servi pour une autre action");
         }
@@
         const entree: EntreeMutation = {
           cle,
+          compte: acces.compte.id,
```

  (champ `compte?: string` ajouté à `EntreeMutation` ; les entrées existantes, sans compte, gardent le comportement
  actuel). Côté plugin, en complément : générer la clé d'idempotence signée à partir de l'identifiant de diffusion
  (UUID) plutôt que de la valeur de l'agent ; cela demande d'adapter la comparaison `services.ts:1108`.

### S-6. Dépôt : arguments facultatifs et compte non contrôlé (faible, confirmé sur le code)

- **CVSS 3.1 : 3.3** `AV:L/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:N`.
- **Cause.** La liaison aux arguments n'a lieu que si l'agent les déclare (`regles-donnees-demo.ts:103`) ;
  `charge.compte` n'est comparé à rien. La « Limite » de S9 demandait de confronter `emis` et `arguments` à la période
  et à la propriété déclarées.
- **Scénario.** L'agent redépose une réponse authentique de moins de 7 jours portant sur une autre période, ou sur la
  propriété d'un autre client servi par la même passerelle, comme réponse de l'appel courant.
- **Correction.** En mode réel, exiger les arguments ; si la campagne connaît sa propriété, comparer `charge.compte`.

```diff
--- a/plugin-atelier/src/serveur/regles-donnees-demo.ts
+++ b/plugin-atelier/src/serveur/regles-donnees-demo.ts
@@ function controlerSignature(structure: Record<string, unknown>, v: VerificationSignature): string | null {
-  if (v.arguments !== undefined) {
+  if (v.arguments === undefined) return "arguments de l'appel non déclarés : une réponse réelle doit être liée à son appel (période, propriété)";
+  {
```

  Effet de bord : les consignes des agents (`organisation/skills/*`, en cours de modification par un autre agent)
  doivent toujours transmettre `arguments` ; les sources déjà enregistrées ne changent pas.

### S-7. Aucune révocation d'une preuve déjà émise (faible, confirmé sur le code)

- **CVSS 3.1 : 2.5** `AV:L/AC:H/PR:L/UI:N/S:U/C:N/I:L/A:N`.
- **Cause.** La passerelle vérifie la preuve hors ligne (`approbation.ts`, `verifier`) : une invalidation de
  l'approbation (nouvelle révision, rejet, H3) n'atteint pas une preuve déjà remise à l'agent, valable jusqu'à 7 jours
  (`DUREE_MAX_PREUVE_S`, `signatures.ts`).
- **Scénario.** L'humain approuve, l'agent obtient la preuve, l'humain corrige le livrable une heure plus tard ;
  l'agent publie encore l'ancienne version dans la semaine.
- **Correction.** Choix de l'opérateur : ramener `DUREE_MAX_PREUVE_S` à la durée d'un appel (par exemple 1 heure ; l'agent
  appelle la passerelle juste après), combiné avec S-4 (charge figée : sinon la re-signature contournerait la durée).
  Une liste de révocation demanderait que la passerelle interroge Paperclip, ce que le modèle exclut volontairement.

### S-8. Aucune garde contre une même paire de clés pour les deux rôles (faible, théorique, mauvaise configuration)

- **CVSS** : sans objet sans erreur d'exploitation ; avec la même paire, la passerelle détiendrait la clé privée
  d'approbation et pourrait fabriquer des preuves, ce que le modèle (« la passerelle ne peut pas fabriquer de
  preuve », `docs/passerelle.md`) exclut.
- **Constat.** La confusion de formats est bien fermée : le préfixe `apv1` ou `aev1` est dans le corps signé et
  vérifié avant tout (`approbation.ts` `verifier`, `signatures.ts` `verifierEnveloppe`), une enveloppe ne peut donc
  jamais servir de preuve, même signée par la même clé. Mais rien n'empêche l'opérateur de générer une seule paire.
- **Correction.** Refus de démarrer côté passerelle si l'empreinte de sa clé de signature égale celle d'une clé
  publique d'approbation (les deux sont lues au démarrage, `demarrer.ts` et `enregistrer.ts`) ; contrôle symétrique
  côté plugin (`cleApprobation` contre `clesPasserelle`, avertissement et refus de signer) ; dans
  `docs/revue-securite-passerelle.md` §7, donner la commande de génération de la clé d'approbation à côté de celle de
  la clé de signature, avec la mention « deux paires distinctes ».

## 4. Vérifié sans défaut

- **Signature et format** : `sign`/`verify` Ed25519 de Node ; signature vérifiée avant toute lecture de la charge ;
  charge transmise telle quelle (pas de re-sérialisation côté vérificateur), donc aucune ambiguïté de
  canonicalisation sur le jeton lui-même ; préfixe dans le corps signé ; champs de la preuve tous typés et bornés côté
  passerelle (`v`, longueurs, empreinte hexadécimale 64, entiers) ; plugin et passerelle produisent des jetons
  identiques (`signerPreuve` repris à l'identique).
- **JSON canonique** (`jsonCanonique`, identique des deux côtés) : nombres non finis refusés, `undefined` retiré,
  chaînes par `JSON.stringify` (surrogats isolés échappés de la même façon). Le tri compare des unités UTF-16 alors que
  le commentaire de `approbation.ts:19` annonce l'ordre des points de code : sans effet tant que les deux côtés sont
  en JavaScript (l'écart ferait échouer, jamais passer, une implémentation tierce) ; corriger le commentaire.
- **Arguments exécutés = arguments signés** : la passerelle calcule l'empreinte sur les arguments validés par Zod
  qu'elle exécute (`execution.ts`), `preuve_approbation` retirée ; un argument en trop, une transformation Zod ou une
  clé `__proto__` font échouer la preuve (refus sûr), jamais l'inverse.
- **Compte** : le plugin refuse de signer `compte: null` (`preuve-approbation.ts`) ; la passerelle compare le compte
  signé au compte de la connexion (`approbation.ts:137`). La passerelle accepte encore `null` comme « tout compte » :
  à refuser aussi côté passerelle pour les réseaux (défense en profondeur, R4).
- **Horloge** : dérive future 120 s, durée bornée à 7 jours côté passerelle, `expire` borné par la durée de la
  décision côté plugin ; une date de décision illisible donne `NaN`, sérialisé `null`, refusé (« incomplète »).
- **Approbation humaine** : `decider` exige un acteur humain authentifié (`services.ts:1191`) ; les routes de
  l'hôte ne transmettent que `user` ou `agent` ; `verifierDiffusion` exige révision courante, porte franchie,
  statut natif `done`, décision non invalidée ; rejeu re-vérifié et lié aux mêmes service, outil, empreinte et portée.
  Aucun chemin trouvé où un agent obtient une preuve sans décision humaine (le défaut S-1 est ce que l'agent fait
  d'une approbation réelle).
- **Clés privées** : `approbationClePrivee` doit être une référence `secret_ref` (une valeur en clair est refusée),
  résolue à chaque usage ; erreurs remplacées par des messages sans valeur ; preuve jamais stockée ni journalisée
  (journal : service, outil, empreinte, compte, expiration) ; passerelle : clé de signature en `_FICHIER` 0600
  contrôlé, message d'erreur filtré, seule la clé publique est journalisée. La preuve est renvoyée à l'agent (voulu) :
  elle n'autorise que l'appel exact qu'elle lie.
- **Erreurs avalées** : toutes ferment (clé illisible ignorée, signature en exception = invalide, secret
  indisponible = « préparée », réconciliation en exception = « ambiguë »).
- **Rotation** : plusieurs clés publiques acceptées des deux côtés (5 au plus dans le plugin, blocs PEM concaténés dans
  la passerelle), sans identifiant de clé (toutes essayées) ; une clé retirée cesse d'être acceptée immédiatement.
- **Route d'issue** : réponse signée, réelle, même service, outil, empreinte d'arguments et, pour `executee` ou
  `ambigue_a_reconcilier`, même clé d'idempotence ; transition à sens unique en SQL. Seule faiblesse : S-5.

## 5. Non couvert

- `passerelle/src/reel/social-crm/config.ts` (lecture de `PASSERELLE_APPROBATION_CLE_PUBLIQUE`, en cours de
  modification par un autre agent) : non relu ; `docs/passerelle.md` annonce une clé publique « PEM ou base64 d'une
  ligne » alors que `VerificateurPreuves` n'accepte que du PEM : à vérifier après la modification en cours.
- `plugin-atelier/src/ui/` (en cours de modification) : ce que l'écran d'approbation montre a été cherché, pas relu en
  entier ; aucun affichage de `outil` ou `arguments` trouvé.
- Les schémas Zod réels de tous les outils d'écriture (seul HubSpot relu en détail) et les fonctions `reconcilier`.
- Le SDK de Paperclip (`ctx.secrets.resolve`, portée réelle de `ctx.config.get(companyId)` : si la configuration est
  commune à l'instance, toutes les entreprises partagent les mêmes clés, ce qui rend S-5 plus probable).
- Aucune suite de tests n'a été lancée ; les preuves de la section 2 ont été exécutées une fois, toutes reproduites.

## Suites données (passerelle)

Mise à jour du 15/10/2026, côté `passerelle/` seulement (`approbation.ts`, `config.ts` et `plugin-atelier/` non touchés).
Vérification : `npx tsc --noEmit` propre, `npx vitest run` 26 fichiers et 419 tests verts, `npm audit` 0 vulnérabilité.
Preuves F-B et F-E reprises en tests de non-régression dans `passerelle/tests/reel-social-crm/revue-signatures.test.ts`
(rendus rouges sur le code d'origine, vérifié pour S-5) et `passerelle/tests/signature-enveloppe.test.ts`.

| Constat | Statut passerelle | Reste à faire |
| --- | --- | --- |
| S-3 | **Corrigé côté passerelle** : option « signer avec indicateur ». La charge `aev1` porte `ecriture` (vrai pour tout outil qui n'est pas annoncé `readOnlyHint === true`, liste blanche) et `executee` (vrai seulement si l'outil a répondu `executee: true`). Champ additif, `v: 1` inchangé, non signé = jamais accepté. Non-signature écartée : la route d'issue des diffusions (`services.ts`, `verifierEnveloppe`) a besoin de la réponse d'écriture signée. | **Plugin** : au dépôt de données (`tache.donnees.deposer`), refuser toute enveloppe dont la charge a `ecriture === true` (en plus du refus par nom d'outil `OUTILS_ECRITURE`), et typer `ChargeEnveloppe` avec ces deux champs ; la route d'issue peut vérifier `executee` contre l'état annoncé. |
| S-5 | **Corrigé** : le journal des mutations est indexé par compte + service + outil + clé (`coffre.ts`, `indexMutation`) ; le verrou « déjà en cours » suit le même index. Entrées d'avant le correctif (sans compte) : rendues seulement au même octroi, service et outil, migrées à la prochaine écriture. Un compte B ne reçoit plus le résultat de A et n'est plus bloqué par une clé de A. | Plugin (complément) : clé d'idempotence signée tirée de l'identifiant de diffusion plutôt que de la valeur de l'agent. |
| S-8 | **Corrigé côté passerelle, sans toucher `config.ts`** : `verifierSeparationDesCles` (`signature-enveloppe.ts`) comparée à chaque bloc PEM de `config.clePubliqueApprobation`, appelée par `construireSocialCrmReel` (nouvelle option `signataire`, passée par `demarrer.ts`) ; erreur sans clé dans le message, sortie code 2. Limite : le contrôle n'a lieu qu'en mode réel avec réseaux sociaux et CRM servis. | Plugin : contrôle symétrique (`cleApprobation` contre `clesPasserelle`) ; `docs/revue-securite-passerelle.md` §7 : « deux paires distinctes ». |

## Suites données (plugin)

Mise à jour du 15/10/2026, côté serveur du plugin seulement (`plugin-atelier/src/serveur/`, `src/contrats/`,
`migrations/006_appels_approuves.sql`, `tests/` hors `tests/ui/`). Contrat **v1.6** : `docs/contrats.md` §15 ; états :
`docs/dictionnaire-etats.md` §7 ; résultats : `docs/resultats-tests.md`. Les preuves F-A à F-D sont reprises en tests de
non-régression dans `plugin-atelier/tests/revue-signatures.spec.ts`, avec le code réel du plugin et de la passerelle
(`outils.ts`, `hubspot.ts`, `signature-enveloppe.ts`, `approbation.ts`). Le script d'origine
(`instance/revue-repro/poc-signatures/lancer.sh`) rejoué sur le code corrigé : F-A, F-B et F-C « non reproduit » ; F-D
s'arrête car aucune preuve n'est plus signée sans appel approuvé (le scénario F-D est rejoué par le service dans le test).

| Constat | Correction côté plugin | Test |
| --- | --- | --- |
| S-1 | L'agent propose l'appel exact (`tache.appels.proposer`), l'humain approuve son empreinte canonique (`portee.appel` : service, outil, compte, arguments complets), la preuve n'est signée que pour cette empreinte. Tous les champs liés (cible, propriétés CRM, lien, compte). Contrôle « tel quel » gardé comme garde-fou. Décision contrôlée champ par champ contre l'appel proposé. `modifier_crm` : ni audience ni montant. Interface en réel : « Diffuser » refusé sur un canal de la passerelle. | « S-1 » (F-C 1 à 4 et variantes, parcours complet, décisions refusées, interface) |
| S-2 | Chaque structure retenue porte sa propre signature ; aucun chiffre dans le texte hors de la structure signée ; comparaison canonique du texte et des données structurées. | « S-2 » (F-A, chiffres hors JSON, ajout après le JSON, clés réordonnées acceptées) |
| S-3 | Refus au dépôt des outils d'écriture (liste et nom d'action), des charges `ecriture !== false` (absent = écriture) et des structures marquées écriture, dans tous les modes. | « S-3 » (F-B règle et route, avec la vraie passerelle ; ancienne charge) |
| S-4 | Charge de la première preuve figée sur la diffusion ; rejeu = même jeton ; au-delà de l'expiration : refus. `preuveExpire` exposé. | « S-4 » (F-D règle ; service à J+2 et J+8 avec horloge simulée) ; `signatures.spec.ts` (jeton identique au rejeu) |
| S-5 | Complément plugin : clé d'idempotence signée = `atelier-diffusion-<id de diffusion>` ; issue comparée à cette clé. Le journal par compte est fait côté passerelle (`cad1ac4`). | « S-1 » (clé dérivée) ; `signatures.spec.ts` (issue avec la clé de l'agent refusée) |
| S-6 | En réel : `arguments` obligatoires, compte signé exigé, `compte` déclaré comparé, un compte par service et par campagne ; compte gardé dans la source. | « S-6 » |
| S-7 | État `revocation` (nouvelle décision, nouvelle révision, révocation humaine) ; rejeu refusé ; liste signée `arv1` (`preuves.revocations`). La passerelle ne la consulte pas encore : voir ci-dessous. | « S-7 » |
| S-8 | Contrôle symétrique : clé d'approbation de même empreinte qu'une clé de la passerelle = aucune signature, avertissement. | « S-8 » |

Issue rapportée : la charge doit venir d'un outil d'écriture, et `executee` signé doit concorder avec l'état annoncé.

## Suites à donner (passerelle, interface, consignes)

### Lot passerelle

1. **Liste de révocation (S-7), à exiger avant toute mutation réelle.** La passerelle n'interroge pas Paperclip ; l'agent
   lui transmet la liste signée que rend `GET /api/plugins/atelier.marketing-ia/api/preuves/revocations?companyId=…`
   (champ `liste`). Proposition : nouvel argument `revocations_approbation` sur chaque outil d'écriture, exigé en mode réel ;
   la passerelle vérifie, avec les mêmes clés publiques que les preuves : préfixe `arv1` dans le corps signé, signature,
   `v === 1`, `emis` ni dans le futur (120 s) ni plus vieux qu'une fenêtre courte (5 minutes proposées, à trancher par l'opérateur :
   c'est le délai maximal d'effet d'une révocation), puis refuse la preuve si sa `diffusion` (ou sa `cle`) figure dans
   `revoquees`. `revocations_approbation` doit être retiré des arguments AVANT le calcul de l'empreinte, comme
   `preuve_approbation`, des deux côtés dans le même lot (le plugin ne l'envoie jamais dans `arguments`).
   **Liaison à l'entreprise à coordonner** : une liste vide d'une autre entreprise passerait le contrôle. Ajouter
   `entreprise` (identifiant de l'entreprise Paperclip) à la charge `apv1` (champ additif, signé par le plugin) et exiger
   `liste.entreprise === preuve.entreprise`. Le plugin ne l'ajoute pas encore (changement de format à faire dans le même
   lot que la vérification).
2. **Défense en profondeur S-4** (diff de la section S-4) : au rejeu `executee`, ne jamais garder un `expirePreuve` plus court
   que celui de la preuve présentée. Non fait dans `cad1ac4`.
3. **Compte signé (S-6)** : toute réponse d'outil de lecture réel doit porter un `compte` non nul dans la charge `aev1` ; le
   plugin refuse désormais une réponse réelle sans compte.
4. **`compte: null`** : refuser aussi côté passerelle une preuve sans compte pour les réseaux (déjà refusée par le plugin).
5. **Format de clé publique d'approbation** (PEM ou base64 d'une ligne, `config.ts`) : à vérifier par le lot qui modifie
   `config.ts` (section 5 de cette revue).
6. La clé d'idempotence d'exécution est `charge.cle` (déjà le cas) ; elle vaut maintenant `atelier-diffusion-<uuid>` ; aucun
   changement requis.

### Lot interface (`plugin-atelier/src/ui/`)

1. **Aperçu de l'appel à approuver** : lire `DossierHumain.appelsProposes` (révision courante d'abord). Pour chaque appel dont
   `revisionCourante` est vrai, afficher sans troncature : `apercu.resume` ; `apercu.cibles` (compte, puis destinataire,
   contact ou fiches modifiés) ; `apercu.textes` (texte publié, lien, image : valeur exacte, lien non cliquable ou avec
   l'adresse complète visible) ; `apercu.proprietes` (NOM et valeur de chaque propriété CRM) ; l'empreinte (`empreinte`,
   par exemple 12 premiers caractères, complète au survol ou à la demande). Les appels d'une ancienne révision sont
   affichés grisés et non approuvables.
2. **Décision** : l'approbation d'une action externe réelle (`publier`, `envoyer`, `modifier_crm`) choisit UN appel proposé
   et envoie `portee.appel = appel.approbation` (recopié tel quel), avec une portée cohérente : `action` = action de
   l'appel, `canal` = un canal du service de l'appel (`facebook`, `instagram`, `linkedin`, `hubspot` ou `crm`, `pipedrive`,
   `odoo`, `teamleader`), `compte` = `appel.compte`. Sans appel proposé : le dire (« aucune preuve ne pourra être signée :
   l'agent doit d'abord proposer l'appel exact »). Pour `modifier_crm`, ne proposer ni audience ni montant (le serveur
   refuse).
3. **Pas de « Diffuser » en réel pour la passerelle** : en mode réel, sur un canal servi par la passerelle, le bouton ne
   déclenche rien (le serveur répond `conflit`) ; afficher « l'agent diffuse avec l'appel approuvé ». En démonstration,
   inchangé.
4. **Preuve d'une diffusion préparée** : afficher `preuveExpire` (date et heure, Europe/Brussels) et `revocation` (date et
   motif). Bouton « Révoquer la preuve » (action `atelier.diffusion.revoquer` `{ issueId, diffusionId, motif }`, motif
   obligatoire de 3 à 500 caractères) pour une diffusion réelle `preparee` qui a une `preuveExpire` et pas de
   `revocation`.

### Lot consignes (`organisation/agents/*`, `organisation/skills/*`)

1. **Dépôt de données** : toujours `arguments` (valeurs explicites, y compris les valeurs par défaut) et `compte` (celui
   d'`atelier_identite`) ; ne JAMAIS déposer la réponse d'un outil d'écriture (refusée) : l'issue d'une diffusion passe par
   `POST /taches/:issueId/diffusions/:diffusionId/issue`.
2. **Diffusion réelle, nouveau parcours** : (a) proposer l'appel exact : `POST /taches/:issueId/appels`
   `{ revisionId, service, outil, compte, arguments }` sur la révision courante, avec le texte copié tel quel du livrable ;
   (b) attendre la décision humaine (elle vise l'empreinte de cet appel) ; (c) demander la diffusion avec EXACTEMENT les
   mêmes `service`, `outil`, `compte` et `arguments` ; (d) appeler l'outil de la passerelle avec ces arguments plus
   `preuve_approbation` (et, quand la passerelle l'exigera, `revocations_approbation` lu juste avant) ; (e) rapporter
   l'issue avec la réponse brute. Ne jamais changer un argument après l'approbation : il faut une nouvelle proposition et
   une nouvelle approbation.
3. Une preuve « expirée » ou « révoquée » ne se contourne pas : demander une nouvelle approbation à l'humain.
4. Plus besoin de choisir une clé d'idempotence d'exécution : la clé de la demande (`cleIdempotence`) reste obligatoire
   côté plugin, la clé d'exécution est celle de la preuve.

### Décisions pour l'opérateur

- Fenêtre de fraîcheur de la liste de révocation (5 minutes proposées) et, à défaut de liste, réduction de
  `DUREE_MAX_PREUVE_S` (7 jours aujourd'hui ; 1 heure proposée par la revue) : non changée ici.
- Lien de la preuve à l'entreprise (`entreprise` dans `apv1`) : à décider avec le lot passerelle.

## Suites données (passerelle, consignes, v1.6)

Mise à jour du 15/10/2026. Passerelle : `passerelle/src/reel/social-crm/` (`approbation.ts`, `execution.ts`, `commun.ts`,
`config.ts`), `src/outils.ts`, `src/signature-enveloppe.ts`. Consignes : `organisation/**`, `scripts/verifier-organisation.py`,
`scripts/bootstrap-tests.sh`. Plugin non touché. Détail d'usage : `docs/passerelle.md` (section des preuves).

| Point | Statut |
| --- | --- |
| Liste de révocation `arv1` (S-7) | **Faite.** Argument `revocations_approbation` sur chaque mutation réelle, exigé ; contrôle du préfixe, de la signature (clés d'approbation), de la forme, de `emis` (pas dans le futur, 5 minutes au plus : `FRAICHEUR_REVOCATIONS_S`) ; preuve refusée si sa `diffusion`, sa `cle` ou sa `decision` figure dans `revoquees` ; absence de liste fraîche = action seulement préparée, avec un message clair. L'argument est retiré de l'empreinte, des paramètres rapportés et des arguments signés `aev1` (le plugin, lui, ne l'envoie jamais dans `arguments` : `controlerAppel` refuse déjà les arguments inconnus). |
| S-4, défense en profondeur | **Faite** : au rejeu d'une mutation `executee`, `expirePreuve` est prolongée jusqu'à celle de la preuve présentée (jamais raccourcie). |
| Compte signé (S-6) | **Fait** : en réel, `SignataireEnveloppe.signer` refuse un compte nul ou vide ; `appelerOutil` répond une erreur `compte_absent` non signée. |
| `compte: null` | **Refusé** côté passerelle pour Facebook, Instagram et LinkedIn (accepté pour les CRM, que le plugin refuse déjà). |
| Format de la clé publique | **Validé au chargement** (`normaliserClePubliqueApprobation`) : PEM « PUBLIC KEY » ou SPKI DER base64 par ligne, Ed25519 obligatoire, message sans la valeur. La divergence signalée en section 5 est levée : les deux formes sont acceptées et normalisées. |
| Lien à l'entreprise | **Passerelle faite, plugin à faire.** La passerelle accepte `entreprise` dans `apv1` quand il est présent et refuse si `liste.entreprise` diffère. Tant que le plugin ne l'émet pas, la liste n'est pas liée (une liste vide d'une autre entreprise passerait). |
| Consignes Contenus et CRM | **Faites** : parcours en 5 étapes (proposer par `tache.appels.proposer`, attendre l'approbation de l'empreinte, demander la diffusion avec les mêmes arguments, lire la liste récente puis appeler la passerelle avec `preuve_approbation` et `revocations_approbation`, rapporter l'issue par `tache.diffusions.issue`), preuve expirée ou révoquée = nouvelle approbation, dépôt toujours avec `arguments` et `compte`, jamais une réponse d'écriture. Compétences `redaction-declinaison-canal` (1.4.0) et `conversion-crm` (1.3.0), verrou régénéré, contrôles du vérificateur (présence et ordre) et 18 cas négatifs dans `bootstrap-tests.sh`. |

### Diff attendu côté plugin : champ `entreprise` dans `apv1`

```diff
--- a/plugin-atelier/src/serveur/signatures.ts
+++ b/plugin-atelier/src/serveur/signatures.ts
@@ export interface ChargePreuve {
   emis: number;
   expire: number;
+  /** Entreprise Paperclip qui a approuvé : la passerelle la compare à celle de la liste de révocation (arv1). */
+  entreprise?: string;
 }
@@ export function empreinteArguments(args: Record<string, unknown>): string {
-  const { preuve_approbation: _ignoree, ...reste } = args;
+  // Arguments de transport, jamais dans l'empreinte (comme la passerelle : ARGUMENTS_DE_TRANSPORT).
+  const { preuve_approbation: _p, revocations_approbation: _r, ...reste } = args;
   return sha256(jsonCanonique(reste));
@@ export function empreinteAppel(appel: AppelOutil): string {
-  const { preuve_approbation: _ignoree, ...args } = appel.arguments;
+  const { preuve_approbation: _p, revocations_approbation: _r, ...args } = appel.arguments;
--- a/plugin-atelier/src/serveur/preuve-approbation.ts
+++ b/plugin-atelier/src/serveur/preuve-approbation.ts
@@ export interface EntreePreuve {
   diffusionId: string;
+  /** Identifiant de l'entreprise Paperclip (companyId). */
+  entreprise: string;
@@ frozen (chargeFigee)
+    if (c.entreprise !== undefined && c.entreprise !== e.entreprise) return { ok: false, motif: "la preuve déjà émise vise une autre entreprise : rien n'est signé" };
@@ const charge: ChargePreuve = {
-    diffusion: e.diffusionId, decision: e.decision.id, emis: maintenantS, expire,
+    diffusion: e.diffusionId, decision: e.decision.id, emis: maintenantS, expire, entreprise: e.entreprise,
--- a/plugin-atelier/src/serveur/services.ts
+++ b/plugin-atelier/src/serveur/services.ts
@@ signerSiPossible
-      diffusionId, corpsRevision: corps, clePrivee: cle, ...
+      diffusionId, entreprise: companyId, corpsRevision: corps, clePrivee: cle, ...
```

Tests plugin à ajouter : la charge signée porte `entreprise` ; la passerelle (code réel) refuse la liste d'une autre entreprise
et accepte la sienne ; une charge figée sans `entreprise` reste re-signée à l'identique. Les agents lisent la liste avec
`?companyId=$PAPERCLIP_COMPANY_ID`.

### Décisions pour l'opérateur

- Fraîcheur 5 minutes retenue (modifiable : `FRAICHEUR_REVOCATIONS_S`). `DUREE_MAX_PREUVE_S` (7 jours) inchangée.
- Une révocation intervenue après l'exécution n'empêche pas le rapport d'issue (la réponse a déjà été reçue par l'agent).
