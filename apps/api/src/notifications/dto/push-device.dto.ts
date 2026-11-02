import { IsEnum, IsString, Length } from 'class-validator';
import { PushPlatform } from '../../common/prisma-enums';

/** Sprint 16 — Corps de POST /notifications/devices. */
export class RegisterPushDeviceDto {
  /** Jeton FCM renvoyé par FirebaseMessaging.getToken() sur l'appareil. */
  @IsString()
  @Length(20, 4096)
  token: string;

  @IsEnum(PushPlatform)
  platform: PushPlatform;
}

/** Sprint 16 — Corps de DELETE /notifications/devices. */
export class UnregisterPushDeviceDto {
  @IsString()
  @Length(20, 4096)
  token: string;
}
