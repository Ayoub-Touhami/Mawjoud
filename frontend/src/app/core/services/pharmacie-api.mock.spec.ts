import { firstValueFrom } from 'rxjs';
import { COMPTES_TEST } from '../donnees-test/comptes';
import { MEDICAMENTS_TEST } from '../donnees-test/medicaments';
import { PHARMACIES_TEST } from '../donnees-test/pharmacies';
import { fabriquerStocks } from '../donnees-test/stocks';
import { statutStock } from '../models';
import { PharmacieApiMock } from './pharmacie-api.mock';

describe('données de test', () => {
  it('contient 30 pharmacies et 50 médicaments, sans identifiant en double', () => {
    expect(PHARMACIES_TEST.length).toBe(30);
    expect(MEDICAMENTS_TEST.length).toBe(50);
    expect(new Set(PHARMACIES_TEST.map((p) => p.id)).size).toBe(30);
    expect(new Set(MEDICAMENTS_TEST.map((m) => m.id)).size).toBe(50);
  });

  it('place toutes les pharmacies en Tunisie et les marque comme inventées', () => {
    for (const p of PHARMACIES_TEST) {
      expect(p.latitude).toBeGreaterThan(30);
      expect(p.latitude).toBeLessThan(38);
      expect(p.longitude).toBeGreaterThan(7);
      expect(p.longitude).toBeLessThan(12);
      expect(p.source).toContain('inventées');
    }
  });

  it('couvre les trois états de pharmacie', () => {
    expect(new Set(PHARMACIES_TEST.map((p) => p.etat)).size).toBe(3);
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
    api = new PharmacieApiMock();
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

  it('remplace le dernier statut déclaré sur sa propre pharmacie', async () => {
    const [existant] = await firstValueFrom(api.stocksDePharmacie('ph-01'));
    await firstValueFrom(api.declarerStock('u-03', 'ph-01', existant.medicamentId, 'en-rupture'));
    const stocks = await firstValueFrom(api.stocksDePharmacie('ph-01'));
    const lignes = stocks.filter((s) => s.medicamentId === existant.medicamentId);
    expect(lignes.length).toBe(1);
    expect(lignes[0].statutDeclare).toBe('en-rupture');
  });

  it("refuse la déclaration sur la pharmacie d'un autre (R9)", async () => {
    await expect(
      firstValueFrom(api.declarerStock('u-03', 'ph-02', 'med-01', 'disponible')),
    ).rejects.toThrow();
  });

  it('refuse la déclaration à un compte non vérifié (R3)', async () => {
    await expect(
      firstValueFrom(api.declarerStock('u-04', 'ph-08', 'med-01', 'disponible')),
    ).rejects.toThrow();
  });

  it("ne crée pas de doublon d'alerte", async () => {
    const avant = await firstValueFrom(api.listerAlertes('u-01'));
    const alerte = await firstValueFrom(api.creerAlerte('u-01', 'med-19', 'Tunis'));
    expect(alerte.id).toBe('al-01');
    expect(await firstValueFrom(api.listerAlertes('u-01'))).toHaveLength(avant.length);
  });

  it('inscrit la pharmacie seulement après validation', async () => {
    expect((await firstValueFrom(api.obtenirPharmacie('ph-08')))?.etat).toBe('reclamee');
    await firstValueFrom(api.validerDemande('dem-01'));
    expect((await firstValueFrom(api.obtenirPharmacie('ph-08')))?.etat).toBe('inscrite');
    await expect(
      firstValueFrom(api.declarerStock('u-04', 'ph-08', 'med-01', 'disponible')),
    ).resolves.toBeTruthy();
  });
});
