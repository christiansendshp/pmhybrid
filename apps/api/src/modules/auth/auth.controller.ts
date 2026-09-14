import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  login() {
    void this.authService;
    return { message: 'Auth is implemented in FASE-04.' };
  }
}
