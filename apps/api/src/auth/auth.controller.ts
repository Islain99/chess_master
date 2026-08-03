import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import type { RequestUser } from './strategies/jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
