"""Crée le fichier Excel des textes arabes à faire relire, une feuille par écran.

    python scripts/exporter-textes-arabes.py <sortie.xlsx>

Demande le paquet openpyxl. L'administration reste en français et n'y figure pas.
"""
import json
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

DOSSIER = Path(__file__).resolve().parent.parent / 'src' / 'i18n'
ECRANS = {
    'Général': ['app', 'navigation', 'langue', 'theme', 'introuvable', 'pages', 'etat'],
    'Carte': ['carte', 'marqueur'],
    'Recherche et résultats': ['recherche', 'gouvernorats'],
    'Fiche pharmacie': ['fiche', 'statut', 'jours', 'distance'],
    'Dates': ['temps'],
    'Compte patient': ['compte'],
    'Alertes': ['alertes'],
    'E-mail': ['email'],
    'Pharmacien': ['pharmacien'],
    'Contact': ['contact'],
    'À propos': ['apropos'],
}


def aplatir(valeur, prefixe=''):
    lignes = {}
    for cle, contenu in valeur.items():
        chemin = f'{prefixe}{cle}'
        if isinstance(contenu, dict):
            lignes.update(aplatir(contenu, f'{chemin}.'))
        else:
            lignes[chemin] = contenu
    return lignes


def creer(sortie):
    francais = aplatir(json.loads((DOSSIER / 'fr.json').read_text(encoding='utf8')))
    arabe = aplatir(json.loads((DOSSIER / 'ar.json').read_text(encoding='utf8')))
    classeur = Workbook()
    classeur.remove(classeur.active)

    lisez = classeur.create_sheet('À lire')
    for ligne in (
        ['Textes arabes de Mawjoud, à faire relire.'],
        ['Ces traductions sont des propositions : rien n\'est validé, surtout pas le vocabulaire médical.'],
        ['Remplir la colonne « Validé » (oui / à corriger) et « Commentaire ».'],
        ['{{ }} marque une valeur insérée par le site : à garder telle quelle.'],
    ):
        lisez.append(ligne)
    lisez.column_dimensions['A'].width = 100

    total = 0
    for nom, groupes in ECRANS.items():
        feuille = classeur.create_sheet(nom)
        feuille.append(['Clé', 'Français', 'Arabe proposé', 'Validé', 'Commentaire'])
        for cellule in feuille[1]:
            cellule.font = Font(bold=True, color='FFFFFF')
            cellule.fill = PatternFill('solid', fgColor='0B3D2E')
        for cle, texte in francais.items():
            if cle.split('.')[0] in groupes and not cle.startswith('compte.test'):
                feuille.append([cle, texte, arabe.get(cle, ''), '', ''])
                total += 1
        for colonne, largeur in zip('ABCDE', (34, 60, 60, 12, 40)):
            feuille.column_dimensions[colonne].width = largeur
        for ligne in feuille.iter_rows(min_row=2):
            ligne[1].alignment = Alignment(wrap_text=True, vertical='top')
            ligne[2].alignment = Alignment(wrap_text=True, vertical='top', horizontal='right',
                                           readingOrder=2)
        feuille.freeze_panes = 'A2'
    classeur.save(sortie)
    print(f'{total} textes écrits dans {sortie}')


creer(sys.argv[1])
