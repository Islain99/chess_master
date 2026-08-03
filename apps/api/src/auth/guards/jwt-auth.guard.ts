import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard JWT réutilisable.
 * Décorer une route avec @UseGuards(JwtAuthGuard) la protège :
 * un token d'accès valide dans le header Authorization est requis.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
