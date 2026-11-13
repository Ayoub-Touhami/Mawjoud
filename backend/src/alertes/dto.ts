import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsInt, IsString, IsUUID, Matches, Max, Min, ValidateIf } from 'class-validator';
import { FORMAT_JETON } from '../securite/jetons.js';

/**
 * Alerte du patient (F10) : un médicament et un gouvernorat, ou tous (`gouvernorat: null`).
 * Le consentement explicite est obligatoire (`consentement: true`) ; il est daté en base.
 */
export class CreationAlerteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  medicamentId!: string;

  @ApiProperty({ nullable: true, description: 'Code du gouvernorat (11 à 83), ou null pour « toutes les villes ».' })
  @ValidateIf((_, v) => v !== null) @IsInt() @Min(11) @Max(83)
  gouvernorat!: number | null;

  @ApiProperty({ description: 'Doit valoir true : accord pour recevoir un e-mail quand ce médicament sera disponible.' })
  @Equals(true)
  consentement!: true;
}

export class ModificationAlerteDto {
  @ApiProperty({ nullable: true, description: 'Code du gouvernorat (11 à 83), ou null pour « toutes les villes ».' })
  @ValidateIf((_, v) => v !== null) @IsInt() @Min(11) @Max(83)
  gouvernorat!: number | null;
}

export class DesabonnementDto {
  @ApiProperty({ description: 'Jeton reçu dans le lien de l\'e-mail (43 caractères).' })
  @IsString() @Matches(FORMAT_JETON)
  jeton!: string;
}
