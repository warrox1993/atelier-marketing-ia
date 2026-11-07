/**
 * Lot 2 (#22, T9) : promesses interdites dans un livrable (« rendement garanti », « sans aucun risque »…).
 * Contrôle pur, sur le modèle de `controlerCitationsConnaissances` et de `controlerRedaction` : la liste
 * des formules vit dans `promesses-interdites.json`. Un livrable est publié tel quel : guillemets, citations
 * en retrait (`>`) et code ne protègent rien. Seule une négation qui porte sur la formule l'excuse : dans les
 * deux mots qui la précèdent (même proposition) ou dans la formule elle-même (« aucun rendement n'est garanti »).
 * Le contrôle se fait par paragraphe : une formule coupée par un retour à la ligne est relevée.
 */
import regles from "./promesses-interdites.json" with { type: "json" };

export interface ConstatPromesse {
  code: "promesse_interdite";
  libelle: string;
  /** Ligne (à partir de 1) du livrable où commence la formule. */
  ligne: number;
  /** Formule relevée, sous sa forme normalisée. */
  extrait: string;
}

const FORMULES = regles.formules.map((f) => ({ libelle: f.libelle, motif: new RegExp(f.source, "gu"), negationDansLaFormule: "negationDansLaFormule" in f && f.negationDansLaFormule === true }));

const NEGATION = /(?:^|[\s'])(?:ne|n|non|pas|aucun|aucune|jamais|ni|nul|nulle)(?=[\s']|$)/u;
/** Mots examinés avant la formule, et longueur de texte lue pour les trouver (borne le travail par occurrence). */
const MOTS_AVANT = 2;
const LECTURE_AVANT = 200;

/** Homoglyphes cyrilliques et grecs courants (paires « imitation, latin »), ramenés à la lettre latine qu'ils imitent. */
const PAIRES_HOMOGLYPHES = "аaвbеeкkмmнhоoрpсcтtуyхxіiјjѕsԁdһhӏlԛqԝwАaВbЕeКkМmНhОoРpСcТtУyХxІiЈjЅsαaβbεeιiκkνvοoρpτtυuχxΑaΒbΕeΖzΗhΙiΚkΜmΝnΟoΡpΤtΥyΧx";
const HOMOGLYPHES = new Map([...PAIRES_HOMOGLYPHES].flatMap((c, i, t) => (i % 2 === 0 ? [[c, t[i + 1]!] as const] : [])));
const MOTIF_HOMOGLYPHES = new RegExp(`[${[...HOMOGLYPHES.keys()].join("")}]`, "gu");

/** Minuscules, sans accents ni caractères invisibles (\p{Cf} : trait d'union conditionnel, espaces nulles…), homoglyphes ramenés au latin. */
function normaliser(texte: string): string {
  return texte
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[\p{M}\p{Cf}]/gu, "")
    .replace(MOTIF_HOMOGLYPHES, (c) => HOMOGLYPHES.get(c)!)
    .toLowerCase()
    .replace(/[’ʼ]/gu, "'");
}

/** Début d'un nouveau bloc Markdown (titre, liste, citation, tableau, clôture de code) : il ne prolonge pas le paragraphe. */
const DEBUT_DE_BLOC = /^\s*(?:#|>|\||[-*+]\s|\d+[.)]\s|```|~~~)/u;

interface Paragraphe {
  texte: string;
  /** Position dans `texte` du début de chaque ligne, et son numéro dans le livrable. */
  lignes: Array<{ debut: number; numero: number }>;
}

/** Paragraphes du livrable : lignes normalisées jointes par une espace. */
function paragraphes(livrable: string): Paragraphe[] {
  const sortie: Paragraphe[] = [];
  let courant: Paragraphe | null = null;
  livrable.split(/\r?\n/u).forEach((brute, i) => {
    if (brute.trim() === "") {
      courant = null;
      return;
    }
    if (!courant || DEBUT_DE_BLOC.test(brute)) {
      courant = { texte: "", lignes: [] };
      sortie.push(courant);
    } else courant.texte += " ";
    courant.lignes.push({ debut: courant.texte.length, numero: i + 1 });
    courant.texte += normaliser(brute);
  });
  return sortie;
}

/** La formule trouvée à `index` est-elle niée ? Négation dans les deux mots qui la précèdent (même proposition) ou dans la formule. */
function niee(texte: string, index: number, formule: string, negationDansLaFormule: boolean): boolean {
  const avant = texte.slice(Math.max(0, index - LECTURE_AVANT), index);
  const proposition = avant.slice(Math.max(...[",", ";", ":", ".", "!", "?", "("].map((s) => avant.lastIndexOf(s))) + 1);
  const mots = proposition.split(/\s+/u).filter((m) => /\p{L}/u.test(m)).slice(-MOTS_AVANT);
  return NEGATION.test(mots.join(" ")) || (!negationDansLaFormule && NEGATION.test(formule));
}

export function controlerPromesses(livrable: string): ConstatPromesse[] {
  const constats: ConstatPromesse[] = [];
  for (const { texte, lignes } of paragraphes(livrable)) {
    for (const { libelle, motif, negationDansLaFormule } of FORMULES) {
      for (const m of texte.matchAll(motif)) {
        if (niee(texte, m.index, m[0], negationDansLaFormule)) continue;
        const ligne = lignes.filter((l) => l.debut <= m.index).at(-1)!.numero;
        constats.push({ code: "promesse_interdite", libelle, ligne, extrait: m[0] });
        break;
      }
    }
  }
  return constats;
}
