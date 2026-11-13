import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

/** Seuls le nom et la taille d'un fichier sont gardés, jamais son contenu (stockage à décider). */
export class FichierDto {
  @ApiProperty({ maxLength: 255 }) @IsString() @MinLength(1) @MaxLength(255) nom!: string;
  @ApiProperty({ description: 'Octets, 10 Mo au plus.' }) @IsInt() @Min(1) @Max(10 * 1024 * 1024) taille!: number;
}

export class JustificatifDto {
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) texte?: string;
  @ApiPropertyOptional({ type: FichierDto }) @IsOptional() @ValidateNested() @Type(() => FichierDto) fichier?: FichierDto;
}

/** Pharmacie absente de l'annuaire, proposée à l'administrateur. */
export class AjoutDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) nom!: string;
  @ApiProperty() @IsString() @MaxLength(300) adresse!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) ville!: string;
  @ApiProperty({ example: '+21671123456' }) @IsString() @Matches(/^\+216[0-9]{8}$/) telephone!: string;
}

/** Réclamation (pharmacieId) ou demande d'ajout (ajout) : l'un ou l'autre, contrôlé par le service. */
export class DemandeRattachementDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() pharmacieId?: string;
  @ApiPropertyOptional({ type: AjoutDto }) @IsOptional() @ValidateNested() @Type(() => AjoutDto) ajout?: AjoutDto;
  @ApiPropertyOptional({ type: JustificatifDto }) @IsOptional() @ValidateNested() @Type(() => JustificatifDto) justificatif?: JustificatifDto;
}

export const MOTIFS = [
  'justificatif-illisible',
  'informations-incompletes',
  'pharmacie-attribuee',
  'pharmacie-fermee',
  'compte-supprime',
  'autre',
] as const;

export class RefusDto {
  @ApiProperty({ enum: MOTIFS }) @IsIn(MOTIFS) motifCode!: (typeof MOTIFS)[number];
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) motifPrecision?: string;
}

export class FiltreDemandesDto {
  @ApiPropertyOptional({ enum: ['en-attente', 'validee', 'refusee', 'retiree'] })
  @IsOptional()
  @IsIn(['en-attente', 'validee', 'refusee', 'retiree'])
  etat?: string;
}
