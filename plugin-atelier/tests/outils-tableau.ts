/** Fabriques de données fictives du tableau de direction (aucune donnée réelle, aucun nom de client). */
import type { ChiffreRapport, DonneesDirection, RapportMensuel } from "../src/contrats/index.js";

export const SOCIETE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P = { debut: "2026-10-01T00:00:00.000Z", fin: "2026-10-31T23:59:59.999Z" };
const ch = (cle: string, libelle: string, valeur: number | null): ChiffreRapport => ({ cle, libelle, valeur, mesure: valeur !== null, source: `table_${cle}`, periode: P, mode: null, note: null });

export const rapportFictif = (o: { trouves?: number | null; qualifies?: number | null; couts?: RapportMensuel["coutsIa"]["lignes"]; attente?: number; mois?: string } = {}): RapportMensuel => {
  const lignes = o.couts ?? [];
  const total = lignes.reduce((t, l) => ({ jetonsEntree: t.jetonsEntree + l.jetonsEntree, jetonsEntreeCache: t.jetonsEntreeCache + l.jetonsEntreeCache, jetonsSortie: t.jetonsSortie + l.jetonsSortie, coutCentimes: t.coutCentimes + l.coutCentimes }), { jetonsEntree: 0, jetonsEntreeCache: 0, jetonsSortie: 0, coutCentimes: 0 });
  return {
    companyId: SOCIETE, entreprise: "Cabinet fictif", mois: o.mois ?? "2026-10", periode: P, genereLe: "2026-11-02T08:00:00.000Z",
    campagnes: [ch("campagnes_actives", "Campagnes actives", 2)],
    contenus: [ch("contenus_produits_reel", "Contenus produits", 9), ch("contenus_valides_reel", "Contenus validés", 6), ch("contenus_publies_reel", "Contenus publiés", 4)],
    prospects: { chiffres: [ch("prospects_trouves_reel", "Prospects trouvés", o.trouves === undefined ? 100 : o.trouves)], badges: [ch("prospects_qualifies", "Qualifiés", o.qualifies === undefined ? 20 : o.qualifies)], tronque: false, plafond: 5000 },
    resultats: { chiffres: [], mesures: [] },
    coutsIa: { lignes, total, source: "cost_events", periode: P, note: "" },
    enAttenteClient: { points: Array.from({ length: o.attente ?? 2 }, (_, i) => ({ type: "carte", titre: `Point ${i + 1}`, raison: "À décider" })), source: "accueil", note: "" },
  };
};

export const coutFictif = (agent: string, cout: number, entree = 1000, sortie = 200): RapportMensuel["coutsIa"]["lignes"][number] => ({ agent, modele: "modele-x", facturation: cout ? "api" : "abonnement", jetonsEntree: entree, jetonsEntreeCache: 0, jetonsSortie: sortie, coutCentimes: cout });

const h = (jour: number, heure = 9) => `2026-10-${String(jour).padStart(2, "0")}T${String(heure).padStart(2, "0")}:00:00.000Z`;

export const directionFictive = (o: Partial<DonneesDirection> = {}): DonneesDirection => ({
  companyId: SOCIETE, mois: "2026-10", periode: P, genereLe: "2026-11-02T08:00:00.000Z",
  prospects: { trouves: 100, avecNumero: 60 },
  etapes: { contactes: 30, rendezVous: 6, clientsGagnes: 2 },
  captation: { vues: null, soumissions: null },
  emailing: { envois: null },
  missions: {
    lignes: [
      { id: "m1", identifiant: "MKT-1", titre: "Campagne d'automne", statut: "done", creeLe: h(1), termineLe: h(11) },
      { id: "m2", identifiant: "MKT-2", titre: "Veille concurrents", statut: "in_progress", creeLe: h(5), termineLe: null },
    ],
    taches: [
      { missionId: "m1", titre: "Plan de stratégie", statut: "done", agentNom: "Stratégie", agentCle: null, creeLe: h(1, 8), termineLe: h(2, 8) },
      { missionId: "m1", titre: "Rédaction des contenus", statut: "done", agentNom: "Contenus", agentCle: null, creeLe: h(2, 9), termineLe: h(5, 9) },
      { missionId: "m2", titre: "Prospection de la zone", statut: "in_progress", agentNom: "Prospection", agentCle: null, creeLe: h(6), termineLe: null },
    ],
    plafond: 80,
  },
  coutParMission: { lignes: [{ identifiant: "MKT-1", titre: "Campagne d'automne", coutCentimes: 1500, jetons: 9000 }], coutSansMissionCentimes: 300 },
  delaiDecision: { heures: [2, 4, 30] },
  ...o,
});
