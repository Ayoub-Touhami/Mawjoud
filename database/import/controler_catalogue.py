"""Contrôle du catalogue de référence des médicaments (medicaments_200.csv) avant import.

Usage (racine du dépôt) :
    python database/import/controler_catalogue.py ../data/final/medicaments_200.csv ../data/medicaments_test.csv

Vérifie : colonnes, identifiants R001 à R200 sans trou ni doublon, les 19 catégories, donnee_test = non, champs obligatoires,
nom = DCI avec une majuscule initiale (aucune marque), aucun doublon (même DCI, même forme, même dosage,
sans tenir compte de la casse ni des accents), ni dans le fichier ni avec les médicaments de test ;
puis affiche le comptage par catégorie. Code de sortie 1 au moindre problème. Le fichier n'est pas modifié.
"""
import csv
import sys
import unicodedata
from collections import Counter

COLONNES = ['id', 'nom', 'dci', 'forme', 'dosage', 'categorie', 'donnee_test']

# Les 19 catégories retenues (« neurologie » seule : psychiatrie exclue, décision du 13 novembre 2026).
CATEGORIES = {
    'cardiologie', 'antibiotique', 'digestif', 'anti-inflammatoire', 'neurologie', 'diabète', 'antalgique',
    'respiratoire', 'allergie', 'dermatologie', 'vitamines et minéraux', 'ORL et ophtalmologie', 'urologie',
    'thyroïde et hormones', 'antifongique', 'antiparasitaire', 'antiviral', 'hématologie', 'rhumatologie',
}


def normal(texte: str) -> str:
    """Comme public.normaliser() en base : sans accents, en minuscules, espaces réduits."""
    sans = ''.join(c for c in unicodedata.normalize('NFD', texte) if unicodedata.category(c) != 'Mn')
    return ' '.join(sans.lower().split())


def lire(chemin: str) -> list[dict]:
    with open(chemin, encoding='utf-8-sig', newline='') as f:
        lecteur = csv.DictReader(f)
        if lecteur.fieldnames != COLONNES:
            sys.exit(f'{chemin} : colonnes {lecteur.fieldnames}, attendu {COLONNES}')
        return list(lecteur)


def main(catalogue: str, test: str) -> int:
    lignes = lire(catalogue)
    erreurs = []
    attendus = [f'R{i:03d}' for i in range(1, 201)]
    if [l['id'] for l in lignes] != attendus:
        erreurs.append('identifiants : R001 à R200 attendus, dans l\'ordre, sans trou ni doublon')
    for l in lignes:
        for c in COLONNES:
            if not l[c].strip():
                erreurs.append(f"{l['id']} : {c} vide")
        if l['categorie'] not in CATEGORIES:
            erreurs.append(f"{l['id']} : catégorie inconnue {l['categorie']!r}")
        if l['donnee_test'] != 'non':
            erreurs.append(f"{l['id']} : donnee_test = {l['donnee_test']!r}, attendu 'non'")
        if l['nom'] != l['dci'][:1].upper() + l['dci'][1:]:
            erreurs.append(f"{l['id']} : nom {l['nom']!r} différent de la DCI avec majuscule ({l['dci']!r}) : marque ?")
    cle = lambda l: (normal(l['dci']), normal(l['forme']), normal(l['dosage']))
    for k, n in Counter(cle(l) for l in lignes).items():
        if n > 1:
            erreurs.append(f'doublon dans le catalogue : {k} ({n} fois)')
    # Index unique de la base : (nom commercial, dosage, forme) normalisés. Ici le nom est la DCI.
    cle_base = lambda l: (normal(l['nom']), normal(l['dosage']), normal(l['forme']))
    deja = {cle_base(l): l['id'] for l in lire(test)}
    for l in lignes:
        if cle_base(l) in deja:
            erreurs.append(f"{l['id']} : même nom, dosage et forme que le médicament de test {deja[cle_base(l)]}")

    categories = Counter(l['categorie'] for l in lignes)
    print(f'{len(lignes)} lignes, {len(categories)} catégories :')
    for categorie, n in categories.most_common():
        print(f'  {n:3d}  {categorie}')
    if erreurs:
        print(f'\n{len(erreurs)} problème(s) :')
        for e in erreurs:
            print(f'  - {e}')
        return 1
    print('\nAucun problème : colonnes, identifiants, donnee_test, noms sans marque, aucun doublon (fichier et test).')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1], sys.argv[2]))
