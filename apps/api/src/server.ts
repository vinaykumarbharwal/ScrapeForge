import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { PrismaClient } from '@scrapeforge/database';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

// Queues for offloading scraping and export tasks
const scrapeQueue = new Queue('scrape', { connection: redisConnection });
const exportQueue = new Queue('export', { connection: redisConnection });

const fastify = Fastify({
  logger: true,
});

async function main() {
  await fastify.register(cors, {
    origin: true, // adjust for production
  });

  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'supersecretsharedkeyforlocaldevonly',
  });

  await fastify.register(websocket);

  fastify.get('/health', async () => {
    return { status: 'OK', timestamp: new Date() };
  });

  // Example API endpoint
  fastify.get('/api/tasks', async (request, reply) => {
    // Basic tasks listing boilerplate
    try {
      const tasks = await prisma.scrapeTask.findMany();
      return tasks;
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Database connection failed' });
    }
  });

  const port = parseInt(process.env.PORT || '3000', 10);
  try {
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
