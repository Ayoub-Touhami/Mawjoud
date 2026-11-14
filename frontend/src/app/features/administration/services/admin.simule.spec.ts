import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { adminGuard } from '../../../core/guards/admin.guard';
import { fournirTraductionTest } from '../../../core/i18n/traduction.test-outils';
import { CLAIM_SERVICE } from '../../../core/services/claim.service';
import { PHARMACIE_API } from '../../../core/services/pharmacie-api';
import { STOCK_SERVICE } from '../../../core/services/stock.service';
import { AuthServiceSimule } from '../../../core/simulation/auth.service.simule';
import { fournirSimulation } from '../../../core/simulation/fournir-simulation';
import { StockServiceSimule } from '../../../core/simulation/stock.service.simule';
import {
  AdminAbuseServiceSimule,
  AdminClaimServiceSimule,
  AdminDirectoryServiceSimule,
  AuditLogServiceSimule,
} from './admin.simule';

const MOTIF = { code: 'justificatif-illisible' } as const;
const LIBRE = 'T006';
const AUTRE_LIBRE = 'T007';

// Ces tests portent sur l'administration simulée : ils utilisent le raccourci « administrateur de test »,
// réservé au réglage outilsSimulation (désactivé quand le front utilise la vraie API, Partie 9e).
(environment as { outilsSimulation: boolean }).outilsSimulation = true;

