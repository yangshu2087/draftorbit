import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  AutomationJobPayload,
  ImageJobPayload,
  LearningJobPayload,
  MentionsJobPayload,
  MetricsJobPayload,
  PublishJobPayload,
  QUEUE_NAMES,
  ReplyJobPayload
} from '@draftorbit/shared';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queueStatsTimeoutMs = Number(process.env.QUEUE_STATS_TIMEOUT_MS ?? 3000);

  private readonly redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    connectTimeout: 5000
  });

  private readonly publishQueue = new Queue<PublishJobPayload>(QUEUE_NAMES.PUBLISH, {
    connection: this.redis
  });
  private readonly replyQueue = new Queue<ReplyJobPayload>(QUEUE_NAMES.REPLY, {
    connection: this.redis
  });
  private readonly learningQueue = new Queue<LearningJobPayload>(QUEUE_NAMES.LEARNING, {
    connection: this.redis
  });
  private readonly imageQueue = new Queue<ImageJobPayload>(QUEUE_NAMES.IMAGE, {
    connection: this.redis
  });
  private readonly mentionsQueue = new Queue<MentionsJobPayload>(QUEUE_NAMES.MENTIONS, {
    connection: this.redis
  });
  private readonly metricsQueue = new Queue<MetricsJobPayload>(QUEUE_NAMES.METRICS, {
    connection: this.redis
  });
  private readonly automationQueue = new Queue<AutomationJobPayload>(QUEUE_NAMES.AUTOMATION, {
    connection: this.redis
  });

  async ping(): Promise<string> {
    return this.withTimeout(this.redis.ping(), 1500, 'redis ping');
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async getQueueStats() {
    const pairs = [
      ['publish', this.publishQueue],
      ['reply', this.replyQueue],
      ['learning', this.learningQueue],
      ['image', this.imageQueue],
      ['mentions', this.mentionsQueue],
      ['metrics', this.metricsQueue],
      ['automation', this.automationQueue]
    ] as const;

    const result: Record<
      string,
      {
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
        paused: number;
      }
    > = {};

    for (const [name, queue] of pairs) {
      try {
        const counts = await this.withTimeout(
          queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused'),
          this.queueStatsTimeoutMs,
          `queue stats:${name}`
        );
        result[name] = {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
          paused: counts.paused ?? 0
        };
      } catch {
        result[name] = {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: 0
        };
      }
    }

    return result;
  }

  async enqueuePublish(publishJobId: string, scheduledAt?: Date) {
    const queueJobId = `publish-${publishJobId}`;
    const delay = scheduledAt ? Math.max(0, scheduledAt.getTime() - Date.now()) : 0;

    const existing = await this.publishQueue.getJob(queueJobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'delayed' || state === 'prioritized') {
        await existing.remove();
      }
    }

    await this.publishQueue.add(
      'publish-job',
      { publishJobId },
      {
        jobId: queueJobId,
        attempts: 3,
        delay,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800, count: 2000 }
      }
    );
  }

  async enqueueReply(replyJobId: string, scheduledAt?: Date) {
    const queueJobId = `reply-${replyJobId}`;
    const delay = scheduledAt ? Math.max(0, scheduledAt.getTime() - Date.now()) : 0;
    await this.replyQueue.add(
      'reply-job',
      { replyJobId },
      {
        jobId: queueJobId,
        attempts: 3,
        delay,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800, count: 2000 }
      }
    );
  }

  async enqueueLearning(payload: LearningJobPayload) {
    await this.learningQueue.add('learning-job', payload, {
      jobId: `learning-${payload.learningSourceId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 2000 }
    });
  }

  async enqueueImageGeneration(mediaAssetId: string) {
    await this.imageQueue.add(
      'image-job',
      { mediaAssetId },
      {
        jobId: `image-${mediaAssetId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800, count: 2000 }
      }
    );
  }

  async enqueueMentionsSync(replyJobId: string) {
    await this.mentionsQueue.add(
      'mentions-job',
      { replyJobId },
      {
        jobId: `mentions-${replyJobId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800, count: 2000 }
      }
    );
  }

  async enqueueMetricsSync(workspaceId: string) {
    await this.metricsQueue.add(
      'metrics-sync',
      { workspaceId },
      {
        attempts: 2,
        removeOnComplete: { age: 3600, count: 100 }
      }
    );
  }

  async enqueueAutomation(workflowRunId: string) {
    await this.automationQueue.add(
      'automation-run',
      { workflowRunId },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { age: 86400, count: 500 },
        removeOnFail: { age: 604800, count: 1000 }
      }
    );
  }

  async onModuleDestroy() {
    await this.publishQueue.close();
    await this.replyQueue.close();
    await this.learningQueue.close();
    await this.imageQueue.close();
    await this.mentionsQueue.close();
    await this.metricsQueue.close();
    await this.automationQueue.close();
    await this.redis.quit();
  }
}
