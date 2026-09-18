import { Module } from '@nestjs/common';
import { SynchronizationModule } from '../synchronization/synchronization.module.js';
import { GithubWebhookController } from './github-webhook.controller.js';

@Module({
  imports: [SynchronizationModule],
  controllers: [GithubWebhookController],
})
export class GithubWebhookModule {}
