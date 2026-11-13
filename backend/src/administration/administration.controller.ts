import { Body, CanActivate, Controller, ExecutionContext, Get, HttpCode, Injectable, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Administrateur, CompteCourant, type RequeteMawjoud } from '../securite/acces.js';
import { ErreurApi } from '../securite/erreurs.js';
import { LimiteursService } from '../securite/limiteurs.service.js';
import type { CompteConnecte } from '../securite/sessions.service.js';
import { AdministrationService } from './administration.service.js';
import { ChangementStatutDto, FiltreDemandesPositionDto, FiltrePharmaciesAdminDto, RefusPositionDto } from './dto.js';

/** 300 requêtes par minute et par compte administrateur. */
@Injectable()
export class LimiteAdminGuard implements CanActivate {
  constructor(private readonly limiteurs: LimiteursService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<RequeteMawjoud>();
    const cle = req.session ? `compte:${req.session.compte.id}` : `ip:${req.ip ?? 'inconnue'}`;
    this.limiteurs.exiger([this.limiteurs.adminCompte, cle]);
    this.limiteurs.adminCompte.enregistrer(cle);
    return true;
  }
}

const uuid = new ParseUUIDPipe({ exceptionFactory: () => new ErreurApi(400, 'donnees-invalides', { champs: ['id'] }) });

/** Administration : rôle administrateur (adresse vérifiée, non suspendu), session, jeton CSRF sur les écritures. */
@ApiTags('Administration : positions et publication')
@ApiCookieAuth()
@Controller('v1/admin')
@UseGuards(LimiteAdminGuard)
export class AdministrationController {
  constructor(private readonly service: AdministrationService) {}

  @Get('demandes-position')
  @Administrateur()
  @ApiOperation({ summary: 'File des demandes de position en attente (plus anciennes d\'abord), avec distance et pharmacies proches.' })
  demandes(@Query() f: FiltreDemandesPositionDto) {
    return this.service.demandesPosition(f);
  }

  @Post('demandes-position/:id/valider')
  @Administrateur()
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Applique la position (confirmée) et fait avancer la fiche. Une seule fois. Journalisé.' })
  @ApiResponse({ status: 409, description: 'deja-decidee, statut-incompatible' })
  valider(@CompteCourant() admin: CompteConnecte, @Param('id', uuid) id: string) {
    return this.service.validerPosition(admin, id);
  }

  @Post('demandes-position/:id/refuser')
  @Administrateur()
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Refuse la demande (motif obligatoire, montré au pharmacien). Journalisé.' })
  refuser(@CompteCourant() admin: CompteConnecte, @Param('id', uuid) id: string, @Body() dto: RefusPositionDto) {
    return this.service.refuserPosition(admin, id, dto.motif);
  }

  @Get('pharmacies')
  @Administrateur()
  @ApiOperation({ summary: 'Fiches filtrables par statut, gouvernorat, ville, avec ce qui empêche leur publication.' })
  pharmacies(@Query() f: FiltrePharmaciesAdminDto) {
    return this.service.pharmacies(f);
  }

  @Post('pharmacies/:id/relire')
  @Administrateur()
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Marque le nom comme relu. Le statut ne change pas. Journalisé.' })
  relire(@CompteCourant() admin: CompteConnecte, @Param('id', uuid) id: string) {
    return this.service.relire(admin, id);
  }

  @Post('pharmacies/:id/statut')
  @Administrateur()
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Change le statut de publication (transitions autorisées seulement). Journalisé.' })
  @ApiResponse({ status: 409, description: 'transition-interdite (avec les transitions autorisées), conditions-non-remplies (avec les motifs), meme-statut' })
  statut(@CompteCourant() admin: CompteConnecte, @Param('id', uuid) id: string, @Body() dto: ChangementStatutDto) {
    return this.service.changerStatut(admin, id, dto);
  }
}
