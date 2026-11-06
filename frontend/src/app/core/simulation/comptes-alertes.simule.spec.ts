import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AlertServiceSimule } from './alert.service.simule';
import { AuthServiceSimule } from './auth.service.simule';

const EMAIL = 'nom@exemple.tn';
const MOT_DE_PASSE = 'mot-de-passe-test';

describe('comptes et alertes simulés', () => {
  let auth: AuthServiceSimule;
  let alertes: AlertServiceSimule;

  beforeEach(() => {
    localStorage.clear();
    auth = TestBed.inject(AuthServiceSimule);
    alertes = TestBed.inject(AlertServiceSimule);
  });

  const creerCompte = () => firstValueFrom(auth.creerCompte(EMAIL, MOT_DE_PASSE));

  it("n'écrit jamais le mot de passe en clair", async () => {
    await creerCompte();
    expect(localStorage.getItem('mawjoud.simulation')).not.toContain(MOT_DE_PASSE);
  });

  it('refuse un e-mail déjà utilisé, sans tenir compte de la casse', async () => {
    await creerCompte();
    await expect(firstValueFrom(auth.creerCompte('NOM@exemple.tn', 'autre-mot'))).rejects.toBe(
      'email-utilise',
    );
  });

  it('refuse un mauvais mot de passe sans dire lequel des deux est faux', async () => {
    await creerCompte();
    auth.seDeconnecter();
    await expect(firstValueFrom(auth.seConnecter(EMAIL, 'mauvais'))).rejects.toBe('identifiants');
    await expect(firstValueFrom(auth.seConnecter('x@y.tn', 'mauvais'))).rejects.toBe('identifiants');
    await expect(firstValueFrom(auth.seConnecter(EMAIL, MOT_DE_PASSE))).resolves.toBeTruthy();
  });

  it("vérifie l'adresse avec le lien, une seule fois", async () => {
    await creerCompte();
    const jeton = auth.jetonEnAttente() as string;
    expect(auth.utilisateur()?.emailVerifie).toBe(false);
    await firstValueFrom(auth.verifierEmail(jeton));
    expect(auth.utilisateur()?.emailVerifie).toBe(true);
    await expect(firstValueFrom(auth.verifierEmail(jeton))).rejects.toBe('lien-invalide');
  });

  it('refuse un lien expiré, puis accepte le nouveau lien', async () => {
    await creerCompte();
    const expire = auth.jetonEnAttente() as string;
    auth.expirerLien(expire);
    await expect(firstValueFrom(auth.verifierEmail(expire))).rejects.toBe('lien-expire');
    await firstValueFrom(auth.renvoyerLien(expire));
    const nouveau = auth.jetonEnAttente() as string;
    expect(nouveau).not.toBe(expire);
    await expect(firstValueFrom(auth.verifierEmail(expire))).rejects.toBe('lien-invalide');
    await firstValueFrom(auth.verifierEmail(nouveau));
    expect(auth.utilisateur()?.emailVerifie).toBe(true);
  });

  it('crée une alerte, sans doublon pour le même médicament et le même périmètre', async () => {
    await creerCompte();
    const premiere = await firstValueFrom(alertes.creerAlerte('M015', 'Tunis'));
    expect(premiere.existante).toBe(false);
    expect(premiere.alerte.etat).toBe('active');
    const seconde = await firstValueFrom(alertes.creerAlerte('M015', 'Tunis'));
    expect(seconde.existante).toBe(true);
    expect(seconde.alerte.id).toBe(premiere.alerte.id);
    expect((await firstValueFrom(alertes.creerAlerte('M015', null))).existante).toBe(false);
    expect(await firstValueFrom(alertes.listerAlertes())).toHaveLength(2);
  });

  it('refuse une alerte sans compte', async () => {
    await expect(firstValueFrom(alertes.creerAlerte('M015', null))).rejects.toBe('non-connecte');
  });

  it("modifie la zone, mais refuse la modification qui créerait un doublon", async () => {
    await creerCompte();
    const { alerte } = await firstValueFrom(alertes.creerAlerte('M015', 'Tunis'));
    await firstValueFrom(alertes.creerAlerte('M015', 'Sfax'));
    await expect(firstValueFrom(alertes.modifierAlerte(alerte.id, 'Sfax'))).rejects.toBe('doublon');
    expect((await firstValueFrom(alertes.modifierAlerte(alerte.id, null))).ville).toBeNull();
  });

  it("ne touche pas aux alertes d'un autre compte", async () => {
    await creerCompte();
    const { alerte } = await firstValueFrom(alertes.creerAlerte('M015', 'Tunis'));
    auth.seDeconnecter();
    await firstValueFrom(auth.creerCompte('autre@exemple.tn', MOT_DE_PASSE));
    await expect(firstValueFrom(alertes.supprimerAlerte(alerte.id))).rejects.toBe('introuvable');
    expect(await firstValueFrom(alertes.listerAlertes())).toHaveLength(0);
  });

  it('désabonne sans connexion, arrête toutes les alertes et garde le compte', async () => {
    await creerCompte();
    await firstValueFrom(alertes.creerAlerte('M015', 'Tunis'));
    await firstValueFrom(alertes.creerAlerte('M016', null));
    const jeton = alertes.jetonDesabonnement() as string;
    auth.seDeconnecter();

    await firstValueFrom(alertes.desabonner(jeton));
    await firstValueFrom(alertes.desabonner(jeton));
    await expect(firstValueFrom(alertes.desabonner('faux'))).rejects.toBe('lien-invalide');

    await firstValueFrom(auth.seConnecter(EMAIL, MOT_DE_PASSE));
    const restantes = await firstValueFrom(alertes.listerAlertes());
    expect(restantes.map((a) => a.etat)).toEqual(['terminee', 'terminee']);
  });

  it('supprime le compte et ses alertes pour de bon', async () => {
    await creerCompte();
    await firstValueFrom(alertes.creerAlerte('M015', 'Tunis'));
    await firstValueFrom(auth.supprimerCompte());
    expect(auth.utilisateur()).toBeNull();
    expect(localStorage.getItem('mawjoud.simulation')).not.toContain(EMAIL);
    expect(localStorage.getItem('mawjoud.simulation')).not.toContain('M015');
    await expect(firstValueFrom(auth.seConnecter(EMAIL, MOT_DE_PASSE))).rejects.toBe('identifiants');
  });

  it('retrouve la session après un rechargement', async () => {
    await creerCompte();
    TestBed.resetTestingModule();
    expect(TestBed.inject(AuthServiceSimule).utilisateur()?.email).toBe(EMAIL);
  });
});
