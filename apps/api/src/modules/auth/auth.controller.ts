import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import type { AuditOrigin } from '@prisma/client';
import { AuthService } from './auth.service.js';
import { CurrentAuditOrigin } from '../../common/decorators/current-audit-origin.decorator.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(
    @CurrentActorId() actorId: string,
    @CurrentAuditOrigin() origin: AuditOrigin,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      actorId,
      dto.currentPassword,
      dto.newPassword,
      origin,
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentActorId() actorId: string) {
    return this.authService.me(actorId);
  }
}
