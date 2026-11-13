import { Body, CanActivate, Controller, Delete, ExecutionContext, Get, HttpCode, Injectable, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RechercheMedicamentsDto } from '../publique/dto.js';
import { PubliqueService } from '../publique/publique.service.js';
import { CompteCourant, Pharmacien, type RequeteMawjoud } from '../securite/acces.js';
import { ErreurApi } from '../securite/erreurs.js';
import { LimiteursService } from '../securite/limiteurs.service.js';
import type { CompteConnecte } from '../securite/sessions.service.js';
import { DeclarationDto, DisponibilitesDto, LotDto, ModificationFicheDto, PageDto } from './dto.js';
import { PharmacienService } from './pharmacien.service.js';

/** 120 requêtes par minute et par compte (par IP si la requête n'a pas de session : elle sera refusée ensuite). */
@Injectable()
export class LimitePharmacienGuard implements CanActivate {
  constructor(private readonly limiteurs: LimiteursService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<RequeteMawjoud>();
    const cle = req.session ? `compte:${req.session.compte.id}` : `ip:${req.ip ?? 'inconnue'}`;
    this.limiteurs.exiger([this.limiteurs.pharmacienCompte, cle]);
    this.limiteurs.pharmacienCompte.enregistrer(cle);
    return true;
  }
}

const uuid = (champ: string) => new ParseUUIDPipe({ exceptionFactory: () => new ErreurApi(400, 'donnees-invalides', { champs: [champ] }) });

/**
 * Espace pharmacien : rôle pharmacien, adresse vérifiée, compte non suspendu (refus par défaut des gardes),
 * session et jeton CSRF (X-XSRF-TOKEN) sur toutes les écritures.
 */
@ApiTags('Espace pharmacien')
@ApiCookieAuth()
@Controller('v1/pharmacien')
@UseGuards(LimitePharmacienGuard)
export class EspacePharmacienController {
  constructor(
    private readonly service: PharmacienService,
    private readonly publique: PubliqueService,
  ) {}

  @Get('pharmacies')
  @Pharmacien({ emailVerifie: true })
  @ApiOperation({ summary: 'Mes pharmacies (rattachement validé) : statut de publication, nombre de médicaments déclarés.' })
  mesPharmacies(@CompteCourant() compte: CompteConnecte) {
    return this.service.mesPharmacies(compte);
  }

  @Get('pharmacies/:id/disponibilites')
  @Pharmacien({ emailVerifie: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Disponibilités déclarées de ma pharmacie, paginées, recherche par nom ou DCI.' })
  @ApiResponse({ status: 404, description: 'introuvable : pas une de mes pharmacies (ou inexistante), tentative journalisée' })
  disponibilites(@CompteCourant() compte: CompteConnecte, @Param('id', uuid('id')) id: string, @Query() f: DisponibilitesDto) {
    return this.service.disponibilites(compte, id, f);
  }

  @Put('pharmacies/:id/disponibilites/:medicamentId')
  @Pharmacien({ emailVerifie: true })
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiParam({ name: 'medicamentId', format: 'uuid' })
  @ApiOperation({ summary: 'Déclare ou met à jour un statut. Date de déclaration fixée par le serveur.' })
  declarer(
    @CompteCourant() compte: CompteConnecte,
    @Param('id', uuid('id')) id: string,
    @Param('medicamentId', uuid('medicamentId')) medicamentId: string,
    @Body() dto: DeclarationDto,
  ) {
    return this.service.declarer(compte, id, medicamentId, dto.statut);
  }

  @Post('pharmacies/:id/disponibilites/lot')
  @Pharmacien({ emailVerifie: true })
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Mise à jour groupée (100 au plus), tout ou rien ; rapport par ligne en cas d\'erreur.' })
  @ApiResponse({ status: 400, description: 'donnees-invalides (champs déclarations.N.…) ou lot-invalide (lignes : medicament-inconnu, doublon)' })
  lot(@CompteCourant() compte: CompteConnecte, @Param('id', uuid('id')) id: string, @Body() dto: LotDto) {
    return this.service.declarerLot(compte, id, dto);
  }

  @Delete('pharmacies/:id/disponibilites/:medicamentId')
  @Pharmacien({ emailVerifie: true })
  @HttpCode(204)
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiParam({ name: 'medicamentId', format: 'uuid' })
  @ApiOperation({ summary: 'Retire la déclaration (le médicament n\'est plus listé). L\'historique est conservé.' })
  async retirer(
    @CompteCourant() compte: CompteConnecte,
    @Param('id', uuid('id')) id: string,
    @Param('medicamentId', uuid('medicamentId')) medicamentId: string,
  ): Promise<void> {
    await this.service.retirer(compte, id, medicamentId);
  }

  @Get('pharmacies/:id/historique')
  @Pharmacien({ emailVerifie: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Historique de mes déclarations sur cette pharmacie, du plus récent au plus ancien.' })
  historique(@CompteCourant() compte: CompteConnecte, @Param('id', uuid('id')) id: string, @Query() page: PageDto) {
    return this.service.historique(compte, id, page);
  }

  @Patch('pharmacies/:id')
  @Pharmacien({ emailVerifie: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Modifie téléphone, autres téléphones, garde, horaires. Tout autre champ : 400. Journalisé.' })
  modifier(@CompteCourant() compte: CompteConnecte, @Param('id', uuid('id')) id: string, @Body() dto: ModificationFicheDto) {
    return this.service.modifierFiche(compte, id, dto);
  }

  @Get('medicaments')
  @Pharmacien({ emailVerifie: true })
  @ApiOperation({ summary: 'Recherche de médicaments : la même que GET /api/v1/medicaments (pas de seconde recherche).' })
  medicaments(@Query() r: RechercheMedicamentsDto) {
    return this.publique.medicaments(r);
  }
}
