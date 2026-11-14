import cadenas from '../../../assets/svg/icones-ajoutees/cadenas.svg';
import chevronBas from '../../../assets/svg/icones-ajoutees/chevron-bas.svg';
import fermer from '../../../assets/svg/icones-ajoutees/fermer.svg';
import information from '../../../assets/svg/icones-ajoutees/information.svg';
import lune from '../../../assets/svg/icones-ajoutees/lune.svg';
import menu from '../../../assets/svg/icones-ajoutees/menu.svg';
import question from '../../../assets/svg/icones-ajoutees/question.svg';
import reessayer from '../../../assets/svg/icones-ajoutees/reessayer.svg';
import retour from '../../../assets/svg/icones-ajoutees/retour.svg';
import soleil from '../../../assets/svg/icones-ajoutees/soleil.svg';
import alerte from '../../../assets/svg/icones/alerte.svg';
import boite from '../../../assets/svg/icones/boite.svg';
import coche from '../../../assets/svg/icones/coche.svg';
import comprime from '../../../assets/svg/icones/comprime.svg';
import compte from '../../../assets/svg/icones/compte.svg';
import croixPharmacie from '../../../assets/svg/icones/croix-pharmacie.svg';
import email from '../../../assets/svg/icones/email.svg';
import gelule from '../../../assets/svg/icones/gelule.svg';
import goutte from '../../../assets/svg/icones/goutte.svg';
import horloge from '../../../assets/svg/icones/horloge.svg';
import horsConnexion from '../../../assets/svg/icones/hors-connexion.svg';
import itineraire from '../../../assets/svg/icones/itineraire.svg';
import loupe from '../../../assets/svg/icones/loupe.svg';
import maPosition from '../../../assets/svg/icones/ma-position.svg';
import marqueur from '../../../assets/svg/icones/marqueur.svg';
import moins from '../../../assets/svg/icones/moins.svg';
import mortierPilon from '../../../assets/svg/icones/mortier-pilon.svg';
import plaquette from '../../../assets/svg/icones/plaquette.svg';
import plus from '../../../assets/svg/icones/plus.svg';
import sirop from '../../../assets/svg/icones/sirop.svg';
import telephone from '../../../assets/svg/icones/telephone.svg';
import thermometre from '../../../assets/svg/icones/thermometre.svg';
import verifiee from '../../../assets/svg/icones/verifiee.svg';

export const ICONES = {
  alerte,
  boite,
  cadenas,
  'chevron-bas': chevronBas,
  coche,
  comprime,
  compte,
  'croix-pharmacie': croixPharmacie,
  email,
  fermer,
  gelule,
  goutte,
  horloge,
  information,
  'hors-connexion': horsConnexion,
  itineraire,
  loupe,
  lune,
  'ma-position': maPosition,
  marqueur,
  menu,
  moins,
  'mortier-pilon': mortierPilon,
  plaquette,
  plus,
  question,
  reessayer,
  retour,
  sirop,
  soleil,
  telephone,
  thermometre,
  verifiee,
} as const;

export type NomIcone = keyof typeof ICONES;