describe('administration simulée', () => {
  let auth: AuthServiceSimule;
  let claims: AdminClaimServiceSimule;
  let annuaire: AdminDirectoryServiceSimule;
  let abus: AdminAbuseServiceSimule;
  let journal: AuditLogServiceSimule;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), fournirTraductionTest(), fournirSimulation()],
    });
    auth = TestBed.inject(AuthServiceSimule);
    claims = TestBed.inject(AdminClaimServiceSimule);
    annuaire = TestBed.inject(AdminDirectoryServiceSimule);
    abus = TestBed.inject(AdminAbuseServiceSimule);
    journal = TestBed.inject(AuditLogServiceSimule);
  });

  /** Crée un pharmacien et sa réclamation, puis repasse en administrateur. */
  async function demande(pharmacieId = LIBRE, email = 'ph@exemple.tn'): Promise<string> {
    await firstValueFrom(auth.creerCompte(email, 'mot-de-passe-test', 'pharmacien'));
    await firstValueFrom(auth.verifierEmail(auth.jetonEnAttente() as string));
    const creee = await firstValueFrom(TestBed.inject(CLAIM_SERVICE).reclamer(pharmacieId, {}));
    auth.seDeconnecter();
    auth.connecterAdministrateurTest();
    return creee.id;
  }

  const seConnecter = async (email = 'ph@exemple.tn') => {
    auth.seDeconnecter();
    await firstValueFrom(auth.seConnecter(email, 'mot-de-passe-test'));
  };
  const etat = async (id: string) =>
    (await firstValueFrom(TestBed.inject(PHARMACIE_API).obtenirPharmacie(id)))?.etat;
  const actions = async () => (await firstValueFrom(journal.lister())).map((e) => e.action);
  const garde = () =>
    TestBed.runInInjectionContext(() => adminGuard({} as never, [{ path: 'admin' }] as never, {} as never));
  const adresse = (r: unknown) =>
    r === true ? true : TestBed.inject(Router).serializeUrl(r as UrlTree);

  it('refuse un non-administrateur avant tout chargement', async () => {
    expect(adresse(garde())).toBe('/compte/connexion?retour=%2Fadmin');
    await firstValueFrom(auth.creerCompte('patient@exemple.tn', 'mot-de-passe-test'));
    expect(adresse(garde())).toBe('/acces-refuse');
    auth.seDeconnecter();
    await firstValueFrom(auth.creerCompte('ph@exemple.tn', 'mot-de-passe-test', 'pharmacien'));
    expect(adresse(garde())).toBe('/acces-refuse');
    auth.seDeconnecter();
    auth.connecterAdministrateurTest();
    expect(garde()).toBe(true);
  });

  it('ne laisse créer aucun compte administrateur', async () => {
    const compte = await firstValueFrom(auth.creerCompte('a@exemple.tn', 'mot-de-passe-test'));
    expect(compte.role).toBe('patient');
  });

  it('valider inscrit la pharmacie et vérifie le compte', async () => {
    const id = await demande();
    expect(await etat(LIBRE)).toBe('reclamee');
    await firstValueFrom(claims.validerDemande(id));
    expect(await etat(LIBRE)).toBe('inscrite');
    await seConnecter();
    expect(auth.utilisateur()?.compteVerifie).toBe(true);
    expect(auth.utilisateur()?.pharmacieId).toBe(LIBRE);
    expect(await actions()).toContain('valider');
  });

  it('refuser exige un motif, que le pharmacien voit ensuite', async () => {
    const id = await demande();
    await expect(
      firstValueFrom(claims.refuserDemande(id, { code: '' as never })),
    ).rejects.toBe('motif-requis');
    await firstValueFrom(claims.refuserDemande(id, { ...MOTIF, precision: 'Photo floue' }));
    expect(await etat(LIBRE)).toBe('non-inscrite');
    await seConnecter();
    const vue = await firstValueFrom(TestBed.inject(CLAIM_SERVICE).maDemande());
    expect(vue?.motifCode).toBe('justificatif-illisible');
    expect(vue?.motifPrecision).toBe('Photo floue');
    expect(await actions()).toContain('refuser');
  });

  it('compare deux demandes : en choisir une refuse l autre, avec un motif', async () => {
    const dossier = await firstValueFrom(claims.obtenirDossier('dem-01'));
    expect(dossier.length).toBe(2);
    await expect(firstValueFrom(claims.validerDemande('dem-01'))).rejects.toBe('motif-requis');
    await firstValueFrom(claims.validerDemande('dem-01', { code: 'pharmacie-attribuee' }));
    const etats = (await firstValueFrom(claims.obtenirDossier('dem-01'))).map((d) => d.demande.etat);
    expect(etats).toEqual(['validee']);
    expect(await etat('T004')).toBe('inscrite');
  });

  it('refuse une validation sur une pharmacie déjà inscrite', async () => {
    const id = await demande('T001');
    await expect(firstValueFrom(claims.validerDemande(id))).rejects.toBe('deja-inscrite');
  });

  it('crée la fiche demandée, en Tunisie seulement, puis valide', async () => {
    const fiche = {
      nom: 'Pharmacie Nouvelle',
      adresse: '1, rue Test',
      ville: 'Tunis',
      gouvernorat: 'Tunis',
      telephone: '71000000',
      latitude: 36.8,
      longitude: 10.18,
    };
    await expect(
      firstValueFrom(claims.creerFicheEtValider('dem-05', { ...fiche, latitude: 48.8 })),
    ).rejects.toBe('hors-tunisie');
    await firstValueFrom(claims.creerFicheEtValider('dem-05', fiche));
    const pharmacies = await firstValueFrom(TestBed.inject(PHARMACIE_API).listerPharmacies());
    expect(pharmacies.find((p) => p.nom === 'Pharmacie Nouvelle')?.etat).toBe('inscrite');
    expect(await actions()).toContain('creer-fiche');
  });

  it('répercute une correction partout, sans jamais inscrire', async () => {
    auth.connecterAdministrateurTest();
    await firstValueFrom(annuaire.modifierFiche(LIBRE, { nom: 'Pharmacie Corrigée' }));
    const fiche = await firstValueFrom(TestBed.inject(PHARMACIE_API).obtenirPharmacie(LIBRE));
    expect(fiche?.nom).toBe('Pharmacie Corrigée');
    expect(fiche?.etat).toBe('non-inscrite');
    await expect(
      firstValueFrom(annuaire.modifierFiche(LIBRE, { latitude: 48.8, longitude: 2.3 })),
    ).rejects.toBe('hors-tunisie');
    expect(await actions()).toContain('corriger');
  });

  it('signale le doublon de test', async () => {
    const fiches = await firstValueFrom(annuaire.listerFiches());
    expect(fiches.find((f) => f.id === 'T-DOUBLON')?.doublons).toEqual(['T002']);
  });

  it('fusionne deux doublons et garde l inscription et les stocks', async () => {
    auth.connecterAdministrateurTest();
    const avant = await firstValueFrom(TestBed.inject(STOCK_SERVICE).stocksDePharmacie('T002'));
    expect(avant.length).toBeGreaterThan(0);
    await firstValueFrom(annuaire.fusionner('T-DOUBLON', 'T002', { adresse: 'Adresse gardée' }));
    const api = TestBed.inject(PHARMACIE_API);
    const viaAncien = await firstValueFrom(api.obtenirPharmacie('T002'));
    expect(viaAncien?.id).toBe('T-DOUBLON');
    expect(viaAncien?.adresse).toBe('Adresse gardée');
    expect(viaAncien?.etat).toBe('inscrite');
    const apres = await firstValueFrom(TestBed.inject(STOCK_SERVICE).stocksDePharmacie('T-DOUBLON'));
    expect(apres.length).toBe(avant.length);
    expect(await actions()).toContain('fusionner');
  });

  it('refuse de fusionner deux fiches inscrites', async () => {
    await expect(firstValueFrom(annuaire.fusionner('T001', 'T002', {}))).rejects.toBe(
      'deux-inscrites',
    );
  });

  it('retirer l inscription masque les stocks et renvoie le pharmacien à la réclamation', async () => {
    const id = await demande();
    await firstValueFrom(claims.validerDemande(id));
    await seConnecter();
    await firstValueFrom(TestBed.inject(STOCK_SERVICE).declarer(LIBRE, 'M037', 'disponible'));
    auth.seDeconnecter();
    auth.connecterAdministrateurTest();
    await firstValueFrom(annuaire.retirerInscription(LIBRE, { code: 'informations-incompletes' }));
    expect(await etat(LIBRE)).toBe('non-inscrite');
    expect(await firstValueFrom(TestBed.inject(STOCK_SERVICE).stocksDeMedicament('M037'))).toEqual([]);
    await seConnecter();
    expect(auth.utilisateur()?.compteVerifie).toBe(false);
    expect((await firstValueFrom(TestBed.inject(CLAIM_SERVICE).maDemande()))?.etat).toBe('retiree');
    expect(await actions()).toContain('retirer-inscription');
  });

  it('une pharmacie fermée disparaît du public, et peut être rouverte', async () => {
    auth.connecterAdministrateurTest();
    await firstValueFrom(annuaire.marquerFermee(AUTRE_LIBRE, true));
    const api = TestBed.inject(PHARMACIE_API);
    expect(await firstValueFrom(api.obtenirPharmacie(AUTRE_LIBRE))).toBeUndefined();
    expect((await firstValueFrom(annuaire.obtenirFiche(AUTRE_LIBRE)))?.fermee).toBe(true);
    await firstValueFrom(annuaire.marquerFermee(AUTRE_LIBRE, false));
    expect(await firstValueFrom(api.obtenirPharmacie(AUTRE_LIBRE))).toBeTruthy();
  });

  it('la suspension bloque la déclaration et masque les stocks, le rétablissement les rend', async () => {
    const id = await demande();
    await firstValueFrom(claims.validerDemande(id));
    await seConnecter();
    const compte = auth.utilisateur()?.id as string;
    const stocks = TestBed.inject(StockServiceSimule);
    await firstValueFrom(stocks.declarer(LIBRE, 'M037', 'disponible'));
    await firstValueFrom(abus.suspendre(compte));
    await expect(firstValueFrom(stocks.declarer(LIBRE, 'M037', 'en-rupture'))).rejects.toBe(
      'non-autorise',
    );
    auth.seDeconnecter();
    expect(await etat(LIBRE)).toBe('non-inscrite');
    expect(await firstValueFrom(stocks.stocksDeMedicament('M037'))).toEqual([]);
    await firstValueFrom(abus.retablir(compte));
    expect(await etat(LIBRE)).toBe('inscrite');
    expect((await firstValueFrom(stocks.stocksDeMedicament('M037'))).length).toBe(1);
    expect(await actions()).toEqual(expect.arrayContaining(['suspendre', 'retablir']));
  });

  it('supprimer un compte pharmacien rend sa pharmacie non inscrite', async () => {
    const id = await demande();
    await firstValueFrom(claims.validerDemande(id));
    const compte = (await firstValueFrom(abus.listerComptes())).find((c) => c.pharmacie);
    const cible = (await firstValueFrom(abus.listerComptes())).find(
      (c) => c.email === 'ph@exemple.tn',
    );
    expect(compte).toBeTruthy();
    await firstValueFrom(abus.supprimerCompte(cible?.id as string));
    expect(await etat(LIBRE)).toBe('non-inscrite');
    expect(localStorage.getItem('mawjoud.simulation')).not.toContain('ph@exemple.tn');
    expect(await actions()).toContain('supprimer-compte');
  });

  it('garde l auteur et la date dans le journal, sans e-mail du compte visé', async () => {
    auth.connecterAdministrateurTest();
    const compte = (await firstValueFrom(abus.listerComptes()))[0];
    await firstValueFrom(abus.suspendre(compte.id));
    const [entree] = await firstValueFrom(journal.lister());
    expect(entree.administrateur).toBe('admin@mawjoud.example');
    expect(entree.date).toBeTruthy();
    expect(JSON.stringify(entree)).not.toContain(compte.email);
  });
});
