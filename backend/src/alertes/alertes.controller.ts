import { Body, CanActivate, Controller, Delete, ExecutionContext, Get, HttpCode, Injectable, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CompteCourant, Patient, Public, type RequeteMawjoud } from '../securite/acces.js';
import { ErreurApi } from '../securite/erreurs.js';
import { LimiteursService } from '../securite/limiteurs.service.js';
import type { CompteConnecte } from '../securite/sessions.service.js';
import { AlertesService } from './alertes.service.js';
import { CreationAlerteDto, DesabonnementDto, ModificationAlerteDto } from './dto.js';

/** 60 requêtes par minute et par compte ; par IP pour le lien de désinscription (sans compte). */
@Injectable()
export class LimiteAlertesGuard implements CanActivate {
  constructor(private readonly limiteurs: LimiteursService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<RequeteMawjoud>();
    const cle = req.session ? `compte:${req.session.compte.id}` : `ip:${req.ip ?? 'inconnue'}`;
    this.limiteurs.exiger([this.limiteurs.alertesCompte, cle]);
    this.limiteurs.alertesCompte.enregistrer(cle);
    return true;
  }
}

const uuid = new ParseUUIDPipe({ exceptionFactory: () => new ErreurApi(400, 'donnees-invalides', { champs: ['id'] }) });

/** Alertes du patient (F10 à F12) : compte patient, e-mail vérifié, session et jeton CSRF sur les écritures. */
@ApiTags('Alertes')
@Controller('v1/alertes')
@UseGuards(LimiteAlertesGuard)
export class AlertesController {
  constructor(private readonly alertes: AlertesService) {}

  @Get()
  @Patient({ emailVerifie: true })
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Mes alertes (actives, puis terminées ; une alerte terminée est effacée après 30 jours).' })
  lister(@CompteCourant() compte: CompteConnecte) {
    return this.alertes.lister(compte);
  }

  @Post()
  @Patient({ emailVerifie: true })
  @HttpCode(200)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Crée une alerte (consentement obligatoire) ; renvoie celle qui existe déjà (existante: true).' })
  @ApiResponse({ status: 409, description: 'trop-d-alertes (20 actives au plus par défaut)' })
  creer(@CompteCourant() compte: CompteConnecte, @Body() dto: CreationAlerteDto) {
    return this.alertes.creer(compte, dto);
  }

  @Patch(':id')
  @Patient({ emailVerifie: true })
  @ApiCookieAuth()
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Change le lieu d\'une alerte active ; 409 doublon si une autre alerte identique existe.' })
  modifier(@CompteCourant() compte: CompteConnecte, @Param('id', uuid) id: string, @Body() dto: ModificationAlerteDto) {
    return this.alertes.modifier(compte, id, dto.gouvernorat);
  }

  @Delete(':id')
  @Patient({ emailVerifie: true })
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Supprime l\'alerte (rien n\'est gardé).' })
  async supprimer(@CompteCourant() compte: CompteConnecte, @Param('id', uuid) id: string): Promise<void> {
    await this.alertes.supprimer(compte, id);
  }

  @Post('desabonnement')
  @Public({ sansSession: true })
  @HttpCode(200)
  @ApiOperation({ summary: 'Lien de l\'e-mail, sans connexion : arrête toutes les alertes de cette adresse. Toujours valable.' })
  @ApiResponse({ status: 400, description: 'lien-invalide' })
  desabonner(@Body() dto: DesabonnementDto) {
    return this.alertes.desabonner(dto.jeton);
  }
}
