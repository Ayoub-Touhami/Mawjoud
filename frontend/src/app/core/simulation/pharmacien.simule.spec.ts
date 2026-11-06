import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { firstValueFrom, Observable } from 'rxjs';
import { pharmacienGuard } from '../guards/pharmacien.guard';
import { fournirTraductionTest } from '../i18n/traduction.test-outils';
import { Stock } from '../models';
import { CLAIM_SERVICE } from '../services/claim.service';
import { FraicheurService } from '../services/fraicheur.service';
import { HORLOGE } from '../services/horloge';
import { PHARMACIE_API } from '../services/pharmacie-api';
import { STOCK_SERVICE } from '../services/stock.service';
import { AdminClaimServiceSimule } from '../../features/administration/services/admin.simule';
import { AlertServiceSimule } from './alert.service.simule';
import { AuthServiceSimule } from './auth.service.simule';
import { ClaimServiceSimule } from './claim.service.simule';
import { fournirSimulation } from './fournir-simulation';
import { PharmacistAuthServiceSimule } from './pharmacist-auth.service.simule';
import { StockServiceSimule } from './stock.service.simule';

const HEURE_MS = 60 * 60 * 1000;
const NON_INSCRITE = 'T006';
const AUTRE = 'T007';
const RECLAMEE = 'T004';
const MEDICAMENT = 'M037';

