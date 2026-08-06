import { Module } from '@nestjs/common';
import { InfraModule } from '../../infra/infra.module';
import { KudoCreditedListener } from './listeners/kudo-credited.listener';
import { FeedPostRepository } from './repositories/feed-post.repository';

@Module({
  imports: [InfraModule],
  providers: [FeedPostRepository, KudoCreditedListener],
  exports: [FeedPostRepository],
})
export class FeedModule {}
