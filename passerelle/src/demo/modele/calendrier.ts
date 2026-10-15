// Calendrier du modèle : dates civiles « AAAA-MM-JJ » (journées de Bruxelles),
// calculées en UTC pour éviter tout effet d'heure d'été. Jours fériés légaux belges
// (fixes et mobiles, à partir de Pâques).

/** Date civile au format AAAA-MM-JJ. */
export type DateIso = string;

const MS_JOUR = 86_400_000;

export function versNumeroJour(date: DateIso): number {
  const [a, m, j] = date.split("-").map(Number) as [number, number, number];
  return Math.round(Date.UTC(a, m - 1, j) / MS_JOUR);
}

export function depuisNumeroJour(numero: number): DateIso {
  return new Date(numero * MS_JOUR).toISOString().slice(0, 10);
}

export function ajouterJours(date: DateIso, jours: number): DateIso {
  return depuisNumeroJour(versNumeroJour(date) + jours);
}

/** Toutes les dates de `debut` à `fin`, bornes comprises. */
export function datesEntre(debut: DateIso, fin: DateIso): DateIso[] {
  const dates: DateIso[] = [];
  for (let n = versNumeroJour(debut); n <= versNumeroJour(fin); n++) dates.push(depuisNumeroJour(n));
  return dates;
}

/** Jour de la semaine : 0 = lundi … 6 = dimanche. */
export function jourSemaine(date: DateIso): number {
  return (new Date(versNumeroJour(date) * MS_JOUR).getUTCDay() + 6) % 7;
}

export function mois(date: DateIso): number {
  return Number(date.slice(5, 7));
}

export function annee(date: DateIso): number {
  return Number(date.slice(0, 4));
}

/** Dimanche de Pâques (algorithme grégorien anonyme, Meeus/Jones/Butcher). */
export function paques(an: number): DateIso {
  const a = an % 19;
  const b = Math.floor(an / 100);
  const c = an % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const moisPaques = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return `${an}-${String(moisPaques).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

const FERIES_FIXES = ["01-01", "05-01", "07-21", "08-15", "11-01", "11-11", "12-25"];
const cacheFeries = new Map<number, Set<DateIso>>();

/** Jours fériés légaux en Belgique : 7 fixes, lundi de Pâques, Ascension, lundi de Pentecôte. */
export function joursFeries(an: number): Set<DateIso> {
  let feries = cacheFeries.get(an);
  if (!feries) {
    const p = paques(an);
    feries = new Set([...FERIES_FIXES.map((md) => `${an}-${md}`), ajouterJours(p, 1), ajouterJours(p, 39), ajouterJours(p, 50)]);
    cacheFeries.set(an, feries);
  }
  return feries;
}

export function estFerie(date: DateIso): boolean {
  return joursFeries(annee(date)).has(date);
}

/** Congé de fin d'année : du 24 décembre au 1er janvier. */
export function estFinAnnee(date: DateIso): boolean {
  const md = date.slice(5);
  return md >= "12-24" || md === "01-01";
}
