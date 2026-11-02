import {
  Body,
  Controller,
  Get,
  HttpCode,
  InternalServerErrorException,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { OAuthLoginDto } from './dto/oauth-login.dto';
import { OAuthVerifierService } from './oauth/oauth-verifier.service';
import { OAuthProviderParam, PROVIDER_TO_AUTH } from './oauth/oauth.types';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import type { RequestUser } from './strategies/jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oauth: OAuthVerifierService,
    private readonly config: ConfigService,
  ) {}

  /** POST /auth/register — créer un compte */
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /** POST /auth/login — se connecter */
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * POST /auth/oauth/apple/callback — Sprint 15
   *
   * Sur Android (et le Web en mode redirection), « Sign in with Apple » passe
   * par une page Apple qui renvoie le résultat en POST (form-urlencoded) vers
   * cette URL. On le réexpédie vers l'application via un intent Android, comme
   * l'exige le paquet Flutter sign_in_with_apple. Aucun jeton n'est vérifié
   * ici : l'application rappellera ensuite POST /auth/oauth/apple.
   */
  @Post('oauth/apple/callback')
  appleCallback(@Body() body: Record<string, unknown>, @Res() res: Response) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body ?? {})) {
      if (typeof value === 'string') params.append(key, value);
    }
    const pkg = this.config.get<string>('APPLE_ANDROID_PACKAGE') ?? 'com.islain99.chess_client';
    res.redirect(
      303,
      `intent://callback?${params.toString()}#Intent;package=${pkg};scheme=signinwithapple;end`,
    );
  }

  /**
   * POST /auth/oauth/:provider — Sprint 15
   * Échange un jeton Google / Apple / Facebook contre nos jetons JWT.
   * 400 fournisseur inconnu · 401 jeton invalide · 409 e-mail déjà lié
   * à un autre fournisseur · 503 fournisseur non configuré.
   */
  @Post('oauth/:provider')
  @HttpCode(200)
  async oauthLogin(
    @Param('provider', new ParseEnumPipe(OAuthProviderParam)) provider: OAuthProviderParam,
    @Body() dto: OAuthLoginDto,
  ) {
    const profile = await this.oauth.verify(provider, dto);
    // Défense en profondeur : le profil doit correspondre au fournisseur demandé.
    if (profile.provider !== PROVIDER_TO_AUTH[provider]) {
      throw new InternalServerErrorException('Incohérence fournisseur OAuth.');
    }
    return this.authService.loginWithOAuth(profile);
  }

  /** POST /auth/refresh — renouveler les tokens (rotation) */
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /** POST /auth/logout — révoquer le refresh token */
  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: Request, @Body() dto: RefreshDto) {
    const user = req.user as RequestUser;
    await this.authService.logout(user.userId, dto.refreshToken);
  }

  /** GET /auth/me — profil du compte connecté */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request) {
    const user = req.user as RequestUser;
    return this.authService.getProfile(user.userId);
  }

  /** PATCH /auth/me — mettre à jour le profil */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(
    @Req() req: Request,
    @Body() body: { displayName?: string; avatarUrl?: string; country?: string },
  ) {
    const user = req.user as RequestUser;
    return this.authService.updateProfile(user.userId, body);
  }
}
