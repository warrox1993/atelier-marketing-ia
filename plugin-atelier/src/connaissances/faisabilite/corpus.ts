/**
 * Corpus fictif du lot R0 : 1 000 passages d'assurance (démonstration), français et néerlandais,
 * générés de façon déterministe. Aucune marque, aucune personne réelle.
 */

const PRODUITS_FR = ["assurance habitation", "assurance auto", "protection juridique", "assurance familiale", "assurance incendie", "assurance vélo", "assistance voyage", "assurance hospitalisation"];
const PRODUITS_NL = ["woningverzekering", "autoverzekering", "rechtsbijstand", "familiale verzekering", "brandverzekering", "fietsverzekering", "reisbijstand", "hospitalisatieverzekering"];
const SUJETS_FR = [
  "La franchise s'élève à {n} euros par sinistre et est indexée chaque année.",
  "Le bris de vitre est couvert sans franchise si la réparation est faite par un réparateur agréé.",
  "La déclaration de sinistre doit parvenir à l'assureur dans les {n} jours ouvrables.",
  "Les dégâts des eaux causés par une infiltration lente ne sont pas couverts.",
  "Le plafond d'indemnisation est fixé à {n} 000 euros par événement.",
  "Une réclamation peut être adressée au service de médiation après la réponse de l'assureur.",
  "Le courtier transmet le dossier complet avec photos et facture d'achat.",
  "La prime annuelle peut être fractionnée en paiements mensuels sans frais.",
  "Le vol de vélo électrique est couvert à condition d'un antivol homologué.",
  "Le délai de carence est de {n} mois pour les maladies préexistantes.",
];
const SUJETS_NL = [
  "Het eigen risico bedraagt {n} euro per schadegeval en wordt jaarlijks geïndexeerd.",
  "Glasbreuk is gedekt zonder eigen risico bij herstelling door een erkende hersteller.",
  "De schadeaangifte moet binnen {n} werkdagen bij de verzekeraar zijn.",
  "Waterschade door een trage insijpeling is niet gedekt.",
  "Het maximale vergoedingsbedrag is {n} 000 euro per schadegeval.",
  "Een klacht kan na het antwoord van de verzekeraar naar de ombudsdienst gestuurd worden.",
  "De makelaar bezorgt het volledige dossier met foto's en aankoopfactuur.",
  "De jaarpremie kan zonder kosten in maandelijkse betalingen gespreid worden.",
  "Diefstal van een elektrische fiets is gedekt op voorwaarde van een goedgekeurd slot.",
  "De wachttijd bedraagt {n} maanden voor reeds bestaande aandoeningen.",
];

export interface PassageFictif {
  numero: number;
  langue: "fr" | "nl";
  texte: string;
}

export function genererCorpus(nombre = 1000): PassageFictif[] {
  const passages: PassageFictif[] = [];
  for (let i = 0; i < nombre; i += 1) {
    const nl = i % 3 === 2;
    const produits = nl ? PRODUITS_NL : PRODUITS_FR;
    const sujets = nl ? SUJETS_NL : SUJETS_FR;
    const produit = produits[(i * 7) % produits.length]!;
    const s1 = sujets[i % sujets.length]!.replace("{n}", String(50 + ((i * 37) % 450)));
    const s2 = sujets[(i * 3 + 1) % sujets.length]!.replace("{n}", String(2 + (i % 28)));
    const titre = nl ? `Voorwaarden ${produit} (demonstratie), artikel ${1 + (i % 40)}` : `Conditions ${produit} (démonstration), article ${1 + (i % 40)}`;
    passages.push({ numero: i, langue: nl ? "nl" : "fr", texte: `${titre} › ${s1} ${s2}` });
  }
  return passages;
}

/** Questions d'essai : le passage attendu contient la phrase-sujet indiquée (indice dans SUJETS_*). */
export const QUESTIONS = [
  { langue: "fr", texte: "Mon pare-brise est fissuré, est-ce que je paie quelque chose ?", sujet: 1 },
  { langue: "fr", texte: "Combien de temps ai-je pour déclarer un dégât ?", sujet: 2 },
  { langue: "fr", texte: "Une fuite lente dans le mur est-elle remboursée ?", sujet: 3 },
  { langue: "fr", texte: "Je ne suis pas d'accord avec la réponse, à qui me plaindre ?", sujet: 5 },
  { langue: "fr", texte: "Peut-on payer tous les mois ?", sujet: 7 },
  { langue: "nl", texte: "Mijn voorruit is gebarsten, moet ik iets betalen?", sujet: 1 },
  { langue: "nl", texte: "Is mijn e-bike verzekerd tegen diefstal?", sujet: 8 },
  { langue: "nl", texte: "Hoe lang moet ik wachten voor een bestaande ziekte?", sujet: 9 },
] as const;

export function phraseSujet(langue: "fr" | "nl", sujet: number): string {
  const s = (langue === "nl" ? SUJETS_NL : SUJETS_FR)[sujet]!;
  return s.slice(0, 20);
}
