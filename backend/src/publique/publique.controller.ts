import { CanActivate, Controller, ExecutionContext, Get, Header, Injectable, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../securite/acces.js';
import { ErreurApi } from '../securite/erreurs.js';
import { LimiteursService } from '../securite/limiteurs.service.js';
import { CarteDto, DisponibilitesDto, ListePharmaciesDto, ProchesDto, RechercheMedicamentsDto, VillesDto } from './dto.js';
import { PubliqueService } from './publique.service.js';

/** Limite propre aux routes publiques en lecture : 120 requêtes par minute et par IP. */
@Injectable()
export class LimitePubliqueGuard implements CanActivate {
  constructor(private readonly limiteurs: LimiteursService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const ip = ctx.switchToHttp().getRequest<Request>().ip ?? 'inconnue';
    this.limiteurs.exiger([this.limiteurs.publicIp, ip]);
    this.limiteurs.publicIp.enregistrer(ip);
    return true;
  }
}

/** Identifiant mal formé : 400 (paramètre invalide), distinct d'une fiche absente ou non publiée (404). */
const uuidValide = new ParseUUIDPipe({ exceptionFactory: () => new ErreurApi(400, 'donnees-invalides', { champs: ['id'] }) });

// Cache : référentiels 1 h ; fiches et listes 5 min ; disponibilités 1 min (elles changent souvent).
// Ces routes ne lisent jamais de session et ne posent aucun cookie (@Public({ sansSession: true })).
const CACHE_REFERENTIEL = 'public, max-age=3600';
const CACHE_ANNUAIRE = 'public, max-age=300';
const CACHE_DISPONIBILITES = 'public, max-age=60';

@ApiTags('Public : pharmacies')
@Controller('v1/pharmacies')
@UseGuards(LimitePubliqueGuard)
export class PharmaciesPubliquesController {
  constructor(private readonly service: PubliqueService) {}

  @Get()
  @Public({ sansSession: true })
  @Header('Cache-Control', CACHE_ANNUAIRE)
  @ApiOperation({ summary: 'Pharmacies publiées, filtrées et paginées (50 par page au plus).' })
  lister(@Query() filtres: ListePharmaciesDto) {
    return this.service.lister(filtres);
  }

  @Get('proches')
  @Public({ sansSession: true })
  @Header('Cache-Control', CACHE_ANNUAIRE)
  @ApiOperation({ summary: 'Pharmacies publiées dans un rayon (5 km par défaut, 50 au plus), triées par distance.' })
  proches(@Query() d: ProchesDto) {
    return this.service.proches(d);
  }

  @Get('carte')
  @Public({ sansSession: true })
  @Header('Cache-Control', CACHE_ANNUAIRE)
  @ApiOperation({ summary: 'Points légers dans une boîte englobante (500 au plus, « tronque » si le plafond est atteint).' })
  carte(@Query() c: CarteDto) {
    return this.service.carte(c);
  }

  @Get(':id')
  @Public({ sansSession: true })
  @Header('Cache-Control', CACHE_ANNUAIRE)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Fiche publique d\'une pharmacie publiée.' })
  @ApiResponse({ status: 404, description: 'introuvable (absente ou non publiée)' })
  fiche(@Param('id', uuidValide) id: string) {
    return this.service.fiche(id);
  }
}

@ApiTags('Public : médicaments')
@Controller('v1/medicaments')
@UseGuards(LimitePubliqueGuard)
export class MedicamentsPublicsController {
  constructor(private readonly service: PubliqueService) {}

  @Get()
  @Public({ sansSession: true })
  @Header('Cache-Control', CACHE_ANNUAIRE)
  @ApiOperation({ summary: 'Recherche par nom commercial ou DCI, sans accents ni casse, triée par pertinence.' })
  rechercher(@Query() r: RechercheMedicamentsDto) {
    return this.service.medicaments(r);
  }

  @Get(':id/pharmacies')
  @Public({ sansSession: true })
  @Header('Cache-Control', CACHE_DISPONIBILITES)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Pharmacies publiées et inscrites qui déclarent ce médicament disponible ou en quantité limitée.' })
  disponibilites(@Param('id', uuidValide) id: string, @Query() d: DisponibilitesDto) {
    return this.service.disponibilites(id, d);
  }
}

@ApiTags('Public : référentiels')
@Controller('v1')
@UseGuards(LimitePubliqueGuard)
export class ReferentielsPublicsController {
  constructor(private readonly service: PubliqueService) {}

  @Get('gouvernorats')
  @Public({ sansSession: true })
  @Header('Cache-Control', CACHE_REFERENTIEL)
  @ApiOperation({ summary: 'Gouvernorats ayant au moins une pharmacie publiée.' })
  gouvernorats() {
    return this.service.gouvernorats();
  }

  @Get('villes')
  @Public({ sansSession: true })
  @Header('Cache-Control', CACHE_REFERENTIEL)
  @ApiOperation({ summary: 'Villes ayant au moins une pharmacie publiée (filtrables par gouvernorat).' })
  villes(@Query() v: VillesDto) {
    return this.service.villes(v);
  }
}
