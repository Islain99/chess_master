import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;   // userId
  email: string;
}

/** Attaché à req.user après validation. */
export interface RequestUser {
  userId: string;
  email: string;
}

/**
 * Stratégie JWT Passport.
 * Extrait le token depuis le header Authorization: Bearer <token>.
 * Valide la signature avec JWT_ACCESS_SECRET.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET ?? 'change-me',
    });
  }

  /** Transforme le payload JWT en RequestUser attaché à req.user. */
  validate(payload: JwtPayload): RequestUser {
    return { userId: payload.sub, email: payload.email };
  }
}
