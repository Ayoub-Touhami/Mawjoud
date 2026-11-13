import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

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
