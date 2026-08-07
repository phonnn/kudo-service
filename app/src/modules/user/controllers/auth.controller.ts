import {
  Body,
  ConflictException,
  Controller,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  AuthGuard,
  CurrentPrincipal,
  StreamTicketStore,
  type Principal,
} from '@kudo/security';
import { AuthService } from '../services/auth.service';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { EmailAlreadyRegisteredError } from '../errors/email-already-registered.error';
import { InvalidCredentialsError } from '../errors/invalid-credentials.error';
import { InvalidRefreshTokenError } from '../errors/invalid-refresh-token.error';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly streamTickets: StreamTicketStore,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    try {
      return await this.authService.register(dto);
    } catch (error) {
      if (error instanceof EmailAlreadyRegisteredError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    try {
      return await this.authService.login(dto);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    try {
      return await this.authService.refresh(dto.refreshToken);
    } catch (error) {
      if (error instanceof InvalidRefreshTokenError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
  }

  @UseGuards(AuthGuard)
  @Post('stream-ticket')
  issueStreamTicket(@CurrentPrincipal() principal: Principal) {
    return { ticket: this.streamTickets.issue(principal) };
  }
}
