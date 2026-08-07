import { Module } from '@nestjs/common';
import { InfraModule } from '../../infra/infra.module';
import { PointModule } from '../point/point.module';
import { AuthController } from './controllers/auth.controller';
import { UserController } from './controllers/user.controller';
import { UserRepository } from './repositories/user.repository';
import { AuthService } from './services/auth.service';
import { UserService } from './services/user.service';

@Module({
  imports: [InfraModule, PointModule],
  controllers: [AuthController, UserController],
  providers: [UserRepository, AuthService, UserService],
  exports: [UserRepository, AuthService],
})
export class UserModule {}
