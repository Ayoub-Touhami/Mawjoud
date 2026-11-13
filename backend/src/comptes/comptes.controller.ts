import { Body, Controller, Get, HttpCode, Inject, Ip, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CONFIGURATION } from '../config/jetons-injection.js';
import type { Configuration } from '../config/configuration.js';
import { CompteCourant, Connecte, Public, type RequeteMawjoud } from '../securite/acces.js';
import { effacerCookies, poserCookies } from '../securite/cookies.js';
import { SessionsService, type CompteConnecte } from '../securite/sessions.service.js';
import { ComptesService } from './comptes.service.js';
import {
  ChangementMotDePasseDto,
  ConnexionDto,
  InscriptionDto,
  JetonDto,
  MotDePasseOublieDto,
  ReinitialisationDto,
  RenvoiLienDto,
  UtilisateurReponse,
} from './dto.js';

const ENVOYE = { statut: 'envoye' } as const;

@ApiTags('Comptes')
@Controller('comptes')
export class ComptesController {
  constructor(
    private readonly comptes: ComptesService,
    private readonly sessions: SessionsService,
    @Inject(CONFIGURATION) private readonly config: Configuration,
  ) {}

  @Post('patients')
  @Public()
  @HttpCode(202)
  @ApiOperation({ summary: 'Inscription d\'un patient. Réponse identique que l\'adresse soit libre ou non.' })
  @ApiResponse({ status: 202, description: 'Un e-mail a été envoyé (vérification, ou « vous avez déjà un compte »).' })
  async inscrirePatient(@Body() dto: InscriptionDto, @Ip() ip: string) {
    await this.comptes.inscrire('patient', dto, ip);
    return ENVOYE;
  }

  @Post('pharmaciens')
  @Public()
  @HttpCode(202)
  @ApiOperation({ summary: 'Inscription d\'un pharmacien ; le compte reste non vérifié jusqu\'à la validation de son rattachement.' })
  async inscrirePharmacien(@Body() dto: InscriptionDto, @Ip() ip: string) {
    await this.comptes.inscrire('pharmacien', dto, ip);
    return ENVOYE;
  }

  @Post('verification-email')
  @Public()
  @HttpCode(204)
  @ApiOperation({ summary: 'Valide le lien reçu par e-mail (usage unique, 24 h).' })
  @ApiResponse({ status: 400, description: 'lien-invalide' })
  @ApiResponse({ status: 410, description: 'lien-expire' })
  async verifierEmail(@Body() dto: JetonDto): Promise<void> {
    await this.comptes.verifierEmail(dto.jeton);
  }

  @Post('verification-email/renvoi')
  @Public()
  @HttpCode(202)
  @ApiOperation({ summary: 'Nouveau lien de vérification : pour le compte connecté, ou à partir d\'un lien expiré.' })
  async renvoyerLien(@Body() dto: RenvoiLienDto, @Req() req: RequeteMawjoud, @Ip() ip: string) {
    await this.comptes.renvoyerLien(dto, req.session?.compte, ip);
    return ENVOYE;
  }

  @Post('connexion')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Connexion par e-mail et mot de passe ; pose le cookie de session et le cookie XSRF-TOKEN.' })
  @ApiResponse({ status: 200, type: UtilisateurReponse })
  @ApiResponse({ status: 401, description: 'identifiants (même réponse si l\'adresse n\'existe pas)' })
  @ApiResponse({ status: 429, description: 'trop-de-tentatives' })
  async connecter(@Body() dto: ConnexionDto, @Req() req: RequeteMawjoud, @Ip() ip: string, @Res({ passthrough: true }) res: Response) {
    // Une session déjà ouverte dans ce navigateur est fermée : jamais de réutilisation d'identifiant.
    if (req.session) await this.sessions.fermer(req.session.idHache);
    const r = await this.comptes.connecter(dto, ip);
    poserCookies(res, this.config, r.jeton, r.csrf, r.expireLe);
    return r.utilisateur;
  }

  @Post('deconnexion')
  @Connecte()
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Ferme la session (en-tête X-XSRF-TOKEN obligatoire).' })
  async deconnecter(@Req() req: RequeteMawjoud, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessions.fermer(req.session!.idHache);
    effacerCookies(res, this.config);
  }

  @Get('moi')
  @Connecte()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Compte connecté. Renvoie un nouveau cookie XSRF-TOKEN s\'il manque.' })
  @ApiResponse({ status: 200, type: UtilisateurReponse })
  async moi(@CompteCourant() compte: CompteConnecte, @Req() req: RequeteMawjoud, @Res({ passthrough: true }) res: Response) {
    if (!req.cookies?.[this.config.cookies.csrf]) {
      const csrf = await this.sessions.renouvelerCsrf(req.session!.idHache);
      poserCookies(res, this.config, req.jetonSession!, csrf, req.session!.expireLe);
    }
    return this.comptes.utilisateur(compte.id);
  }

  @Post('mot-de-passe')
  @Connecte()
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Change le mot de passe ; ferme toutes les sessions du compte (reconnexion nécessaire).' })
  async changerMotDePasse(
    @CompteCourant() compte: CompteConnecte,
    @Body() dto: ChangementMotDePasseDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.comptes.changerMotDePasse(compte, dto);
    effacerCookies(res, this.config);
  }

  @Post('mot-de-passe-oublie')
  @Public()
  @HttpCode(202)
  @ApiOperation({ summary: 'Envoie un lien de réinitialisation (1 h, usage unique) si l\'adresse a un compte. Réponse toujours identique.' })
  motDePasseOublie(@Body() dto: MotDePasseOublieDto, @Ip() ip: string) {
    this.comptes.motDePasseOublie(dto, ip);
    return ENVOYE;
  }

  @Post('reinitialisation')
  @Public()
  @HttpCode(204)
  @ApiOperation({ summary: 'Nouveau mot de passe à partir du lien ; ferme toutes les sessions du compte.' })
  async reinitialiser(@Body() dto: ReinitialisationDto, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.comptes.reinitialiser(dto);
    effacerCookies(res, this.config);
  }
}
