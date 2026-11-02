import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OAuthVerifierService } from './oauth/oauth-verifier.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET ?? 'change-me',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  // Sprint 15 : OAuthVerifierService (Google, Apple, Facebook)
  providers: [AuthService, JwtStrategy, JwtAuthGuard, OAuthVerifierService],
  exports: [AuthService, JwtModule, JwtAuthGuard, JwtStrategy],
})
export class AuthModule {}
