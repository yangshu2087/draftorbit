import { QUEUE_NAMES } from '@draftorbit/shared';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { processPublishJob } from './processors/publish.processor';
import { processReplyJob } from './processors/reply.processor';
import { processLearningJob } from './processors/learning.processor';
import { processImageJob } from './processors/image.processor';
import { processMentionsJob } from './processors/mentions.processor';
import { processMetricsJob } from './processors/metrics.processor';
import { processAutomationJob } from './processors/automation.processor';

const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null
});

const publishWorker = new Worker(QUEUE_NAMES.PUBLISH, processPublishJob, {
  connection: redis,
  concurrency: 3
});

const replyWorker = new Worker(QUEUE_NAMES.REPLY, processReplyJob, {
  connection: redis,
  concurrency: 3
});

const learningWorker = new Worker(QUEUE_NAMES.LEARNING, processLearningJob, {
  connection: redis,
  concurrency: 2
});

const imageWorker = new Worker(QUEUE_NAMES.IMAGE, processImageJob, {
  connection: redis,
  concurrency: 2
});

const mentionsWorker = new Worker(QUEUE_NAMES.MENTIONS, processMentionsJob, {
  connection: redis,
  concurrency: 2
});

const metricsWorker = new Worker(QUEUE_NAMES.METRICS, processMetricsJob, {
  connection: redis,
  concurrency: 1
});

const automationWorker = new Worker(QUEUE_NAMES.AUTOMATION, processAutomationJob, {
  connection: redis,
  concurrency: 2
});

publishWorker.on('completed', (j) => console.log(`[publish] Job ${j.id} completed`));
publishWorker.on('failed', (j, err) => console.log(`[publish] Job ${j?.id} failed: ${err.message}`));

replyWorker.on('completed', (j) => console.log(`[reply] Job ${j.id} completed`));
replyWorker.on('failed', (j, err) => console.log(`[reply] Job ${j?.id} failed: ${err.message}`));

learningWorker.on('completed', (j) => console.log(`[learning] Job ${j.id} completed`));
learningWorker.on('failed', (j, err) => console.log(`[learning] Job ${j?.id} failed: ${err.message}`));

imageWorker.on('completed', (j) => console.log(`[image] Job ${j.id} completed`));
imageWorker.on('failed', (j, err) => console.log(`[image] Job ${j?.id} failed: ${err.message}`));

mentionsWorker.on('completed', (j) => console.log(`[mentions] Job ${j.id} completed`));
mentionsWorker.on('failed', (j, err) => console.log(`[mentions] Job ${j?.id} failed: ${err.message}`));

metricsWorker.on('completed', (j) => console.log(`[metrics] Job ${j.id} completed`));
metricsWorker.on('failed', (j, err) => console.log(`[metrics] Job ${j?.id} failed: ${err.message}`));

automationWorker.on('completed', (j) => console.log(`[automation] Job ${j.id} completed`));
automationWorker.on('failed', (j, err) => console.log(`[automation] Job ${j?.id} failed: ${err.message}`));

console.log(
  'DraftOrbit Worker started (publish/reply/learning/image/mentions/metrics/automation queues)'
);
