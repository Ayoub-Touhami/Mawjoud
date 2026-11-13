import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Administrateur, CompteCourant, Pharmacien } from '../securite/acces.js';
import { ErreurApi } from '../securite/erreurs.js';
import type { CompteConnecte } from '../securite/sessions.service.js';
import { LimiteAdminGuard } from '../administration/administration.controller.js';
import { LimitePharmacienGuard } from '../pharmacien/pharmacien.controller.js';
import { DemandeRattachementDto, FiltreDemandesDto, RechercheFichesDto, RefusDto } from './dto.js';
import { RattachementsService } from './rattachements.service.js';

const uuidValide = new ParseUUIDPipe({ exceptionFactory: () => new ErreurApi(404, 'introuvable') });

@ApiTags('Pharmacien')
@ApiCookieAuth()
@Controller('pharmacien/rattachement')
// Même limite que l'espace pharmacien (Partie 9d : la route n'en avait pas).
@UseGuards(LimitePharmacienGuard)
export class RattachementPharmacienController {
  constructor(private readonly rattachements: RattachementsService) {}

  @Get()
  @Pharmacien({ suspenduAutorise: true })
  @ApiOperation({ summary: 'Dernière demande de rattachement du pharmacien connecté (ou null), même suspendu.' })
  maDemande(@CompteCourant() compte: CompteConnecte) {
    return this.rattachements.maDemande(compte);
  }

  @Get('recherche')
  @Pharmacien({ emailVerifie: true })
  @ApiOperation({ summary: "Fiches de l'annuaire réclamables, par nom, ville ou rue (20 au plus ; jamais un nom à relire)." })
  rechercher(@Query() r: RechercheFichesDto) {
    return this.rattachements.rechercherFiches(r.q);
  }

  @Post()
  @Pharmacien({ emailVerifie: true })
  @HttpCode(201)
  @ApiOperation({ summary: 'Réclame une pharmacie de l\'annuaire, ou demande l\'ajout d\'une pharmacie absente. E-mail vérifié, compte non suspendu.' })
  demander(@CompteCourant() compte: CompteConnecte, @Body() dto: DemandeRattachementDto) {
    return this.rattachements.demander(compte, dto);
  }
}

@ApiTags('Administration')
@ApiCookieAuth()
@Controller('admin/rattachements')
// Même limite que le reste de l'administration (Partie 9d : la route n'en avait pas).
@UseGuards(LimiteAdminGuard)
export class RattachementAdminController {
  constructor(private readonly rattachements: RattachementsService) {}

  @Get()
  @Administrateur()
  @ApiOperation({ summary: 'Demandes de rattachement (par défaut : en attente).' })
  lister(@Query() filtre: FiltreDemandesDto) {
    return this.rattachements.lister(filtre.etat);
  }

  @Post(':id/valider')
  @Administrateur()
  @HttpCode(200)
  @ApiOperation({ summary: 'Valide la demande : le compte pharmacien devient vérifié. Journalisé.' })
  valider(@CompteCourant() admin: CompteConnecte, @Param('id', uuidValide) id: string) {
    return this.rattachements.valider(admin, id);
  }

  @Post(':id/refuser')
  @Administrateur()
  @HttpCode(200)
  @ApiOperation({ summary: 'Refuse la demande avec un motif. Journalisé.' })
  refuser(@CompteCourant() admin: CompteConnecte, @Param('id', uuidValide) id: string, @Body() dto: RefusDto) {
    return this.rattachements.refuser(admin, id, dto);
  }
}
