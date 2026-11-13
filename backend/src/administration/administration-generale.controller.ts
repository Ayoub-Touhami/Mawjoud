import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Administrateur, CompteCourant } from '../securite/acces.js';
import { ErreurApi } from '../securite/erreurs.js';
import type { CompteConnecte } from '../securite/sessions.service.js';
import { AdministrationGeneraleService } from './administration-generale.service.js';
import { LimiteAdminGuard } from './administration.controller.js';
import { CorrectionNomDto, CreationFicheDto, FiltreComptesDto, FiltreJournalDto, FusionDto, MotifDto } from './dto.js';

const uuid = new ParseUUIDPipe({ exceptionFactory: () => new ErreurApi(400, 'donnees-invalides', { champs: ['id'] }) });

/**
 * Administration générale (Partie 9c) : rôle administrateur (adresse vérifiée, non suspendu), session,
 * jeton CSRF sur les écritures, 300 requêtes par minute et par compte. Toute écriture est journalisée.
 */
@ApiTags('Administration : fiches, fusion, comptes et journal')
@ApiCookieAuth()
@Controller('v1/admin')
@UseGuards(LimiteAdminGuard)
export class AdministrationGeneraleController {
  constructor(private readonly service: AdministrationGeneraleService) {}

  @Post('pharmacies/:id/nom')
  @Administrateur()
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Corrige le nom. Ancien et nouveau nom journalisés ; nom « à relire » sauf nomRelu: true.' })
  @ApiResponse({ status: 409, description: 'confirmation-requise (fiche prête à publier ou publiée), meme-valeur, fiche-fusionnee' })
  corrigerNom(@CompteCourant() admin: CompteConnecte, @Param('id', uuid) id: string, @Body() dto: CorrectionNomDto) {
    return this.service.corrigerNom(admin, id, dto);
  }

  @Post('pharmacies')
  @Administrateur()
  @HttpCode(201)
  @ApiOperation({ summary: 'Crée la fiche d\'une demande d\'ajout, en attente de position, sans position. Journalisé.' })
  @ApiResponse({ status: 409, description: 'doublons-probables (avec la liste), deja-decidee, pas-une-demande-d-ajout' })
  creer(@CompteCourant() admin: CompteConnecte, @Body() dto: CreationFicheDto) {
    return this.service.creerFiche(admin, dto);
  }

  @Post('pharmacies/:id/fusionner')
  @Administrateur()
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid', description: 'Fiche conservée.' })
  @ApiOperation({ summary: 'Fusionne fusionneeId dans la fiche :id, en une seule transaction. Sans annulation automatique. Journalisé.' })
  @ApiResponse({ status: 409, description: 'meme-fiche, deja-fusionnee' })
  fusionner(@CompteCourant() admin: CompteConnecte, @Param('id', uuid) id: string, @Body() dto: FusionDto) {
    return this.service.fusionner(admin, id, dto.fusionneeId, dto.motif);
  }

  @Get('comptes')
  @Administrateur()
  @ApiOperation({ summary: 'Comptes, filtrables par rôle et statut. Ni mot de passe, ni empreinte, ni jeton.' })
  comptes(@Query() f: FiltreComptesDto) {
    return this.service.comptes(f);
  }

  @Post('comptes/:id/suspendre')
  @Administrateur()
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Suspend le compte (motif obligatoire) et ferme ses sessions. Aucune donnée supprimée. Journalisé.' })
  @ApiResponse({ status: 409, description: 'soi-meme, dernier-administrateur, deja-suspendu' })
  suspendre(@CompteCourant() admin: CompteConnecte, @Param('id', uuid) id: string, @Body() dto: MotifDto) {
    return this.service.suspendre(admin, id, dto.motif);
  }

  @Post('comptes/:id/retablir')
  @Administrateur()
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Réactive le compte (motif obligatoire). Journalisé.' })
  @ApiResponse({ status: 409, description: 'pas-suspendu' })
  retablir(@CompteCourant() admin: CompteConnecte, @Param('id', uuid) id: string, @Body() dto: MotifDto) {
    return this.service.retablir(admin, id, dto.motif);
  }

  @Get('journal')
  @Administrateur()
  @ApiOperation({ summary: 'Journal d\'audit en lecture seule, du plus récent au plus ancien, paginé et filtrable.' })
  journal(@Query() f: FiltreJournalDto) {
    return this.service.journal(f);
  }
}
