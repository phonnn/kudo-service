import { Module } from '@nestjs/common';
import { InfraModule } from '../../infra/infra.module';
import { AuthController } from './controllers/auth.controller';
import { UserRepository } from './repositories/user.repository';
import { AuthService } from './services/auth.service';

@Module({
  imports: [InfraModule],
  controllers: [AuthController],
  providers: [UserRepository, AuthService],
  exports: [UserRepository, AuthService],
})
export class UserModule {}
