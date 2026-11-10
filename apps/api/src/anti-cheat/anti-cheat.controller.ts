import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AntiCheatService, REPORT_STATUSES, ReportStatus } from './anti-cheat.service';

export class ReviewReportDto {
  @IsIn(['DISMISSED', 'CONFIRMED'])
  status!: 'DISMISSED' | 'CONFIRMED';

  /** Avec CONFIRMED : désactive le compte et révoque ses sessions. */
  @IsOptional()
  @IsBoolean()
  suspend?: boolean;
}

/**
 * Novembre 2026 — Signalements anti-triche (administrateurs).
 *   GET   /admin/cheat-reports?status=OPEN|DISMISSED|CONFIRMED
 *   PATCH /admin/cheat-reports/:id   { status, suspend? }
 */
@Controller('admin/cheat-reports')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AntiCheatController {
  constructor(private readonly antiCheat: AntiCheatService) {}

  @Get()
  list(@Query('status') status?: string) {
    if (status !== undefined && !REPORT_STATUSES.includes(status as ReportStatus)) {
      throw new BadRequestException(`Statut inconnu : ${status} (${REPORT_STATUSES.join(', ')}).`);
    }
    return this.antiCheat.listReports((status as ReportStatus | undefined) ?? 'OPEN');
  }

  @Patch(':id')
  review(@Param('id') id: string, @Body() dto: ReviewReportDto) {
    return this.antiCheat.reviewReport(id, dto.status, dto.suspend ?? false);
  }
}
