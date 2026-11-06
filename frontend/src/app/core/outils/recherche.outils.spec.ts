import { MEDICAMENTS_TEST } from '../donnees-test/medicaments';
import { Medicament } from '../models';
import { chercherDans, contientArabe, libelleMedicament, normaliser } from './recherche.outils';

const noms = (texte: string, large = false) =>
  chercherDans(MEDICAMENTS_TEST, texte, large).map((m) => m.nom);

describe('recherche de médicament', () => {
  it('ignore les accents et les majuscules', () => {
    expect(normaliser('  LÉVOTHYROXINE ')).toBe('levothyroxine');
    expect(noms('VOLTARENE')).toContain('Voltarène');
    expect(noms('tegretol')).toContain('Tégrétol');
  });

  it('trouve par nom commercial et par DCI', () => {
    expect(noms('doliprane').every((nom) => nom.startsWith('Doliprane'))).toBe(true);
    expect(noms('metformine')).toEqual(['Glucophage']);
    expect(noms('levothyroxine')).toEqual(['Levothyrox', 'Levothyrox']);
  });

  it('tolère les petites fautes de frappe', () => {
    expect(noms('dolipran')).toContain('Doliprane');
    expect(noms('dolipranne')).toContain('Doliprane');
    expect(noms('levotyrox')).toContain('Levothyrox');
    expect(noms('augmantin')).toContain('Augmentin');
    expect(noms('ventolin')).toContain('Ventoline');
  });

  it('accepte le dosage dans la saisie', () => {
    const resultats = chercherDans(MEDICAMENTS_TEST, 'doliprane 500');
    expect(resultats.map((m) => m.id)).toEqual(['M001']);
  });

  it('ne renvoie rien pour une saisie vide ou sans rapport', () => {
    expect(noms('')).toEqual([]);
    expect(noms('a')).toEqual([]);
    expect(noms('xyzwqk')).toEqual([]);
  });

  it('élargit la tolérance pour proposer des noms proches', () => {
    expect(noms('dopliranne')).toEqual([]);
    expect(noms('dopliranne', true)).toContain('Doliprane');
  });

  it("trouve un nom arabe quand la donnée existe", () => {
    const liste = [{ ...MEDICAMENTS_TEST[0], nomArabe: 'دوليبران' }] as Medicament[];
    expect(chercherDans(liste, 'دوليبران')).toHaveLength(1);
    expect(contientArabe('دوليبران')).toBe(true);
    expect(contientArabe('Doliprane')).toBe(false);
  });

  it('ne répète pas le dosage dans le libellé', () => {
    const [simple, , double] = MEDICAMENTS_TEST;
    expect(libelleMedicament(simple)).toBe('Doliprane 500 mg');
    expect(libelleMedicament(double)).toBe('Doliprane 2,4 %');
  });
});
