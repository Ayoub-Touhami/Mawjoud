import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { COMPTES_TEST } from '../donnees-test/comptes';
import { MEDICAMENTS_TEST } from '../donnees-test/medicaments';
import { PHARMACIES_TEST } from '../donnees-test/pharmacies';
import { fabriquerStocks } from '../donnees-test/stocks';
import { statutStock } from '../models';
import { PharmacieApiMock } from './pharmacie-api.mock';

describe('données de test', () => {
  it('contient 22 pharmacies et 40 médicaments, sans identifiant en double', () => {
    expect(PHARMACIES_TEST.length).toBe(22);
    expect(MEDICAMENTS_TEST.length).toBe(40);
    expect(new Set(PHARMACIES_TEST.map((p) => p.id)).size).toBe(22);
    expect(new Set(MEDICAMENTS_TEST.map((m) => m.id)).size).toBe(40);
  });

  it('place toutes les pharmacies en Tunisie et les marque comme données de test', () => {
    for (const p of PHARMACIES_TEST) {
      expect(p.latitude).toBeGreaterThan(30);
      expect(p.latitude).toBeLessThan(38);
      expect(p.longitude).toBeGreaterThan(7);
      expect(p.longitude).toBeLessThan(12);
      expect(p.donneeTest).toBe(true);
    }
  });

  it('couvre les pharmacies inscrites et non inscrites', () => {
    expect(new Set(PHARMACIES_TEST.map((p) => p.etat)).size).toBe(2);
  });

  it('couvre les quatre statuts visibles, pour des pharmacies inscrites seulement', () => {
    const stocks = fabriquerStocks();
    const inscrites = new Set(
      PHARMACIES_TEST.filter((p) => p.etat === 'inscrite').map((p) => p.id),
    );
    expect(new Set(stocks.map((s) => statutStock(s))).size).toBe(4);
    expect(stocks.every((s) => inscrites.has(s.pharmacieId))).toBe(true);
  });

  it('ne stocke aucun mot de passe et couvre les trois rôles', () => {
    expect(COMPTES_TEST.some((c) => 'motDePasse' in c)).toBe(false);
    expect(new Set(COMPTES_TEST.map((c) => c.role)).size).toBe(3);
  });
});

describe('PharmacieApiMock', () => {
  let api: PharmacieApiMock;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [PharmacieApiMock] });
    api = TestBed.inject(PharmacieApiMock);
  });

  it('filtre par ville', async () => {
    const sfax = await firstValueFrom(api.listerPharmacies('Sfax'));
    expect(sfax.length).toBeGreaterThan(0);
    expect(sfax.every((p) => p.ville === 'Sfax')).toBe(true);
  });

  it('trouve un médicament sans accent ni majuscule', async () => {
    const resultats = await firstValueFrom(api.chercherMedicaments('levothyroxine'));
    expect(resultats.length).toBe(2);
  });

  it('marque une pharmacie déjà réclamée', async () => {
    expect((await firstValueFrom(api.obtenirPharmacie('T004')))?.etat).toBe('reclamee');
  });
});
