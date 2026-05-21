import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@scrapeforge/database';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

console.log('Worker starting up...');

const scrapeWorker = new Worker(
  'scrape',
  async (job) => {
    console.log(`Processing scraping job ${job.id} for task ${job.data.taskId}`);
    try {
      // Boilerplate execution logic
      // In the future:
      // 1. launch playwright browser
      // 2. run page extraction, auto-type inference
      // 3. run auto-schema generator
      // 4. insert data
      
      const runId = job.data.runId;
      await prisma.taskRun.update({
        where: { id: runId },
        data: {
          status: 'success',
          rowsScraped: 10,
          pagesVisited: 1,
          finishedAt: new Date(),
        },
      });

      return { status: 'success', rows: 10 };
    } catch (error: any) {
      console.error(`Failed to process job ${job.id}:`, error);
      const runId = job.data.runId;
      await prisma.taskRun.update({
        where: { id: runId },
        data: {
          status: 'failed',
          errorLog: error.message || String(error),
          finishedAt: new Date(),
        },
      });
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 3,
  }
);

scrapeWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed!`);
});

scrapeWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with error: ${err.message}`);
});
