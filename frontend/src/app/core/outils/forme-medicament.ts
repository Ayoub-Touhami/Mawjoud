import type { NomIcone } from '../../shared/icone/icones';

/** Icône décorative selon la forme : gélule, comprimé, sirop, goutte (collyres, solutions), boîte sinon. */
export function iconeForme(forme: string | null | undefined): NomIcone {
  const f = (forme ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/gelule|capsule/.test(f)) return 'gelule';
  if (/comprime|cachet/.test(f)) return 'comprime';
  if (/sirop|suspension buvable|solution buvable/.test(f)) return 'sirop';
  if (/collyre|goutte|solution/.test(f)) return 'goutte';
  return 'boite';
}
