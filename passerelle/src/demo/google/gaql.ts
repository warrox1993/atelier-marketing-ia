// Analyseur minimal du langage de requête Google Ads (GAQL) pour le simulateur de démonstration.
// Grammaire servie : SELECT champs FROM ressource [WHERE conditions liées par AND] [ORDER BY champ [ASC|DESC], …] [LIMIT n].
// Tout le reste (PARAMETERS, DURING, LIKE, REGEXP_MATCH, IS NULL, OR…) est refusé avec un message clair.
// Référence : https://developers.google.com/google-ads/api/docs/query/overview

export type Valeur = string | number;

export type Operateur = "=" | "!=" | "<" | "<=" | ">" | ">=" | "IN" | "NOT IN" | "BETWEEN";

export interface Condition {
  champ: string;
  operateur: Operateur;
  /** Une valeur ; plusieurs pour IN ; deux (bornes) pour BETWEEN. */
  valeurs: Valeur[];
}

export interface Tri {
  champ: string;
  decroissant: boolean;
}

export interface RequeteGaql {
  champs: string[];
  ressource: string;
  conditions: Condition[];
  tris: Tri[];
  limite: number | null;
}

type Jeton = { type: "mot" | "chaine" | "nombre" | "symbole"; texte: string };

function decouper(requete: string): Jeton[] {
  const jetons: Jeton[] = [];
  let i = 0;
  while (i < requete.length) {
    const c = requete[i]!;
    if (/\s/.test(c)) {
      i++;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      let texte = "";
      while (j < requete.length && requete[j] !== c) {
        if (requete[j] === "\\" && j + 1 < requete.length) j++;
        texte += requete[j];
        j++;
      }
      if (j >= requete.length) throw new Error("Requête GAQL invalide : chaîne non fermée.");
      jetons.push({ type: "chaine", texte });
      i = j + 1;
    } else if (/[0-9]/.test(c) || (c === "-" && /[0-9]/.test(requete[i + 1] ?? ""))) {
      let j = i + 1;
      while (j < requete.length && /[0-9.]/.test(requete[j]!)) j++;
      jetons.push({ type: "nombre", texte: requete.slice(i, j) });
      i = j;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < requete.length && /[A-Za-z0-9_.]/.test(requete[j]!)) j++;
      jetons.push({ type: "mot", texte: requete.slice(i, j) });
      i = j;
    } else if (c === "!" || c === "<" || c === ">" || c === "=") {
      const deux = requete.slice(i, i + 2);
      if (deux === "!=" || deux === "<=" || deux === ">=" || deux === "<>") {
        jetons.push({ type: "symbole", texte: deux === "<>" ? "!=" : deux });
        i += 2;
      } else if (c === "!") {
        throw new Error("Requête GAQL invalide : « ! » isolé.");
      } else {
        jetons.push({ type: "symbole", texte: c });
        i++;
      }
    } else if (c === "," || c === "(" || c === ")") {
      jetons.push({ type: "symbole", texte: c });
      i++;
    } else {
      throw new Error(`Requête GAQL invalide : caractère inattendu « ${c} ».`);
    }
  }
  return jetons;
}

const MOTS_CLES = new Set(["SELECT", "FROM", "WHERE", "ORDER", "LIMIT", "PARAMETERS", "AND", "OR", "BY", "ASC", "DESC"]);

