import { Pharmacie, PlageHoraire } from '../models';

export interface Coordonnees {
  latitude: number;
  longitude: number;
}

export interface Ouverture {
  ouverte: boolean;
  /** Heure de fermeture de la plage en cours, au format HH:mm. */
  jusqua?: string;
}

/** Une pharmacie réclamée n'est pas encore vérifiée : elle reste affichée comme non inscrite. */
export function estInscrite(pharmacie: Pharmacie): boolean {
  return pharmacie.etat === 'inscrite';
}

/** Distance à vol d'oiseau, calculée sur l'appareil. */
export function distanceMetres(a: Coordonnees, b: Coordonnees): number {
  const radians = (degres: number) => (degres * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export function lienTelephone(telephone: string): string {
  return `tel:${telephone.replace(/[^+\d]/g, '')}`;
}

/** +21600000001 devient +216 00 000 001. */
export function telephoneLisible(telephone: string): string {
  const chiffres = telephone.replace(/[^\d]/g, '');
  const local = chiffres.startsWith('216') ? chiffres.slice(3) : chiffres;
  if (local.length !== 8) {
    return telephone;
  }
  const groupes = `${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
  return chiffres.startsWith('216') ? `+216 ${groupes}` : groupes;
}

/**
 * Ouvre l'application de cartes de l'appareil. Le lien ne contient que la destination :
 * c'est l'application choisie par l'utilisateur qui demandera sa position, si besoin.
 */
export function lienItineraire(
  pharmacie: Pharmacie,
  agent: string = navigator.userAgent,
): string {
  const destination = `${pharmacie.latitude},${pharmacie.longitude}`;
  if (/android/i.test(agent)) {
    return `geo:${destination}?q=${destination}`;
  }
  if (/iphone|ipad|ipod/i.test(agent)) {
    return `https://maps.apple.com/?daddr=${destination}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

const FORMAT_TUNIS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Tunis',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const JOURS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Calcule l'état à l'heure de Tunis, quel que soit le fuseau de l'appareil. */
export function etatOuverture(
  horaires: PlageHoraire[],
  maintenant: Date = new Date(),
): Ouverture | null {
  if (!horaires.length) {
    return null;
  }
  const morceaux = FORMAT_TUNIS.formatToParts(maintenant);
  const valeur = (type: string) => morceaux.find((m) => m.type === type)?.value ?? '';
  const jour = JOURS.indexOf(valeur('weekday'));
  const heure = `${valeur('hour')}:${valeur('minute')}`;
  const plage = horaires.find(
    (h) => h.jours.includes(jour) && h.ouverture <= heure && heure < h.fermeture,
  );
  return plage ? { ouverte: true, jusqua: plage.fermeture } : { ouverte: false };
}
