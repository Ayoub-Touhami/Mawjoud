import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { FORMAT_JETON } from '../securite/jetons.js';

/**
 * Entrées des routes de comptes. Champs inconnus refusés (ValidationPipe).
 * La longueur des mots de passe est bornée ici à 1 000 caractères pour ne pas hacher un texte énorme ;
 * la politique (10 à 128 caractères…) est appliquée par MotsDePasseService, avec un code précis.
 */
const LANGUES = ['fr', 'ar'] as const;

export class InscriptionDto {
  @ApiProperty({ example: 'patient@exemple.tn', maxLength: 254 })
  @IsEmail({ allow_display_name: false, allow_ip_domain: false, require_tld: true })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ format: 'password', minLength: 10, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  motDePasse!: string;

  @ApiPropertyOptional({ enum: LANGUES, description: 'Langue des e-mails (défaut : fr).' })
  @IsOptional()
  @IsIn(LANGUES)
  langue?: 'fr' | 'ar';
}

export class ConnexionDto {
  @ApiProperty({ example: 'patient@exemple.tn' })
  @IsString()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @MaxLength(1000)
  motDePasse!: string;
}

export class JetonDto {
  @ApiProperty({ description: 'Jeton reçu dans le lien (43 caractères).' })
  @IsString()
  @Matches(FORMAT_JETON)
  jeton!: string;
}

export class RenvoiLienDto {
  @ApiPropertyOptional({ description: 'Jeton d\'un lien expiré, si l\'utilisateur n\'est pas connecté.' })
  @IsOptional()
  @IsString()
  @Matches(FORMAT_JETON)
  jetonExpire?: string;

  @ApiPropertyOptional({ enum: LANGUES })
  @IsOptional()
  @IsIn(LANGUES)
  langue?: 'fr' | 'ar';
}

export class MotDePasseOublieDto {
  @ApiProperty({ example: 'patient@exemple.tn' })
  @IsString()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ enum: LANGUES })
  @IsOptional()
  @IsIn(LANGUES)
  langue?: 'fr' | 'ar';
}

export class ReinitialisationDto {
  @ApiProperty()
  @IsString()
  @Matches(FORMAT_JETON)
  jeton!: string;

  @ApiProperty({ format: 'password', minLength: 10, maxLength: 128 })
  @IsString()
  @MaxLength(1000)
  nouveauMotDePasse!: string;
}

export class ChangementMotDePasseDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  @MaxLength(1000)
  motDePasseActuel!: string;

  @ApiProperty({ format: 'password', minLength: 10, maxLength: 128 })
  @IsString()
  @MaxLength(1000)
  nouveauMotDePasse!: string;
}

/** Réponse : même forme que le modèle Utilisateur du front-end. Aucun mot de passe. */
export class UtilisateurReponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['patient', 'pharmacien', 'administrateur'] }) role!: string;
  @ApiProperty() emailVerifie!: boolean;
  @ApiPropertyOptional({ description: 'Pharmacien : rattachement validé par l\'administrateur.' }) compteVerifie?: boolean;
  @ApiPropertyOptional({ format: 'uuid' }) pharmacieId?: string;
  @ApiPropertyOptional() suspendu?: boolean;
}
