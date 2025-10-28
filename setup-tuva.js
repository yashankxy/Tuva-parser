import { Pinecone } from '@pinecone-database/pinecone';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import dotenv from 'dotenv';
import fs from 'fs';
import { parseTuvaSchema } from './tuva-parser.js';

dotenv.config();

const PINECONE_INDEX_NAME = 'tuva-schemas';
const EMBEDDING_MODEL = 'amazon.titan-embed-text-v1';
const EMBEDDING_DIMENSIONS = 1536;

// Initialize clients
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  } : undefined
});

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});

/**
 * Generate embedding for text using Bedrock Titan
 */
async function generateEmbedding(text) {
  try {
    const input = {
      modelId: EMBEDDING_MODEL,
      contentType: 'application/json',
      body: JSON.stringify({
        inputText: text
      })
    };

    const command = new InvokeModelCommand(input);
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    return responseBody.embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Create or get Pinecone index
 */
async function initializeIndex() {
  console.log('📦 Initializing Pinecone index...');
  
  try {
    // Check if index exists
    const indexList = await pinecone.listIndexes();
    const indexExists = indexList.indexes?.some(idx => idx.name === PINECONE_INDEX_NAME);
    
    if (indexExists) {
      console.log(`✅ Index "${PINECONE_INDEX_NAME}" already exists`);
      return await pinecone.index(PINECONE_INDEX_NAME);
    } else {
      console.log(`📝 Creating new index "${PINECONE_INDEX_NAME}"...`);
      
      await pinecone.createIndex({
        name: PINECONE_INDEX_NAME,
        dimension: EMBEDDING_DIMENSIONS,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });
      
      console.log('✅ Index created successfully');
      
      // Wait a bit for index to be ready
      console.log('⏳ Waiting for index to be ready...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      return await pinecone.index(PINECONE_INDEX_NAME);
    }
  } catch (error) {
    console.error('Error initializing index:', error);
    throw error;
  }
}

/**
 * Create text representation of schema for embedding
 */
function createSchemaText(schema) {
  const columnsText = schema.columns.map(col => 
    `  - ${col.name} (${col.type}): ${col.description || 'No description'}`
  ).join('\n');
  
  return `${schema.table_name}\n${schema.description || ''}\nColumns:\n${columnsText}`;
}

/**
 * Upload schemas to Pinecone
 */
async function uploadToPinecone(index, schemas) {
  console.log(`\n📤 Uploading ${schemas.length} schemas to Pinecone...`);
  
  const batchSize = 100;
  let uploaded = 0;
  
  for (let i = 0; i < schemas.length; i += batchSize) {
    const batch = schemas.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(schemas.length / batchSize)}...`);
    
    const vectors = await Promise.all(batch.map(async (schema) => {
      const schemaText = createSchemaText(schema);
      const embedding = await generateEmbedding(schemaText);
      
      return {
        id: schema.table_name,
        values: embedding,
        metadata: {
          table_name: schema.table_name,
          description: schema.description || '',
          columns: JSON.stringify(schema.columns),
          schema: JSON.stringify(schema)
        }
      };
    }));
    
    await index.upsert(vectors);
    uploaded += batch.length;
    console.log(`✅ Uploaded ${uploaded}/${schemas.length} vectors`);
    
    // Rate limiting delay
    if (i + batchSize < schemas.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`✅ All ${uploaded} schemas uploaded to Pinecone!`);
}

/**
 * Main setup function
 */
async function setupTuva() {
  try {
    console.log('🚀 Starting Tuva setup...\n');
    
    // Step 1: Parse Tuva schema
    console.log('Step 1: Parsing Tuva schema...');
    const schemas = await parseTuvaSchema();
    console.log(`✅ Parsed ${schemas.length} schemas\n`);
    
    // Step 2: Initialize Pinecone index
    console.log('Step 2: Setting up Pinecone...');
    const index = await initializeIndex();
    console.log('✅ Pinecone ready\n');
    
    // Step 3: Upload schemas to Pinecone
    console.log('Step 3: Uploading schemas...');
    await uploadToPinecone(index, schemas);
    console.log('\n✅ Setup complete!\n');
    
    console.log('Summary:');
    console.log(`  - Schemas parsed: ${schemas.length}`);
    console.log(`  - Embeddings generated: ${schemas.length}`);
    console.log(`  - Vectors uploaded to Pinecone: ${schemas.length}`);
    console.log(`  - Index name: ${PINECONE_INDEX_NAME}`);
    console.log(`  - Index dimensions: ${EMBEDDING_DIMENSIONS}`);
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupTuva()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

export { setupTuva, initializeIndex, generateEmbedding, uploadToPinecone };


