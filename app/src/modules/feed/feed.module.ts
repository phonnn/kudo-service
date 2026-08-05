import { Module } from '@nestjs/common';
import { InfraModule } from '../../infra/infra.module';
import { FeedPostRepository } from './repositories/feed-post.repository';

@Module({
  imports: [InfraModule],
  providers: [FeedPostRepository],
  exports: [FeedPostRepository],
})
export class FeedModule {}