export function analyserGaql(requete: string): RequeteGaql {
  const jetons = decouper(requete);
  let p = 0;
  const courant = (): Jeton | undefined => jetons[p];
  const estMot = (mot: string): boolean => courant()?.type === "mot" && courant()!.texte.toUpperCase() === mot;
  const attendreMot = (mot: string): void => {
    if (!estMot(mot)) throw new Error(`Requête GAQL invalide : « ${mot} » attendu${courant() ? ` avant « ${courant()!.texte} »` : " en fin de requête"}.`);
    p++;
  };
  const lireChamp = (): string => {
    const j = courant();
    if (!j || j.type !== "mot" || MOTS_CLES.has(j.texte.toUpperCase())) throw new Error(`Requête GAQL invalide : nom de champ attendu${j ? ` au lieu de « ${j.texte} »` : ""}.`);
    p++;
    return j.texte.toLowerCase();
  };
  const lireValeur = (): Valeur => {
    const j = courant();
    if (!j) throw new Error("Requête GAQL invalide : valeur attendue en fin de requête.");
    p++;
    if (j.type === "nombre") return Number(j.texte);
    if (j.type === "chaine") return j.texte;
    if (j.type === "mot") return j.texte; // littéral d'énumération non guillemeté (ENABLED)
    throw new Error(`Requête GAQL invalide : valeur attendue au lieu de « ${j.texte} ».`);
  };

  attendreMot("SELECT");
  const champs: string[] = [lireChamp()];
  while (courant()?.texte === ",") {
    p++;
    champs.push(lireChamp());
  }
  attendreMot("FROM");
  const ressource = lireChamp();

  const conditions: Condition[] = [];
  if (estMot("WHERE")) {
    p++;
    for (;;) {
      const champ = lireChamp();
      const j = courant();
      if (!j) throw new Error("Requête GAQL invalide : opérateur attendu en fin de requête.");
      if (j.type === "symbole" && ["=", "!=", "<", "<=", ">", ">="].includes(j.texte)) {
        p++;
        conditions.push({ champ, operateur: j.texte as Operateur, valeurs: [lireValeur()] });
      } else if (estMot("IN") || (estMot("NOT") && jetons[p + 1]?.texte.toUpperCase() === "IN")) {
        const non = estMot("NOT");
        p += non ? 2 : 1;
        if (courant()?.texte !== "(") throw new Error("Requête GAQL invalide : « ( » attendu après IN.");
        p++;
        const valeurs: Valeur[] = [lireValeur()];
        while (courant()?.texte === ",") {
          p++;
          valeurs.push(lireValeur());
        }
        if (courant()?.texte !== ")") throw new Error("Requête GAQL invalide : « ) » attendu.");
        p++;
        conditions.push({ champ, operateur: non ? "NOT IN" : "IN", valeurs });
      } else if (estMot("BETWEEN")) {
        p++;
        const a = lireValeur();
        attendreMot("AND");
        conditions.push({ champ, operateur: "BETWEEN", valeurs: [a, lireValeur()] });
      } else {
        throw new Error(
          `Opérateur GAQL non pris en charge en démonstration : « ${j.texte} » (servis : =, !=, <, <=, >, >=, IN, NOT IN, BETWEEN). ` +
            "Pour une période, utiliser segments.date BETWEEN 'AAAA-MM-JJ' AND 'AAAA-MM-JJ' (DURING dépendrait de la date du jour).",
        );
      }
      if (estMot("AND")) {
        p++;
        continue;
      }
      if (estMot("OR")) throw new Error("GAQL n'accepte pas OR dans WHERE : seules les conditions liées par AND existent.");
      break;
    }
  }

  const tris: Tri[] = [];
  if (estMot("ORDER")) {
    p++;
    attendreMot("BY");
    for (;;) {
      const champ = lireChamp();
      let decroissant = false;
      if (estMot("DESC")) {
        decroissant = true;
        p++;
      } else if (estMot("ASC")) p++;
      tris.push({ champ, decroissant });
      if (courant()?.texte === ",") {
        p++;
        continue;
      }
      break;
    }
  }

  let limite: number | null = null;
  if (estMot("LIMIT")) {
    p++;
    const j = courant();
    if (!j || j.type !== "nombre" || !Number.isInteger(Number(j.texte)) || Number(j.texte) < 0) throw new Error("Requête GAQL invalide : LIMIT attend un entier positif.");
    limite = Number(j.texte);
    p++;
  }
  if (estMot("PARAMETERS")) throw new Error("La clause PARAMETERS n'est pas prise en charge en démonstration.");
  if (courant()) throw new Error(`Requête GAQL invalide : « ${courant()!.texte} » inattendu.`);
  return { champs, ressource, conditions, tris, limite };
}
