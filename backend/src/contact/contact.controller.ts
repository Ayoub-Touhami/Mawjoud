import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { BaseService } from '../base/base.service.js';
import { Public } from '../securite/acces.js';
import { ErreurApi } from '../securite/erreurs.js';
import { LimiteursService } from '../securite/limiteurs.service.js';

const texte = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value));
export const SUJETS_CONTACT = ['question', 'erreur-pharmacie', 'pharmacien', 'autre'] as const;

/** Message de contact : seules les données nécessaires (nom facultatif, adresse pour répondre, sujet, message). */
export class MessageContactDto {
  @ApiPropertyOptional({ maxLength: 100 }) @IsOptional() @texte() @IsString() @MaxLength(100) nom?: string;
  @ApiProperty({ maxLength: 254 }) @texte() @IsEmail({ require_tld: true }) @MaxLength(254) email!: string;
  @ApiProperty({ enum: SUJETS_CONTACT }) @IsIn(SUJETS_CONTACT) sujet!: (typeof SUJETS_CONTACT)[number];
  @ApiProperty({ minLength: 10, maxLength: 2000 }) @texte() @IsString() @MinLength(10) @MaxLength(2000) message!: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Pharmacie concernée (fiche publiée), quand le message part de sa fiche.' })
  @IsOptional() @IsUUID() pharmacieId?: string;
}

/**
 * Formulaire de contact (Partie 10c) : enregistré dans prive.message_contact, aucun e-mail envoyé, rien d'autre
 * n'est gardé (ni IP, ni session). Limite : celle des envois d'e-mails, 10 par heure et par IP.
 */
@ApiTags('Public : contact')
@Controller('v1/contact')
export class ContactController {
  constructor(private readonly base: BaseService, private readonly limiteurs: LimiteursService) {}

  @Post()
  @Public()
  @HttpCode(201)
  @ApiOperation({ summary: 'Envoie un message de contact (enregistré, sans e-mail). 10 par heure et par IP.' })
  @ApiResponse({ status: 400, description: 'donnees-invalides (champs)' })
  @ApiResponse({ status: 429, description: 'trop-de-tentatives' })
  async envoyer(@Body() dto: MessageContactDto, @Ip() ip: string): Promise<{ statut: 'recu' }> {
    this.limiteurs.exiger([this.limiteurs.envoisIp, ip]);
    this.limiteurs.envoisIp.enregistrer(ip);
    let pharmacieId: string | null = null;
    if (dto.pharmacieId) {
      const [p] = await this.base.requete<{ id: string }>(
        `SELECT id FROM annuaire.pharmacie WHERE uuid = $1 AND statut_publication = 'publiee'`, [dto.pharmacieId]);
      if (!p) throw new ErreurApi(400, 'donnees-invalides', { champs: ['pharmacieId'] });
      pharmacieId = p.id;
    }
    await this.base.requete(
      `INSERT INTO prive.message_contact (nom, email, sujet, message, pharmacie_id) VALUES ($1, $2, $3, $4, $5)`,
      [dto.nom ?? null, dto.email.toLowerCase(), dto.sujet.replace('-', '_'), dto.message, pharmacieId]);
    return { statut: 'recu' };
  }
}
