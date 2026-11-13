import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * Entrées de l'espace pharmacien. Liste blanche stricte (ValidationPipe global) : tout champ non prévu,
 * par exemple nom, adresse, latitude, statut de publication ou date de déclaration, est refusé (400).
 */
export const STATUTS = ['disponible', 'quantite-limitee', 'en-rupture'] as const;
export type StatutFront = (typeof STATUTS)[number];
export const TAILLE_LOT = 100;
export const PLAGES_MAX = 21; // 3 plages par jour au plus
const TELEPHONE = /^\+216[0-9]{8}$/;
const HEURE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

const texte = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value));

export class PageDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 1000, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  taille: number = 20;
}

export class DisponibilitesDto extends PageDto {
  @ApiPropertyOptional({ description: 'Nom commercial ou DCI, sans accents ni casse (2 caractères au moins).' })
  @IsOptional() @texte() @IsString() @MinLength(2) @MaxLength(100)
  q?: string;
}

/** Déclaration : le statut seulement. La date est celle du serveur ; une date envoyée est refusée. */
export class DeclarationDto {
  @ApiProperty({ enum: STATUTS })
  @IsIn(STATUTS)
  statut!: StatutFront;
}

export class LigneLotDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() medicamentId!: string;
  @ApiProperty({ enum: STATUTS }) @IsIn(STATUTS) statut!: StatutFront;
}

export class LotDto {
  @ApiProperty({ type: [LigneLotDto], minItems: 1, maxItems: TAILLE_LOT })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(TAILLE_LOT)
  @ValidateNested({ each: true }) @Type(() => LigneLotDto)
  declarations!: LigneLotDto[];
}

export class PlageDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = dimanche.' }) @IsInt() @Min(0) @Max(6) jour!: number;
  @ApiProperty({ example: '08:00' }) @IsString() @Matches(HEURE) ouverture!: string;
  @ApiProperty({ example: '20:00', description: 'Avant l\'ouverture : le lendemain (garde de nuit).' }) @IsString() @Matches(HEURE) fermeture!: string;
}

/**
 * Seuls champs modifiables par le pharmacien. Le nom, l'adresse, la ville, le gouvernorat, la position
 * et le statut de publication ne le sont pas : envoyés, ils sont refusés (400).
 */
export class ModificationFicheDto {
  @ApiPropertyOptional({ nullable: true, example: '+21671000000', description: 'null : « Téléphone non renseigné ».' })
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @Matches(TELEPHONE)
  telephone?: string | null;

  @ApiPropertyOptional({ type: [String], maxItems: 5 })
  @IsOptional() @IsArray() @ArrayMaxSize(5) @ArrayUnique() @IsString({ each: true }) @Matches(TELEPHONE, { each: true })
  telephonesAutres?: string[];

  @ApiPropertyOptional({ enum: ['jour', 'nuit'], nullable: true })
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsIn(['jour', 'nuit'])
  garde?: 'jour' | 'nuit' | null;

  @ApiPropertyOptional({ type: [PlageDto], maxItems: PLAGES_MAX, description: 'Remplace toutes les plages.' })
  @IsOptional() @IsArray() @ArrayMaxSize(PLAGES_MAX)
  @ValidateNested({ each: true }) @Type(() => PlageDto)
  horaires?: PlageDto[];
}
