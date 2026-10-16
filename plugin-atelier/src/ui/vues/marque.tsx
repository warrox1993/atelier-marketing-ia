/**
 * Rubrique 6 : marque et sources (cahier §11 et §12). Identité, ton, offres,
 * zones, établissements, affirmations autorisées, informations manquantes,
 * versions ; sources collectées ; imports contrôlés (texte, Markdown, CSV).
 * Chaque enregistrement crée une NOUVELLE version (jamais d'écrasement).
 */
import { useState, type FormEvent } from "react";
import { LIMITES } from "../../contrats/identifiants.js";
import type { DocumentImporte } from "../../contrats/sources.js";
import { CATALOGUE_MODULES_CONFORMITE, type ReferentielClient } from "../../contrats/referentiel.js";
import type { VueMarque } from "../../contrats/ui.js";
import { Champ, Bouton, EnTete, EtatErreur, Fraicheur, Horodatage, Lecture, ListeOuAucun, MentionDemo, Pastille, Section, Vide } from "../composants.js";
import { useAction, useDonnees } from "../donnees.js";
import { STATUTS_ACCES_SOURCE } from "../format.js";

export function VueMarqueAtelier() {
  const r = useDonnees<VueMarque>("atelier.marque");
  const [edition, setEdition] = useState(false);
  return (
    <>
      <EnTete
        titre="Marque et sources"
        description="Ce que les agents ont le droit d'affirmer, et d'où viennent leurs informations. Une offre ou un établissement non confirmé reste à vérifier."
        actions={
          <Bouton variante={edition ? "discret" : "secondaire"} onClick={() => setEdition((x) => !x)}>
            {edition ? "Fermer l'édition" : r.data?.marque ? "Nouvelle version" : "Saisir la marque"}
          </Bouton>
        }
      />
      <Fraicheur chargeLe={r.chargeLe} actualisation={r.loading && r.data !== null} />
      <Lecture r={r} libelle="marque et sources">
        {(d) => (
          <>
            {edition ? (
              <EditeurMarque
                initiale={d.marque}
                onFait={() => {
                  setEdition(false);
                  r.refresh();
                }}
              />
            ) : null}
            {d.marque ? <FicheMarque marque={d.marque} versions={d.versions} /> : <Vide titre="Aucune marque enregistrée.">Saisissez l'identité, le ton et les offres confirmées : les relecteurs s'en servent pour refuser les promesses non autorisées.</Vide>}
            <Section titre={`Sources collectées (${d.sources.length})`} aide="Données externes, non fiables par principe : une instruction trouvée dans une page est signalée, jamais exécutée.">
              {d.sources.length === 0 ? (
                <p className="atl-attenue">Aucune source collectée.</p>
              ) : (
                <div className="atl-table-cadre">
                  <table className="atl-table">
                    <thead>
                      <tr>
                        <th scope="col">Source</th>
                        <th scope="col">Accès</th>
                        <th scope="col">Collectée</th>
                        <th scope="col">Signalements</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.sources.map((s) => (
                        <tr key={s.id}>
                          <th scope="row" data-libelle="Source">
                            <span className="atl-url">{s.titre ?? s.url}</span>
                            <span className="atl-sous atl-url">{s.urlFinale ?? s.url}</span>
                            {s.mode === "demonstration" ? <MentionDemo compacte /> : null}
                          </th>
                          <td data-libelle="Accès">
                            <Pastille ton={STATUTS_ACCES_SOURCE[s.statutAcces]?.ton}>{STATUTS_ACCES_SOURCE[s.statutAcces]?.libelle ?? s.statutAcces}</Pastille>
                          </td>
                          <td data-libelle="Collectée">
                            <Horodatage iso={s.dateCollecte} />
                          </td>
                          <td data-libelle="Signalements">
                            {s.injectionsSignalees.length ? (
                              <span className="atl-texte-danger">{s.injectionsSignalees.length} instruction(s) suspecte(s) ignorée(s)</span>
                            ) : s.indicesErreur.length ? (
                              <span>Indices de page d'erreur</span>
                            ) : (
                              <span className="atl-attenue">aucun</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
            <Section titre={`Documents importés (${d.imports.length})`} aide={`Texte, Markdown ou CSV ; ${Math.round(LIMITES.importTailleMaxOctets / 1024)} Kio au plus, ${LIMITES.importLignesCsvMax} lignes CSV au plus.`}>
              <FormulaireImport onFait={r.refresh} />
              {d.imports.length ? <TableImports imports={d.imports} /> : <p className="atl-attenue">Aucun document importé.</p>}
            </Section>
          </>
        )}
      </Lecture>
    </>
  );
}

function FicheMarque({ marque: m, versions }: { marque: ReferentielClient; versions: VueMarque["versions"] }) {
  return (
    <Section titre={`Version ${m.version}`} aide={<>Enregistrée <Horodatage iso={m.creeLe} />{versions.length > 1 ? `, ${versions.length} versions au total` : ""}.</>}>
      <dl className="atl-champs atl-champs-grille">
        <div>
          <dt>Identité</dt>
          <dd>{m.identite}</dd>
        </div>
        <div>
          <dt>Ton</dt>
          <dd>{m.ton}</dd>
        </div>
        <div>
          <dt>Zones</dt>
          <dd>
            <ListeOuAucun valeurs={m.zones} aucun="aucune" />
          </dd>
        </div>
        <div>
          <dt>Offres</dt>
          <dd>
            {m.offres.length ? (
              <ul className="atl-liste-compacte">
                {m.offres.map((o, i) => (
                  <li key={`${i}-${o.nom}`}>
                    <strong>{o.nom}</strong> {o.confirmee ? <Pastille ton="succes">Confirmée</Pastille> : <Pastille ton="attention">À confirmer</Pastille>}
                    <span className="atl-sous">{o.description}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="atl-attenue">aucune</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Établissements</dt>
          <dd>
            {m.etablissements.length ? (
              <ul className="atl-liste-compacte">
                {m.etablissements.map((e, i) => (
                  <li key={`${i}-${e.nom}`}>
                    {e.nom} {e.confirme ? <Pastille ton="succes">Confirmé</Pastille> : <Pastille ton="attention">À confirmer</Pastille>}
                    <span className="atl-sous">{e.adresse ?? "adresse non renseignée"}</span>
                    {e.position ? <span className="atl-sous">Position : {virgule(e.position.lat)} ; {virgule(e.position.lon)}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="atl-attenue">aucun</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Affirmations autorisées</dt>
          <dd>
            {m.affirmationsAutorisees.length ? (
              <ul className="atl-liste-compacte">
                {m.affirmationsAutorisees.map((a, i) => (
                  <li key={`${i}-${a.texte}`}>
                    {a.texte} <span className="atl-attenue">{a.sourceId ? "sourcée" : "sans source"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="atl-attenue">aucune : toute affirmation commerciale devra être sourcée</span>
            )}
          </dd>
        </div>
      </dl>
      <ReferentielEtendu m={m} />
      {m.informationsManquantes.length ? (
        <div className="atl-encart" data-ton="attention">
          <p className="atl-encart-titre">Informations manquantes</p>
          <ul className="atl-liste-compacte">
            {m.informationsManquantes.map((x, i) => (
              <li key={`${i}-${x}`}>{x}</li>
            ))}
          </ul>
          <p className="atl-attenue">Les agents doivent bloquer avec une question plutôt qu'inventer ces informations.</p>
        </div>
      ) : null}
      {versions.length > 1 ? (
        <details className="atl-details">
          <summary>Versions précédentes</summary>
          <ul className="atl-liste-compacte">
            {versions.map((v) => (
              <li key={v.version}>
                Version {v.version}, <Horodatage iso={v.creeLe} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Section>
  );
}

/** Référentiel étendu du client, en lecture seule : entités, segments, cibles de prospection, modules actifs. */
function ReferentielEtendu({ m: marque }: { m: ReferentielClient }) {
  // Une ancienne version relue sans ces listes s'affiche comme une version sans référentiel étendu.
  const m = { entites: marque.entites ?? [], segments: marque.segments ?? [], ciblesProspection: marque.ciblesProspection ?? [], modulesConformite: marque.modulesConformite ?? [] };
  if (!m.entites.length && !m.segments.length && !m.ciblesProspection.length && !m.modulesConformite.length) return null;
  const nomEntite = (code: string) => m.entites.find((e) => e.code === code)?.nom ?? code;
  return (
    <dl className="atl-champs atl-champs-grille">
      <div>
        <dt>Entités</dt>
        <dd>
          {m.entites.length ? (
            <ul className="atl-liste-compacte">
              {m.entites.map((e) => (
                <li key={e.code}>
                  <strong>{e.nom}</strong> <span className="atl-attenue">{e.type === "marque" && e.porteePar ? `marque de ${nomEntite(e.porteePar)}` : "entité juridique"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="atl-attenue">aucune</span>
          )}
        </dd>
      </div>
      <div>
        <dt>Segments</dt>
        <dd>{m.segments.length ? <ul className="atl-liste-compacte">{m.segments.map((s) => <li key={s.code}>{s.libelle}</li>)}</ul> : <span className="atl-attenue">aucun</span>}</dd>
      </div>
      <div>
        <dt>Cibles de prospection</dt>
        <dd>
          {m.ciblesProspection.length ? (
            <ul className="atl-liste-compacte">
              {m.ciblesProspection.map((c) => (
                <li key={c.code}>
                  {c.libelle} <span className="atl-attenue">{c.cible === "les_deux" ? "B2C et B2B" : c.cible.toUpperCase()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="atl-attenue">aucune</span>
          )}
        </dd>
      </div>
      <div>
        <dt>Modules de conformité actifs</dt>
        <dd>
          {m.modulesConformite.length ? (
            <ul className="atl-liste-compacte">
              {m.modulesConformite.map((x) => (
                <li key={x.code}>
                  {CATALOGUE_MODULES_CONFORMITE[x.code].libelle}{" "}
                  <span className="atl-attenue">{x.entites.length ? x.entites.map(nomEntite).join(", ") : "toutes les entités"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="atl-attenue">aucun</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

function lignesTexte(t: string): string[] {
  return t
    .split(/\r?\n/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Lit un nombre décimal saisi avec point ou virgule ; `null` si le texte n'est pas un nombre. */
function lireDecimal(t: string): number | null {
  const v = t.trim().replace(",", ".");
  return /^[+-]?\d+(\.\d+)?$/u.test(v) ? Number(v) : null;
}

/** Contrôle la position saisie d'un établissement : les deux ou aucune, latitude et longitude dans leurs bornes. */
export function lirePosition(latTexte: string, lonTexte: string): { position: { lat: number; lon: number } | null; erreur: string | null } {
  const a = latTexte.trim();
  const o = lonTexte.trim();
  if (!a && !o) return { position: null, erreur: null };
  if (!a || !o) return { position: null, erreur: "Indiquez la latitude et la longitude, ou laissez les deux vides." };
  const lat = lireDecimal(a);
  const lon = lireDecimal(o);
  if (lat === null || lon === null) return { position: null, erreur: "La latitude et la longitude doivent être des nombres (par exemple 50,6123 et 5,5612)." };
  if (lat < -90 || lat > 90) return { position: null, erreur: "La latitude doit être comprise entre -90 et 90." };
  if (lon < -180 || lon > 180) return { position: null, erreur: "La longitude doit être comprise entre -180 et 180." };
  return { position: { lat, lon }, erreur: null };
}

/**
 * Lit les segments suivis saisis pour un établissement (codes séparés par des virgules, points-virgules
 * ou espaces). Chaque code doit exister parmi les segments du référentiel : le serveur refuse les autres.
 */
export function lireSegmentsSuivis(texte: string, codesConnus: readonly string[]): { codes: string[]; erreur: string | null } {
  const codes = Array.from(new Set(texte.split(/[\s,;]+/u).map((c) => c.trim()).filter(Boolean)));
  const inconnus = codes.filter((c) => !codesConnus.includes(c));
  if (inconnus.length === 0) return { codes, erreur: null };
  return {
    codes: [],
    erreur:
      codesConnus.length === 0
        ? "Aucun segment n'est défini dans le référentiel du client : videz ce champ ou définissez d'abord les segments."
        : `Segment inconnu : ${inconnus.join(", ")}. Codes possibles : ${codesConnus.join(", ")}.`,
  };
}

const virgule = (n: number) => String(n).replace(".", ",");

export function EditeurMarque({ initiale, onFait }: { initiale: ReferentielClient | null; onFait(): void }) {
  const enregistrer = useAction<ReferentielClient>("atelier.marque.enregistrer");
  const [identite, setIdentite] = useState(initiale?.identite ?? "");
  const [ton, setTon] = useState(initiale?.ton ?? "");
  const [zones, setZones] = useState((initiale?.zones ?? []).join("\n"));
  const [manquantes, setManquantes] = useState((initiale?.informationsManquantes ?? []).join("\n"));
  const [affirmations, setAffirmations] = useState((initiale?.affirmationsAutorisees ?? []).map((a) => a.texte).join("\n"));
  const [offres, setOffres] = useState(initiale?.offres.length ? initiale.offres : [{ nom: "", description: "", confirmee: false }]);
  const [etabs, setEtabs] = useState(initiale?.etablissements.length ? initiale.etablissements.map((e) => ({ ...e, adresse: e.adresse ?? "", lat: e.position ? virgule(e.position.lat) : "", lon: e.position ? virgule(e.position.lon) : "", segmentsTexte: (e.segmentsSuivis ?? []).join(", ") })) : [{ nom: "", adresse: "", confirme: false, lat: "", lon: "", segmentsTexte: "" }]);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const erreursPosition = etabs.map((x) => (x.nom.trim() ? lirePosition(x.lat, x.lon).erreur : null));
  const codesSegments = (initiale?.segments ?? []).map((sg) => sg.code);
  const erreursSegments = etabs.map((x) => (x.nom.trim() ? lireSegmentsSuivis(x.segmentsTexte, codesSegments).erreur : null));
  const raison = !identite.trim() ? "L'identité est obligatoire." : !ton.trim() ? "Le ton est obligatoire." : erreursPosition.some(Boolean) ? "Une position d'établissement est invalide." : erreursSegments.some(Boolean) ? "Les segments suivis d'un établissement sont invalides." : null;

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    if (raison) return;
    setEnCours(true);
    setErreur(null);
    try {
      const anciennes = new Map((initiale?.affirmationsAutorisees ?? []).map((a) => [a.texte, a.sourceId]));
      await enregistrer({
        identite: identite.trim(),
        ton: ton.trim(),
        offres: offres.filter((o) => o.nom.trim()).map((o) => ({ ...o, nom: o.nom.trim(), description: o.description.trim(), confirmee: o.confirmee })),
        zones: lignesTexte(zones),
        etablissements: etabs.filter((x) => x.nom.trim()).map(({ lat, lon, segmentsTexte, segmentsSuivis: _ancien, ...x }) => {
          const segments = lireSegmentsSuivis(segmentsTexte, codesSegments).codes;
          return { ...x, nom: x.nom.trim(), adresse: x.adresse.trim() || null, confirme: x.confirme, position: lirePosition(lat, lon).position, ...(segments.length > 0 ? { segmentsSuivis: segments } : {}) };
        }),
        affirmationsAutorisees: lignesTexte(affirmations).map((texte) => ({ texte, sourceId: anciennes.get(texte) ?? null })),
        informationsManquantes: lignesTexte(manquantes),
        // Champs étendus du référentiel : non modifiables ici, conservés d'une version à l'autre.
        entites: initiale?.entites ?? [],
        segments: initiale?.segments ?? [],
        ciblesProspection: initiale?.ciblesProspection ?? [],
        modulesConformite: initiale?.modulesConformite ?? [],
      });
      onFait();
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Section titre={initiale ? `Nouvelle version (après la version ${initiale.version})` : "Première version de la marque"}>
      <form className="atl-formulaire" onSubmit={(e) => void soumettre(e)} noValidate>
        <div className="atl-grille-champs">
          <Champ libelle="Identité">
            <textarea value={identite} onChange={(e) => setIdentite(e.target.value)} rows={2} />
          </Champ>
          <Champ libelle="Ton">
            <textarea value={ton} onChange={(e) => setTon(e.target.value)} rows={2} />
          </Champ>
        </div>
        <fieldset className="atl-champ">
          <legend>Offres</legend>
          {offres.map((o, i) => (
            <div className="atl-repeteur" key={i} role="group" aria-label={`Offre ${i + 1}`}>
              <Champ libelle={<>Nom<span className="atl-sr"> de l'offre {i + 1}</span></>}>
                <input value={o.nom} onChange={(e) => setOffres((l) => l.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))} />
              </Champ>
              <Champ libelle={<>Description<span className="atl-sr"> de l'offre {i + 1}</span></>}>
                <input value={o.description} onChange={(e) => setOffres((l) => l.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              </Champ>
              <label className="atl-case">
                <input type="checkbox" checked={o.confirmee} onChange={(e) => setOffres((l) => l.map((x, j) => (j === i ? { ...x, confirmee: e.target.checked } : x)))} /> Confirmée<span className="atl-sr"> (offre {i + 1})</span>
              </label>
              <Bouton variante="discret" onClick={() => setOffres((l) => l.filter((_, j) => j !== i))}>
                Retirer<span className="atl-sr"> l'offre {i + 1}</span>
              </Bouton>
            </div>
          ))}
          <Bouton variante="discret" onClick={() => setOffres((l) => [...l, { nom: "", description: "", confirmee: false }])}>
            Ajouter une offre
          </Bouton>
        </fieldset>
        <fieldset className="atl-champ">
          <legend>Établissements</legend>
          {etabs.map((x, i) => (
            <div className="atl-repeteur" key={i} role="group" aria-label={`Établissement ${i + 1}`}>
              <Champ libelle={<>Nom<span className="atl-sr"> de l'établissement {i + 1}</span></>}>
                <input value={x.nom} onChange={(e) => setEtabs((l) => l.map((y, j) => (j === i ? { ...y, nom: e.target.value } : y)))} />
              </Champ>
              <Champ libelle={<>Adresse<span className="atl-sr"> de l'établissement {i + 1}</span></>}>
                <input value={x.adresse} onChange={(e) => setEtabs((l) => l.map((y, j) => (j === i ? { ...y, adresse: e.target.value } : y)))} />
              </Champ>
              <Champ libelle={<>Latitude<span className="atl-sr"> de l'établissement {i + 1}</span></>} aide="Facultatif : sert à la carte des prospects et à la distance au bureau. Clic droit sur le lieu dans OpenStreetMap ou Google Maps pour copier les coordonnées.">
                <input inputMode="decimal" value={x.lat} onChange={(e) => setEtabs((l) => l.map((y, j) => (j === i ? { ...y, lat: e.target.value } : y)))} />
              </Champ>
              <Champ libelle={<>Longitude<span className="atl-sr"> de l'établissement {i + 1}</span></>}>
                <input inputMode="decimal" value={x.lon} onChange={(e) => setEtabs((l) => l.map((y, j) => (j === i ? { ...y, lon: e.target.value } : y)))} />
              </Champ>
              {erreursPosition[i] ? <p className="atl-widget-erreur" role="alert">{erreursPosition[i]}</p> : null}
              <Champ
                libelle={<>Segments suivis<span className="atl-sr"> par l'établissement {i + 1}</span></>}
                aide={codesSegments.length > 0 ? `Facultatif : codes séparés par des virgules, parmi ${codesSegments.join(", ")}. Sert au critère « bureau spécialisé proche ».` : "Facultatif. Aucun segment n'est encore défini dans le référentiel du client : il faut d'abord les définir pour les attribuer à un bureau."}
              >
                <input value={x.segmentsTexte} onChange={(e) => setEtabs((l) => l.map((y, j) => (j === i ? { ...y, segmentsTexte: e.target.value } : y)))} />
              </Champ>
              {erreursSegments[i] ? <p className="atl-widget-erreur" role="alert">{erreursSegments[i]}</p> : null}
              <label className="atl-case">
                <input type="checkbox" checked={x.confirme} onChange={(e) => setEtabs((l) => l.map((y, j) => (j === i ? { ...y, confirme: e.target.checked } : y)))} /> Confirmé<span className="atl-sr"> (établissement {i + 1})</span>
              </label>
              <Bouton variante="discret" onClick={() => setEtabs((l) => l.filter((_, j) => j !== i))}>
                Retirer<span className="atl-sr"> l'établissement {i + 1}</span>
              </Bouton>
            </div>
          ))}
          <Bouton variante="discret" onClick={() => setEtabs((l) => [...l, { nom: "", adresse: "", confirme: false, lat: "", lon: "", segmentsTexte: "" }])}>
            Ajouter un établissement
          </Bouton>
        </fieldset>
        <div className="atl-grille-champs">
          <Champ libelle="Zones" aide="Une par ligne.">
            <textarea value={zones} onChange={(e) => setZones(e.target.value)} rows={3} />
          </Champ>
          <Champ libelle="Affirmations autorisées" aide="Une par ligne ; les sources déjà liées sont conservées.">
            <textarea value={affirmations} onChange={(e) => setAffirmations(e.target.value)} rows={3} />
          </Champ>
          <Champ libelle="Informations manquantes" aide="Une par ligne.">
            <textarea value={manquantes} onChange={(e) => setManquantes(e.target.value)} rows={3} />
          </Champ>
        </div>
        {erreur ? <EtatErreur erreur={erreur} contexte="version non enregistrée" /> : null}
        <Bouton type="submit" variante="principal" raisonDesactive={raison} enCours={enCours}>
          Enregistrer une nouvelle version
        </Bouton>
      </form>
    </Section>
  );
}

function FormulaireImport({ onFait }: { onFait(): void }) {
  const importer = useAction<DocumentImporte>("atelier.import");
  const [nomFichier, setNomFichier] = useState("");
  const [type, setType] = useState<"texte" | "markdown" | "csv">("texte");
  const [contenu, setContenu] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [fait, setFait] = useState<DocumentImporte | null>(null);
  const taille = new TextEncoder().encode(contenu).length;
  const raison = !nomFichier.trim()
    ? "Choisissez un fichier ou indiquez un nom."
    : /[/\\]/u.test(nomFichier)
      ? "Nom de fichier sans chemin."
      : !contenu
        ? "Le document est vide."
        : taille > LIMITES.importTailleMaxOctets
          ? `Document trop volumineux (${Math.round(taille / 1024)} Kio).`
          : null;

  const [refusFichier, setRefusFichier] = useState<string | null>(null);
  const lireFichier = async (f: File | undefined) => {
    if (!f) return;
    // Taille contrôlée AVANT de lire le fichier (revue du lot C) : un gros fichier
    // n'est jamais chargé en mémoire dans le navigateur.
    if (f.size > LIMITES.importTailleMaxOctets) {
      setRefusFichier(`Fichier trop volumineux (${Math.round(f.size / 1024)} Kio pour ${Math.round(LIMITES.importTailleMaxOctets / 1024)} Kio au plus) : non lu.`);
      setContenu("");
      setNomFichier("");
      return;
    }
    setRefusFichier(null);
    setNomFichier(f.name);
    setType(/\.csv$/iu.test(f.name) ? "csv" : /\.(md|markdown)$/iu.test(f.name) ? "markdown" : "texte");
    setContenu(await f.text());
  };

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    if (raison) return;
    setEnCours(true);
    setErreur(null);
    setFait(null);
    try {
      const doc = await importer({ campagneId: null, nomFichier: nomFichier.trim(), type, contenu });
      setFait(doc);
      setContenu("");
      setNomFichier("");
      onFait();
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <details className="atl-details">
      <summary>Importer un document</summary>
      <form className="atl-formulaire" onSubmit={(e) => void soumettre(e)} noValidate>
        <Champ libelle="Fichier">
          <input type="file" accept=".txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv" onChange={(e) => void lireFichier(e.target.files?.[0])} />
        </Champ>
        <div className="atl-grille-champs">
          <Champ libelle="Nom">
            <input value={nomFichier} onChange={(e) => setNomFichier(e.target.value)} maxLength={200} />
          </Champ>
          <Champ libelle="Type">
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="texte">Texte</option>
              <option value="markdown">Markdown</option>
              <option value="csv">CSV</option>
            </select>
          </Champ>
        </div>
        <Champ libelle="Contenu">
          <textarea value={contenu} onChange={(e) => setContenu(e.target.value)} rows={4} />
        </Champ>
        {refusFichier ? (
          <p className="atl-texte-danger" role="alert">
            {refusFichier}
          </p>
        ) : null}
        {erreur ? <EtatErreur erreur={erreur} contexte="import refusé" /> : null}
        {fait ? (
          <p className="atl-succes" role="status">
            « {fait.nomFichier} » importé ({fait.tailleOctets} octets{fait.injectionsSignalees.length ? `, ${fait.injectionsSignalees.length} instruction(s) suspecte(s) signalée(s)` : ""}).
          </p>
        ) : null}
        <Bouton type="submit" variante="principal" raisonDesactive={raison} enCours={enCours}>
          Importer
        </Bouton>
      </form>
    </details>
  );
}

function TableImports({ imports }: { imports: DocumentImporte[] }) {
  return (
    <div className="atl-table-cadre">
      <table className="atl-table">
        <thead>
          <tr>
            <th scope="col">Document</th>
            <th scope="col">Type</th>
            <th scope="col" className="atl-num">Taille</th>
            <th scope="col">Signalements</th>
            <th scope="col">Importé</th>
          </tr>
        </thead>
        <tbody>
          {imports.map((x) => (
            <tr key={x.id}>
              <th scope="row" data-libelle="Document">
                {x.nomFichier}
                {x.colonnes ? <span className="atl-sous">Colonnes : {x.colonnes.join(", ")}</span> : null}
              </th>
              <td data-libelle="Type">{x.type === "csv" ? "CSV" : x.type === "markdown" ? "Markdown" : "Texte"}</td>
              <td data-libelle="Taille" className="atl-num">
                {x.tailleOctets} o{x.lignes !== null ? `, ${x.lignes} lignes` : ""}
              </td>
              <td data-libelle="Signalements">{x.injectionsSignalees.length ? <span className="atl-texte-danger">{x.injectionsSignalees.length} instruction(s) suspecte(s)</span> : <span className="atl-attenue">aucun</span>}</td>
              <td data-libelle="Importé">
                <Horodatage iso={x.creeLe} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