describe('espace pharmacien simulé', () => {
  let maintenant: Date;
  let auth: AuthServiceSimule;
  let pharmaciens: PharmacistAuthServiceSimule;
  let claims: ClaimServiceSimule;
  let stocks: StockServiceSimule;
  let admin: AdminClaimServiceSimule;

  beforeEach(() => {
    localStorage.clear();
    maintenant = new Date('2026-11-06T10:00:00.000Z');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        fournirTraductionTest(),
        fournirSimulation(),
        { provide: HORLOGE, useValue: () => maintenant },
      ],
    });
    auth = TestBed.inject(AuthServiceSimule);
    pharmaciens = TestBed.inject(PharmacistAuthServiceSimule);
    claims = TestBed.inject(ClaimServiceSimule);
    stocks = TestBed.inject(StockServiceSimule);
    admin = TestBed.inject(AdminClaimServiceSimule);
  });

  async function compteEmailVerifie(email = 'ph@exemple.tn') {
    await firstValueFrom(pharmaciens.creerCompte(email, 'mot-de-passe-test'));
    await firstValueFrom(auth.verifierEmail(auth.jetonEnAttente() as string));
  }

  async function pharmacienValide(pharmacieId = NON_INSCRITE) {
    await compteEmailVerifie();
    const demande = await firstValueFrom(claims.reclamer(pharmacieId, {}));
    await firstValueFrom(admin.validerDemande(demande.id));
  }

  const etatPharmacie = async (id: string) =>
    (await firstValueFrom(TestBed.inject(PHARMACIE_API).obtenirPharmacie(id)))?.etat;
  const garde = (etape: Parameters<typeof pharmacienGuard>[0]) =>
    firstValueFrom(
      TestBed.runInInjectionContext(() =>
        pharmacienGuard(etape)({} as never, { url: etape } as never),
      ) as Observable<boolean | UrlTree>,
    );
  const adresse = (resultat: boolean | UrlTree) =>
    resultat === true ? true : TestBed.inject(Router).serializeUrl(resultat as UrlTree);

  it('bloque un pharmacien non vérifié, par la garde et par le service', async () => {
    await compteEmailVerifie();
    expect(adresse(await garde('/pharmacien'))).toBe('/pharmacien/reclamer');
    await firstValueFrom(claims.reclamer(NON_INSCRITE, {}));
    expect(adresse(await garde('/pharmacien'))).toBe('/pharmacien/attente');
    expect(pharmaciens.peutDeclarer()).toBe(false);
    await expect(
      firstValueFrom(stocks.declarer(NON_INSCRITE, MEDICAMENT, 'disponible')),
    ).rejects.toBe('non-autorise');
  });

  it("demande de vérifier l'e-mail avant la réclamation", async () => {
    await firstValueFrom(pharmaciens.creerCompte('ph@exemple.tn', 'mot-de-passe-test'));
    expect(adresse(await garde('/pharmacien/reclamer'))).toBe('/compte/verification-email');
  });

  it('limite le pharmacien à sa pharmacie (R9)', async () => {
    await pharmacienValide();
    await expect(firstValueFrom(stocks.declarer(AUTRE, MEDICAMENT, 'disponible'))).rejects.toBe(
      'non-autorise',
    );
    await expect(firstValueFrom(stocks.declarer('T001', 'M001', 'en-rupture'))).rejects.toBe(
      'non-autorise',
    );
    await expect(firstValueFrom(stocks.confirmerTout('T001'))).rejects.toBe('non-autorise');
    await expect(firstValueFrom(stocks.retirerMedicament('T001', 'M001'))).rejects.toBe(
      'non-autorise',
    );
    await expect(
      firstValueFrom(stocks.declarer(NON_INSCRITE, MEDICAMENT, 'disponible')),
    ).resolves.toBeTruthy();
  });

  it("n'inscrit la pharmacie qu'après validation", async () => {
    await compteEmailVerifie();
    expect(await etatPharmacie(NON_INSCRITE)).toBe('non-inscrite');
    const demande = await firstValueFrom(claims.reclamer(NON_INSCRITE, {}));
    expect(await etatPharmacie(NON_INSCRITE)).toBe('reclamee');
    await firstValueFrom(admin.validerDemande(demande.id));
    expect(await etatPharmacie(NON_INSCRITE)).toBe('inscrite');
    expect(pharmaciens.peutDeclarer()).toBe(true);
  });

  it("envoie à l'administrateur la réclamation d'une pharmacie déjà réclamée", async () => {
    await compteEmailVerifie();
    const demande = await firstValueFrom(claims.reclamer(RECLAMEE, {}));
    expect(demande.conflit).toBe(true);
    expect(demande.etat).toBe('en-attente');
    await expect(firstValueFrom(claims.reclamer(NON_INSCRITE, {}))).rejects.toBe(
      'demande-en-cours',
    );
  });

  it('montre le motif du refus et permet une nouvelle réclamation', async () => {
    await compteEmailVerifie();
    const demande = await firstValueFrom(claims.reclamer(NON_INSCRITE, {}));
    await firstValueFrom(admin.refuserDemande(demande.id, { code: 'justificatif-illisible' }));
    expect((await firstValueFrom(claims.maDemande()))?.motifCode).toBe('justificatif-illisible');
    expect(adresse(await garde('/pharmacien/reclamer'))).toBe(true);
    expect(await etatPharmacie(NON_INSCRITE)).toBe('non-inscrite');
    await expect(firstValueFrom(claims.reclamer(NON_INSCRITE, {}))).resolves.toBeTruthy();
  });

  it('enregistre une demande d ajout pour une pharmacie absente', async () => {
    await compteEmailVerifie();
    const demande = await firstValueFrom(
      claims.demanderAjout({ nom: 'P', adresse: 'A', ville: 'V', telephone: '71000000' }, {}),
    );
    expect(demande.pharmacieId).toBeNull();
    expect(demande.ajout?.nom).toBe('P');
  });

  it('ne garde que le nom et la taille du fichier joint', async () => {
    await compteEmailVerifie();
    await firstValueFrom(
      claims.reclamer(NON_INSCRITE, { fichier: { nom: 'carte.pdf', taille: 1200 }, texte: 'Ordre' }),
    );
    const demande = await firstValueFrom(claims.maDemande());
    expect(demande?.justificatif).toEqual({
      fichier: { nom: 'carte.pdf', taille: 1200 },
      texte: 'Ordre',
    });
  });

  it('affiche le nouveau statut dans les données publiques, sans doublon', async () => {
    await pharmacienValide();
    const service = TestBed.inject(STOCK_SERVICE);
    await firstValueFrom(service.declarer(NON_INSCRITE, MEDICAMENT, 'quantite-limitee'));
    await firstValueFrom(service.declarer(NON_INSCRITE, MEDICAMENT, 'disponible'));
    const public_ = await firstValueFrom(service.stocksDeMedicament(MEDICAMENT));
    expect(public_.map((s) => s.statutDeclare)).toEqual(['disponible']);
    expect(await firstValueFrom(service.stocksDePharmacie(NON_INSCRITE))).toHaveLength(1);
  });

  it('passe à « à confirmer » après 24 h, puis la mise à jour retire la mention', async () => {
    await pharmacienValide();
    const fraicheur = TestBed.inject(FraicheurService);
    await firstValueFrom(stocks.declarer(NON_INSCRITE, MEDICAMENT, 'disponible'));
    const lire = async (): Promise<Stock> =>
      (await firstValueFrom(stocks.stocksDePharmacie(NON_INSCRITE)))[0];

    maintenant = new Date(maintenant.getTime() + 24 * HEURE_MS);
    expect(fraicheur.lire(await lire()).aConfirmer).toBe(false);

    maintenant = new Date(maintenant.getTime() + 2 * HEURE_MS);
    const ancienne = fraicheur.lire(await lire());
    expect(ancienne.statut).toBe('a-confirmer');
    expect(ancienne.statutDeclare).toBe('disponible');
    expect(ancienne.detail).toContain('il y a 26 h');
    expect(ancienne.detail).toContain('disponible');

    await firstValueFrom(stocks.declarer(NON_INSCRITE, MEDICAMENT, 'disponible'));
    const renouvelee = fraicheur.lire(await lire());
    expect(renouvelee.aConfirmer).toBe(false);
    expect(renouvelee.statut).toBe('disponible');
  });

  it('« Tout est à jour » renouvelle les heures sans changer les statuts', async () => {
    await pharmacienValide();
    await firstValueFrom(stocks.declarer(NON_INSCRITE, 'M001', 'en-rupture'));
    await firstValueFrom(stocks.declarer(NON_INSCRITE, 'M002', 'disponible'));
    maintenant = new Date(maintenant.getTime() + 30 * HEURE_MS);
    await firstValueFrom(stocks.confirmerTout(NON_INSCRITE));
    const liste = await firstValueFrom(stocks.stocksDePharmacie(NON_INSCRITE));
    expect(liste.map((s) => s.statutDeclare).sort()).toEqual(['disponible', 'en-rupture']);
    expect(liste.every((s) => s.declareLe === maintenant.toISOString())).toBe(true);
  });

  it('signale un échec réseau sans rien enregistrer', async () => {
    await pharmacienValide();
    await firstValueFrom(stocks.declarer(NON_INSCRITE, MEDICAMENT, 'disponible'));
    stocks.simulerPanne(true);
    await expect(firstValueFrom(stocks.declarer(NON_INSCRITE, MEDICAMENT, 'en-rupture'))).rejects.toBe(
      'reseau',
    );
    const [stock] = await firstValueFrom(stocks.stocksDePharmacie(NON_INSCRITE));
    expect(stock.statutDeclare).toBe('disponible');
    stocks.simulerPanne(false);
    await expect(
      firstValueFrom(stocks.declarer(NON_INSCRITE, MEDICAMENT, 'en-rupture')),
    ).resolves.toBeTruthy();
  });

  it('retire un médicament suivi de l affichage public', async () => {
    await pharmacienValide();
    await firstValueFrom(stocks.suivreMedicament(NON_INSCRITE, 'M001'));
    expect(await firstValueFrom(stocks.medicamentsSuivis(NON_INSCRITE))).toEqual(['M001']);
    expect(await firstValueFrom(stocks.stocksDePharmacie(NON_INSCRITE))).toHaveLength(0);
    await firstValueFrom(stocks.declarer(NON_INSCRITE, 'M001', 'disponible'));
    await firstValueFrom(stocks.retirerMedicament(NON_INSCRITE, 'M001'));
    expect(await firstValueFrom(stocks.medicamentsSuivis(NON_INSCRITE))).toEqual([]);
    expect(await firstValueFrom(stocks.stocksDePharmacie(NON_INSCRITE))).toEqual([]);
  });

  it('déclenche seulement les alertes concernées, sans adresse non vérifiée', async () => {
    const alertes = TestBed.inject(AlertServiceSimule);
    const lieu = (await firstValueFrom(TestBed.inject(PHARMACIE_API).obtenirPharmacie(NON_INSCRITE)))
      ?.gouvernorat as string;
    await firstValueFrom(auth.creerCompte('patient@exemple.tn', 'mot-de-passe-test'));
    await firstValueFrom(auth.verifierEmail(auth.jetonEnAttente() as string));
    const bonne = await firstValueFrom(alertes.creerAlerte(MEDICAMENT, lieu));
    const partout = await firstValueFrom(alertes.creerAlerte(MEDICAMENT, null));
    const ailleurs = await firstValueFrom(alertes.creerAlerte(MEDICAMENT, 'Tozeur'));
    const autre = await firstValueFrom(alertes.creerAlerte('M001', lieu));
    auth.seDeconnecter();
    await firstValueFrom(auth.creerCompte('attente@exemple.tn', 'mot-de-passe-test'));
    const nonVerifiee = await firstValueFrom(alertes.creerAlerte(MEDICAMENT, null));
    auth.seDeconnecter();

    await pharmacienValide();
    await firstValueFrom(stocks.declarer(NON_INSCRITE, MEDICAMENT, 'quantite-limitee'));
    const etat = (id: string) =>
      (JSON.parse(localStorage.getItem('mawjoud.simulation') as string).alertes as { id: string; etat: string; declencheeLe?: string }[]).find((a) => a.id === id);
    expect(etat(bonne.alerte.id)?.etat).toBe('active');

    await firstValueFrom(stocks.declarer(NON_INSCRITE, MEDICAMENT, 'disponible'));
    expect(etat(bonne.alerte.id)?.etat).toBe('terminee');
    expect(etat(bonne.alerte.id)?.declencheeLe).toBeTruthy();
    expect(etat(partout.alerte.id)?.etat).toBe('terminee');
    expect(etat(ailleurs.alerte.id)?.etat).toBe('active');
    expect(etat(autre.alerte.id)?.etat).toBe('active');
    expect(etat(nonVerifiee.alerte.id)?.etat).toBe('active');
  });

  it('sert les données de test par le même jeton', async () => {
    expect(TestBed.inject(CLAIM_SERVICE)).toBe(claims);
    expect((await firstValueFrom(stocks.stocksDePharmacie('T001'))).length).toBeGreaterThan(0);
  });
});
