import { Client } from '@elastic/elasticsearch';
import { env } from './env.js';

export const esClient = new Client({
  node: env.ELASTICSEARCH_URL,
});

export const EMAIL_INDEX_NAME = 'emails';

export async function initElasticsearch(): Promise<boolean> {
  try {
    const ping = await esClient.ping();
    if (!ping) {
      console.warn('[Elasticsearch] Ping failed, search will degrade gracefully.');
      return false;
    }

    const indexExists = await esClient.indices.exists({ index: EMAIL_INDEX_NAME });

    if (!indexExists) {
      console.log(`[Elasticsearch] Creating index "${EMAIL_INDEX_NAME}"...`);
      await esClient.indices.create({
        index: EMAIL_INDEX_NAME,
        body: {
          mappings: {
            properties: {
              emailId: { type: 'keyword' },
              userId: { type: 'keyword' },
              senderId: { type: 'keyword' },
              recipientEmail: {
                type: 'text',
                fields: {
                  keyword: { type: 'keyword' },
                },
              },
              subject: { type: 'text' },
              status: { type: 'keyword' },
              scheduledAt: { type: 'date' },
              sentAt: { type: 'date' },
              createdAt: { type: 'date' },
            },
          },
        },
      });
      console.log(`[Elasticsearch] Index "${EMAIL_INDEX_NAME}" initialized successfully.`);
    } else {
      console.log(`[Elasticsearch] Index "${EMAIL_INDEX_NAME}" already exists.`);
    }
    return true;
  } catch (err: any) {
    console.warn(`[Elasticsearch] Init warning (will degrade gracefully): ${err.message}`);
    return false;
  }
}
