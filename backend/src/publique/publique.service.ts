import { Injectable } from '@nestjs/common';
import { BaseService, type Executeur } from '../base/base.service.js';
import { ErreurApi } from '../securite/erreurs.js';
import {
  PLAFOND_CARTE,
  STATUTS_DISPONIBLES,
  type CarteDto,
  type DisponibilitesDto,
  type ListePharmaciesDto,
  type ProchesDto,
  type RechercheMedicamentsDto,
  type VillesDto,
} from './dto.js';

/**
 * API publique en lecture : recherche, carte, fiches, disponibilités.
 * Toutes les requêtes passent par BaseService.lecturePublique (lecture seule, rôle
 * mawjoud_lecture_publique) et ne citent que les vues publique.* : seules les pharmacies
 * « publiee » existent pour elles, avec une position forcément confirmée (contrainte de 007/022).
 * Valeurs toujours en paramètres ; les caractères %, _ et \ saisis sont échappés dans les LIKE.
 */

const RAYON_TERRE_KM = 6371;
const KM_PAR_DEGRE_LAT = 111.32;

/** Échappe \, % et _ pour un motif LIKE … ESCAPE '\'. */
export function echapperLike(texte: string): string {
  return texte.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Colonnes publiques d'une pharmacie (vue publique.pharmacie), sans source brute ni date interne. */
const COLONNES = `p.id, p.nom, p.rue, p.quartier, p.ville, p.code_postal, p.gouvernorat_code, p.gouvernorat,
  p.telephone_principal, p.telephones_autres, p.latitude, p.longitude, p.garde, p.etat,
  p.source_gps IN ('osm_telephone', 'osm_nom_ville') AS source_osm`;

/** Distance haversine en km entre la pharmacie p et le point ($1 latitude, $2 longitude). */
const DISTANCE = `2 * ${RAYON_TERRE_KM} * asin(least(1.0, sqrt(
    power(sin(radians(p.latitude - $1::float8) / 2), 2)
  + cos(radians($1::float8)) * cos(radians(p.latitude)) * power(sin(radians(p.longitude - $2::float8) / 2), 2))))`;

interface LignePharmacie {
  id: string;
  nom: string;
  rue: string | null;
  quartier: string | null;
  ville: string | null;
  code_postal: string | null;
  gouvernorat_code: number;
  gouvernorat: string;
  telephone_principal: string | null;
  telephones_autres: string[];
  latitude: number;
  longitude: number;
  garde: 'jour' | 'nuit' | null;
  etat: string;
  source_osm: boolean;
  distance_km?: number;
}

const tirets = (v: string) => v.replaceAll('_', '-');
const arrondi = (km: number) => Math.round(km * 100) / 100;

/** Forme commune (listes, proches, disponibilités). */
function resume(l: LignePharmacie) {
  return {
    id: l.id,
    nom: l.nom,
    rue: l.rue,
    quartier: l.quartier,
    ville: l.ville,
    gouvernorat: { code: l.gouvernorat_code, nom: l.gouvernorat },
    telephone: l.telephone_principal,
    latitude: l.latitude,
    longitude: l.longitude,
    garde: l.garde,
    etat: tirets(l.etat),
    ...(l.distance_km !== undefined && l.distance_km !== null ? { distanceKm: arrondi(Number(l.distance_km)) } : {}),
  };
}

/** Boîte englobante d'un cercle (filtre indexé avant le calcul exact de la distance). */
function boite(lat: number, lng: number, rayonKm: number) {
  const dLat = rayonKm / KM_PAR_DEGRE_LAT;
  const dLng = rayonKm / (KM_PAR_DEGRE_LAT * Math.cos((lat * Math.PI) / 180));
  return { sud: lat - dLat, nord: lat + dLat, ouest: lng - dLng, est: lng + dLng };
}

@Injectable()
export class PubliqueService {
  constructor(private readonly base: BaseService) {}

  private lire<R>(fn: (l: Executeur) => Promise<R>): Promise<R> {
    return this.base.lecturePublique(fn);
  }

  async lister(f: ListePharmaciesDto) {
    const filtres = [
      f.gouvernorat ?? null,
      f.ville ?? null,
      f.garde ?? null,
      f.nom !== undefined ? echapperLike(f.nom) : null,
    ];
    const condition = `($1::smallint IS NULL OR p.gouvernorat_code = $1)
      AND ($2::text IS NULL OR public.normaliser(p.ville) = public.normaliser($2))
      AND ($3::boolean IS NULL OR coalesce(p.garde = 'nuit', false) = $3)
      AND ($4::text IS NULL OR public.normaliser(p.nom) LIKE '%' || public.normaliser($4) || '%' ESCAPE '\\')`;
    return this.lire(async (l) => {
      const [{ total }] = await l.requete<{ total: number }>(
        `SELECT count(*)::int AS total FROM publique.pharmacie p WHERE ${condition}`, filtres);
      const lignes = await l.requete<LignePharmacie>(
        `SELECT ${COLONNES} FROM publique.pharmacie p WHERE ${condition}
          ORDER BY public.normaliser(p.nom), p.id LIMIT $5 OFFSET $6`,
        [...filtres, f.taille, (f.page - 1) * f.taille]);
      return { elements: lignes.map(resume), page: f.page, taille: f.taille, total };
    });
  }

  async proches(d: ProchesDto) {
    const b = boite(d.lat, d.lng, d.rayon_km);
    return this.lire(async (l) => {
      const lignes = await l.requete<LignePharmacie>(
        `SELECT * FROM (
           SELECT ${COLONNES}, ${DISTANCE} AS distance_km
             FROM publique.pharmacie p
            WHERE p.latitude BETWEEN $3 AND $4 AND p.longitude BETWEEN $5 AND $6
         ) d
          WHERE d.distance_km <= $7
          ORDER BY d.distance_km, d.id
          LIMIT $8`,
        [d.lat, d.lng, b.sud, b.nord, b.ouest, b.est, d.rayon_km, d.limite]);
      return { elements: lignes.map(resume), rayonKm: d.rayon_km };
    });
  }

  async carte(c: CarteDto) {
    if (c.sud > c.nord || c.ouest > c.est) throw new ErreurApi(400, 'donnees-invalides', { champs: ['sud', 'nord', 'ouest', 'est'] });
    return this.lire(async (l) => {
      const lignes = await l.requete<{ id: string; nom: string; latitude: number; longitude: number; garde: string | null }>(
        `SELECT p.id, p.nom, p.latitude, p.longitude, p.garde
           FROM publique.pharmacie p
          WHERE p.latitude BETWEEN $1 AND $2 AND p.longitude BETWEEN $3 AND $4
          ORDER BY p.id
          LIMIT $5`,
        [c.sud, c.nord, c.ouest, c.est, PLAFOND_CARTE + 1]);
      const tronque = lignes.length > PLAFOND_CARTE;
      return { points: lignes.slice(0, PLAFOND_CARTE), tronque, plafond: PLAFOND_CARTE, zoom: c.zoom };
    });
  }

  async fiche(id: string) {
    return this.lire(async (l) => {
      const [p] = await l.requete<LignePharmacie>(`SELECT ${COLONNES} FROM publique.pharmacie p WHERE p.id = $1`, [id]);
      if (!p) throw new ErreurApi(404, 'introuvable');
      const horaires = await l.requete<{ jour: number; ouverture: string; fermeture: string }>(
        `SELECT jour, to_char(ouverture, 'HH24:MI') AS ouverture, to_char(fermeture, 'HH24:MI') AS fermeture
           FROM publique.horaire WHERE pharmacie_id = $1 ORDER BY jour, ouverture`, [id]);
      return {
        ...resume(p),
        codePostal: p.code_postal,
        telephonesAutres: p.telephones_autres,
        horaires,
        // Mention « © OpenStreetMap contributors » à afficher si vrai (licence ODbL).
        sourceOpenStreetMap: p.source_osm,
      };
    });
  }

  async medicaments(r: RechercheMedicamentsDto) {
    return this.lire(async (l) => {
      const lignes = await l.requete<{
        id: string; nom_commercial: string; dci: string; forme: string | null; dosage: string | null;
        categorie: string | null; nom_ar: string | null; dci_ar: string | null; donnee_test: boolean;
      }>(
        `WITH q AS (SELECT public.normaliser($1) AS t, public.normaliser($2) AS e),
              m AS (SELECT m.*, public.normaliser(m.nom_commercial) AS n, public.normaliser(m.dci) AS d FROM publique.medicament m)
         SELECT m.id, m.nom_commercial, m.dci, m.forme, m.dosage, m.categorie, m.nom_ar, m.dci_ar, m.donnee_test
           FROM m, q
          WHERE m.n LIKE '%' || q.e || '%' ESCAPE '\\' OR m.d LIKE '%' || q.e || '%' ESCAPE '\\'
             OR m.n % q.t OR m.d % q.t
          ORDER BY CASE
                     WHEN m.n = q.t OR m.d = q.t THEN 0
                     WHEN m.n LIKE q.e || '%' ESCAPE '\\' OR m.d LIKE q.e || '%' ESCAPE '\\' THEN 1
                     WHEN m.n LIKE '%' || q.e || '%' ESCAPE '\\' OR m.d LIKE '%' || q.e || '%' ESCAPE '\\' THEN 2
                     ELSE 3
                   END,
                   greatest(similarity(m.n, q.t), similarity(m.d, q.t)) DESC,
                   m.nom_commercial, m.dosage NULLS FIRST, m.id
          LIMIT $3`,
        [r.q, echapperLike(r.q), r.limite]);
      return {
        elements: lignes.map((m) => ({
          id: m.id, nomCommercial: m.nom_commercial, dci: m.dci, forme: m.forme, dosage: m.dosage,
          categorie: m.categorie, nomAr: m.nom_ar, dciAr: m.dci_ar, donneeTest: m.donnee_test,
        })),
      };
    });
  }

  /**
   * Pharmacies publiées et inscrites (R7, vue publique.stock) qui déclarent ce médicament disponible
   * ou en quantité limitée. « À confirmer » (R6, 24 h) n'est pas calculé ici : la date de déclaration
   * est renvoyée et le front-end applique sa règle (FraicheurService), seule source de cette règle.
   */
  async disponibilites(medicamentId: string, d: DisponibilitesDto) {
    if ((d.lat === undefined) !== (d.lng === undefined)) throw new ErreurApi(400, 'donnees-invalides', { champs: ['lat', 'lng'] });
    const avecDistance = d.lat !== undefined && d.lng !== undefined;
    return this.lire(async (l) => {
      const [m] = await l.requete(`SELECT 1 FROM publique.medicament WHERE id = $1`, [medicamentId]);
      if (!m) throw new ErreurApi(404, 'introuvable');
      const lignes = await l.requete<LignePharmacie & { statut: string; declare_le: Date }>(
        avecDistance
          ? `SELECT ${COLONNES}, s.statut, s.declare_le, ${DISTANCE} AS distance_km
               FROM publique.stock s JOIN publique.pharmacie p ON p.id = s.pharmacie_id
              WHERE s.medicament_id = $3 AND s.statut = ANY($4::text[])
              ORDER BY distance_km, p.id LIMIT $5`
          : `SELECT ${COLONNES}, s.statut, s.declare_le
               FROM publique.stock s JOIN publique.pharmacie p ON p.id = s.pharmacie_id
              WHERE s.medicament_id = $1 AND s.statut = ANY($2::text[])
              ORDER BY s.declare_le DESC, p.id LIMIT $3`,
        avecDistance
          ? [d.lat!, d.lng!, medicamentId, [...STATUTS_DISPONIBLES], d.limite]
          : [medicamentId, [...STATUTS_DISPONIBLES], d.limite]);
      return {
        elements: lignes.map((x) => ({
          pharmacie: resume(x),
          statut: tirets(x.statut),
          declareLe: x.declare_le.toISOString(),
        })),
      };
    });
  }

  async gouvernorats() {
    return this.lire(async (l) => {
      const lignes = await l.requete<{ code: number; nom: string; nombre: number }>(
        `SELECT g.code, g.nom, count(*)::int AS nombre
           FROM publique.gouvernorat g JOIN publique.pharmacie p ON p.gouvernorat_code = g.code
          GROUP BY g.code, g.nom ORDER BY g.nom`);
      return { elements: lignes.map((g) => ({ code: g.code, nom: g.nom, nombrePharmacies: g.nombre })) };
    });
  }

  async villes(v: VillesDto) {
    return this.lire(async (l) => {
      const lignes = await l.requete<{ nom: string; gouvernorat_code: number; nombre: number }>(
        `SELECT min(p.ville) AS nom, p.gouvernorat_code, count(*)::int AS nombre
           FROM publique.pharmacie p
          WHERE p.ville IS NOT NULL AND ($1::smallint IS NULL OR p.gouvernorat_code = $1)
          GROUP BY public.normaliser(p.ville), p.gouvernorat_code
          ORDER BY public.normaliser(min(p.ville)), p.gouvernorat_code`,
        [v.gouvernorat ?? null]);
      return { elements: lignes.map((x) => ({ nom: x.nom, gouvernorat: x.gouvernorat_code, nombrePharmacies: x.nombre })) };
    });
  }
}
