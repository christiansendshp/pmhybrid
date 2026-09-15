import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { EnvConfig } from '../../config/env.validation.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig, true>) => ({
        secret: configService.get('JWT_SECRET', { infer: true }),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, ApiKeyGuard, JwtAuthGuard],
  // Re-export PassportModule so any module that imports AuthModule to use
  // JwtAuthGuard also gets AuthModuleOptions in its own injector scope —
  // AuthGuard()-derived guards resolve their deps against the *consuming*
  // module, not just the module that declared them. ApiKeyGuard is exported
  // for the same reason: JwtAuthGuard now takes it as a constructor
  // dependency (Roadmap GAP-15), so every module using @UseGuards(JwtAuthGuard)
  // needs it resolvable in its own scope too.
  exports: [AuthService, ApiKeyGuard, JwtAuthGuard, PassportModule],
})
export class AuthModule {}
