import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/**
 * Paramètres des routes publiques (chaîne de requête). Tout est validé : types, bornes, champs inconnus
 * refusés (ValidationPipe global). Bornes de la Tunisie, comme les contraintes de annuaire.pharmacie.
 */
export const LAT_MIN = 30;
export const LAT_MAX = 38;
export const LNG_MIN = 7;
export const LNG_MAX = 12;
export const TAILLE_MAX = 50;
export const PLAFOND_CARTE = 500;

/** « true » ou « false » seulement ; toute autre valeur est refusée (400). */
const booleen = () =>
  Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value));

/** Espaces de début et de fin retirés ; une chaîne vide devient absente. */
const texte = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value));

class Pagination {
  @ApiPropertyOptional({ minimum: 1, maximum: 1000, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: TAILLE_MAX, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(TAILLE_MAX)
  taille: number = 20;
}

export class ListePharmaciesDto extends Pagination {
  @ApiPropertyOptional({ description: 'Code du gouvernorat (11 à 83).', example: 11 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(11) @Max(83)
  gouvernorat?: number;

  @ApiPropertyOptional({ description: 'Ville exacte, sans tenir compte des accents ni de la casse.', example: 'Tunis' })
  @IsOptional() @texte() @IsString() @MinLength(1) @MaxLength(100)
  ville?: string;

  @ApiPropertyOptional({ description: 'true : pharmacies de nuit seulement ; false : les autres (jour ou non renseigné).' })
  @IsOptional() @booleen() @IsBoolean()
  garde?: boolean;

  @ApiPropertyOptional({ description: 'Partie du nom, sans tenir compte des accents ni de la casse (2 caractères au moins).' })
  @IsOptional() @texte() @IsString() @MinLength(2) @MaxLength(100)
  nom?: string;
}

export class ProchesDto {
  @ApiProperty({ minimum: LAT_MIN, maximum: LAT_MAX, example: 36.8065 })
  @Type(() => Number) @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(LAT_MIN) @Max(LAT_MAX)
  lat!: number;

  @ApiProperty({ minimum: LNG_MIN, maximum: LNG_MAX, example: 10.1815 })
  @Type(() => Number) @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(LNG_MIN) @Max(LNG_MAX)
  lng!: number;

  @ApiPropertyOptional({ minimum: 0.1, maximum: 50, default: 5 })
  @IsOptional() @Type(() => Number) @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0.1) @Max(50)
  rayon_km: number = 5;

  @ApiPropertyOptional({ minimum: 1, maximum: TAILLE_MAX, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(TAILLE_MAX)
  limite: number = 20;
}

export class CarteDto {
  @ApiProperty({ minimum: LAT_MIN, maximum: LAT_MAX }) @Type(() => Number) @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(LAT_MIN) @Max(LAT_MAX)
  sud!: number;
  @ApiProperty({ minimum: LNG_MIN, maximum: LNG_MAX }) @Type(() => Number) @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(LNG_MIN) @Max(LNG_MAX)
  ouest!: number;
  @ApiProperty({ minimum: LAT_MIN, maximum: LAT_MAX }) @Type(() => Number) @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(LAT_MIN) @Max(LAT_MAX)
  nord!: number;
  @ApiProperty({ minimum: LNG_MIN, maximum: LNG_MAX }) @Type(() => Number) @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(LNG_MIN) @Max(LNG_MAX)
  est!: number;

  @ApiProperty({ minimum: 0, maximum: 22, description: 'Niveau de zoom de la carte (contrôlé ; regroupement des points à décider).' })
  @Type(() => Number) @IsInt() @Min(0) @Max(22)
  zoom!: number;
}

export class RechercheMedicamentsDto {
  @ApiProperty({ description: 'Nom commercial ou DCI, sans tenir compte des accents ni de la casse (2 caractères au moins).', example: 'paracetamol' })
  @texte() @IsString() @MinLength(2) @MaxLength(100)
  q!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: TAILLE_MAX, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(TAILLE_MAX)
  limite: number = 20;
}

export class DisponibilitesDto {
  @ApiPropertyOptional({ minimum: LAT_MIN, maximum: LAT_MAX, description: 'Avec lng : tri par distance.' })
  @IsOptional() @Type(() => Number) @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(LAT_MIN) @Max(LAT_MAX)
  lat?: number;

  @ApiPropertyOptional({ minimum: LNG_MIN, maximum: LNG_MAX, description: 'Avec lat : tri par distance.' })
  @IsOptional() @Type(() => Number) @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(LNG_MIN) @Max(LNG_MAX)
  lng?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: TAILLE_MAX, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(TAILLE_MAX)
  limite: number = 20;
}

export class VillesDto {
  @ApiPropertyOptional({ description: 'Code du gouvernorat (11 à 83).', example: 11 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(11) @Max(83)
  gouvernorat?: number;
}

export const STATUTS_DISPONIBLES = ['disponible', 'quantite_limitee'] as const;
