import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Statuts de publication, à tirets comme dans le reste de l'API (snake_case en base). */
export const STATUTS_PUBLICATION = [
  'en-attente-position', 'a-relire', 'pret-a-publier', 'publiee', 'non-publiable', 'fermee', 'fusionnee',
] as const;
export type StatutPublicationFront = (typeof STATUTS_PUBLICATION)[number];

const texte = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value));

class Page {
  @ApiPropertyOptional({ minimum: 1, maximum: 1000, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  taille: number = 20;
}

export class FiltreDemandesPositionDto extends Page {
  @ApiPropertyOptional({ description: 'Code du gouvernorat (11 à 83).' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(11) @Max(83)
  gouvernorat?: number;
}

export class RefusPositionDto {
  @ApiProperty({ minLength: 3, maxLength: 500, description: 'Motif, montré au pharmacien.' })
  @texte() @IsString() @MinLength(3) @MaxLength(500)
  motif!: string;
}

export class FiltrePharmaciesAdminDto extends Page {
  @ApiPropertyOptional({ enum: STATUTS_PUBLICATION })
  @IsOptional() @IsIn(STATUTS_PUBLICATION)
  statut?: StatutPublicationFront;

  @ApiPropertyOptional({ description: 'Code du gouvernorat (11 à 83).' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(11) @Max(83)
  gouvernorat?: number;

  @ApiPropertyOptional({ description: 'Ville exacte, sans accents ni casse.' })
  @IsOptional() @texte() @IsString() @MinLength(1) @MaxLength(100)
  ville?: string;
}

export class ChangementStatutDto {
  @ApiProperty({ enum: STATUTS_PUBLICATION, description: 'Transitions autorisées : docs/API_ADMIN.md.' })
  @IsIn(STATUTS_PUBLICATION)
  statut!: StatutPublicationFront;

  @ApiPropertyOptional({ maxLength: 500, description: 'Raison (gardée dans le journal).' })
  @IsOptional() @texte() @IsString() @MaxLength(500)
  motif?: string;
}

// ---------------------------------------------------------------- Partie 9c

/** Correction du nom. Fiche prête à publier ou publiée : nomRelu: true obligatoire (la base exige un nom relu). */
export class CorrectionNomDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @texte() @IsString() @MinLength(1) @MaxLength(200)
  nom!: string;

  @ApiPropertyOptional({ description: 'true : l\'administrateur confirme avoir relu le nouveau nom. Sinon, le nom repasse « à relire ».' })
  @IsOptional() @IsBoolean()
  nomRelu?: boolean;
}

/** Création d'une fiche pour une demande d'ajout (rattachement sans pharmacie). */
export class CreationFicheDto {
  @ApiProperty({ format: 'uuid', description: 'Demande de rattachement « ajout » à laquelle la fiche répond.' })
  @IsUUID()
  rattachementId!: string;

  @ApiProperty({ maxLength: 200 }) @texte() @IsString() @MinLength(1) @MaxLength(200) nom!: string;
  @ApiPropertyOptional({ maxLength: 300 }) @IsOptional() @texte() @IsString() @MaxLength(300) rue?: string;
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @texte() @IsString() @MaxLength(200) quartier?: string;
  @ApiProperty({ maxLength: 100 }) @texte() @IsString() @MinLength(1) @MaxLength(100) ville!: string;
  @ApiPropertyOptional({ example: '1002' }) @IsOptional() @IsString() @Matches(/^[0-9]{4}$/) codePostal?: string;
  @ApiProperty({ minimum: 11, maximum: 83 }) @IsInt() @Min(11) @Max(83) gouvernorat!: number;
  @ApiPropertyOptional({ example: '+21671000000' }) @IsOptional() @IsString() @Matches(/^\+216[0-9]{8}$/) telephone?: string;

  @ApiPropertyOptional({ description: 'true : créer malgré des doublons probables signalés.' })
  @IsOptional() @IsBoolean()
  confirmerSansDoublon?: boolean;
}

export class FusionDto {
  @ApiProperty({ format: 'uuid', description: 'Fiche fusionnée (passe à « fusionnee », renvoie vers la fiche conservée).' })
  @IsUUID()
  fusionneeId!: string;

  @ApiProperty({ minLength: 3, maxLength: 500, description: 'Raison (journal).' })
  @texte() @IsString() @MinLength(3) @MaxLength(500)
  motif!: string;
}

export class MotifDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @texte() @IsString() @MinLength(3) @MaxLength(500)
  motif!: string;
}

export class FiltreComptesDto extends Page {
  @ApiPropertyOptional({ enum: ['patient', 'pharmacien', 'administrateur'] })
  @IsOptional() @IsIn(['patient', 'pharmacien', 'administrateur'])
  role?: string;

  @ApiPropertyOptional({ enum: ['actif', 'suspendu'] })
  @IsOptional() @IsIn(['actif', 'suspendu'])
  statut?: string;

  @ApiPropertyOptional({ description: 'Partie de l\'adresse e-mail.' })
  @IsOptional() @texte() @IsString() @MinLength(2) @MaxLength(100)
  email?: string;
}

export const ACTIONS_JOURNAL = [
  'valider', 'refuser', 'creer_fiche', 'corriger', 'fermer', 'rouvrir', 'fusionner', 'retirer_inscription', 'suspendre',
  'retablir', 'supprimer_compte', 'valider_position', 'refuser_position', 'traiter_signalement', 'connexion_reussie',
  'connexion_echouee', 'changer_mot_de_passe', 'reinitialiser_mot_de_passe', 'creer_administrateur', 'modifier_fiche',
  'retirer_declaration', 'acces_refuse', 'proposer_position', 'relire_nom', 'changer_statut', 'confirmer_tout',
] as const;

const JOUR = /^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;

export class FiltreJournalDto extends Page {
  @ApiPropertyOptional({ enum: ACTIONS_JOURNAL }) @IsOptional() @IsIn(ACTIONS_JOURNAL) action?: string;
  @ApiPropertyOptional({ enum: ['pharmacie', 'rattachement', 'demande_position', 'utilisateur', 'signalement', 'message_contact'] })
  @IsOptional() @IsIn(['pharmacie', 'rattachement', 'demande_position', 'utilisateur', 'signalement', 'message_contact'])
  cibleType?: string;
  @ApiPropertyOptional() @IsOptional() @texte() @IsString() @MaxLength(100) cibleId?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Compte qui a agi.' }) @IsOptional() @IsUUID() acteur?: string;
  @ApiPropertyOptional({ example: '2026-11-01', description: 'Jour inclus (AAAA-MM-JJ).' }) @IsOptional() @Matches(JOUR) depuis?: string;
  @ApiPropertyOptional({ example: '2026-11-30', description: 'Jour inclus (AAAA-MM-JJ).' }) @IsOptional() @Matches(JOUR) jusqua?: string;
}
