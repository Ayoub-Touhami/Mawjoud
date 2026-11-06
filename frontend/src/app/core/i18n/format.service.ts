import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { PlageHoraire } from '../models';
import { LangueService } from './langue.service';

const MINUTE_MS = 60 * 1000;
/** Du lundi au dimanche, l'ordre de lecture des horaires. */
const ORDRE_JOURS = [1, 2, 3, 4, 5, 6, 0];

/** Durées, distances et horaires écrits dans la langue active. */
@Injectable({ providedIn: 'root' })
export class FormatService {
  private readonly transloco = inject(TranslocoService);
  private readonly langues = inject(LangueService);

  private texte(cle: string, valeurs?: Record<string, unknown>): string {
    this.langues.langue();
    return this.transloco.translate(cle, valeurs);
  }

  age(date: string | number, maintenant: number = Date.now()): string {
    const minutes = Math.floor((maintenant - new Date(date).getTime()) / MINUTE_MS);
    if (minutes < 1) {
      return this.texte('temps.instant');
    }
    if (minutes < 60) {
      return this.duree('minutes', minutes);
    }
    const heures = Math.floor(minutes / 60);
    return heures < 48 ? this.duree('heures', heures) : this.duree('jours', Math.floor(heures / 24));
  }

  /** L'arabe a un singulier, un duel et deux pluriels : « منذ ساعتين », « منذ 3 ساعات ». */
  private duree(unite: 'minutes' | 'heures' | 'jours', n: number): string {
    const forme = new Intl.PluralRules(this.langues.langue()).select(n);
    return this.texte(`temps.${unite}.${forme}`, { n });
  }

  distance(metres: number): string {
    const nombres = new Intl.NumberFormat(this.langues.langue() === 'ar' ? 'ar-TN' : 'fr-FR', {
      maximumFractionDigits: 1,
      numberingSystem: 'latn',
    });
    return metres < 1000
      ? this.texte('distance.m', { n: Math.round(metres / 10) * 10 })
      : this.texte('distance.km', { n: nombres.format(metres / 1000) });
  }

  heure(valeur: string): string {
    if (this.langues.langue() === 'ar') {
      return valeur;
    }
    const [heures, minutes] = valeur.split(':');
    const h = Number.parseInt(heures, 10);
    return minutes === '00' ? `${h} h` : `${h} h ${minutes}`;
  }

  /** Regroupe les jours aux mêmes heures : « Lun-Sam 8 h-20 h ». */
  plages(horaires: PlageHoraire[]): string[] {
    return horaires.map((plage) => {
      const jours = ORDRE_JOURS.filter((jour) => plage.jours.includes(jour));
      const premier = ORDRE_JOURS.indexOf(jours[0]);
      const suivis = jours.every((jour, i) => ORDRE_JOURS.indexOf(jour) === premier + i);
      const noms = jours.map((jour) => this.texte(`jours.${jour}`));
      const libelle =
        suivis && noms.length > 1 ? `${noms[0]}-${noms[noms.length - 1]}` : noms.join(', ');
      return `${libelle} ${this.heure(plage.ouverture)}-${this.heure(plage.fermeture)}`;
    });
  }
}
