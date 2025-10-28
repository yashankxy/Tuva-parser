# Tuva Text-to-SQL Demo

A Text-to-SQL system for the Tuva Project healthcare data model using Amazon Bedrock and Pinecone vector search.

## Overview

This system allows you to query Tuva Project healthcare data using natural language. Ask questions in plain English and get SQL queries with results automatically.

## Features

- 🤖 **Natural Language to SQL**: Ask questions in plain English
- 🔍 **Vector Search**: Smart schema context retrieval using Pinecone
- 🏥 **Tuva Schema**: 218 tables automatically extracted from Tuva Project
- 🔒 **Secure**: Only SELECT queries allowed, fully validated
- ⚡ **Fast**: One-time setup, instant queries

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp env.example .env
```

Edit `.env` with your credentials:

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret

# Pinecone Configuration
PINECONE_API_KEY=your_pinecone_key

# Server Configuration
PORT=3000
```

**Getting Pinecone API Key:**
1. Sign up at https://www.pinecone.io/
2. Create a new project
3. Go to API Keys section
4. Copy your API key to `.env` file

### 3. Setup Tuva Schema (One-Time)

```bash
npm run setup-tuva
```

This will:
- Clone Tuva repository
- Parse 218 table schemas
- Generate embeddings using Bedrock
- Upload to Pinecone

**Note**: This runs once. Re-run only if Tuva updates their schema.

### 4. Start Server

```bash
npm start
```

Server runs on `http://localhost:3000`

## API Usage

### Query Endpoint

**POST /query**

Ask a natural language question:

```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "How many patients are in the database?"}'
```

**Response:**
```json
{
  "sql": "SELECT COUNT(*) FROM core__patient",
  "result": [{"count": 5}],
  "tables_used": ["core__patient"],
  "similarity_scores": [0.92],
  "rowCount": 1
}
```

### Health Check

**GET /health**

```bash
curl http://localhost:3000/health
```

## Sample Questions

- "How many patients are in the database?"
- "What are all the locations in California?"
- "Show me all diabetic patients"
- "How many encounters happened in February 2024?"
- "What medications were prescribed to patient X?"
- "Which patients have hypertension?"
- "Show me all inpatient encounters"
- "What are the lab results for patient X?"

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system architecture and flow diagrams.

### Key Components

1. **tuva-parser.js** - Extracts schema from Tuva GitHub repo
2. **setup-tuva.js** - Embeds schemas and uploads to Pinecone
3. **vector-search.js** - Finds relevant tables for queries
4. **server.js** - Express API with query handling

### Tech Stack

- **Node.js + Express** - API backend
- **Amazon Bedrock** - Embeddings & SQL generation
- **Pinecone** - Vector search
- **SQLite** - Demo database

## Environment Variables

See `env.example` for all configuration options:

- `AWS_REGION` - AWS region (default: us-east-1)
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `PINECONE_API_KEY` - Pinecone API key
- `PORT` - Server port (default: 3000)
- `TOP_K_TABLES` - Number of relevant tables to retrieve (default: 5)

## Troubleshooting

### AWS Bedrock Access
- Ensure Bedrock is enabled in your AWS account
- Verify model access for `amazon.titan-embed-text-v1`
- Check IAM permissions for Bedrock

### Pinecone Setup
- Get free account at https://www.pinecone.io/
- Free tier includes 1 index, 100K vectors
- Serverless indexes available in AWS us-east-1

### Schema Parsing
- `tuva-schema.json` created after parsing
- Re-run `npm run setup-tuva` to refresh schema

## File Structure

```
├── tuva-parser.js        # Parse Tuva repo → Schema JSON
├── setup-tuva.js       # Embed → Upload to Pinecone
├── vector-search.js     # Find relevant tables
├── server.js            # Express API
├── setup-database.js     # Create demo SQLite DB
├── tuva-schema.json     # Extracted schemas (218 tables)
├── tuva-repo/           # Cloned Tuva repository
├── package.json          # Dependencies
└── .env                  # Environment configuration
```

## How It Works

### Setup Phase (One-Time)
1. Clone Tuva repository
2. Parse schema YAML files
3. Generate embeddings using Bedrock Titan
4. Store in Pinecone vector database

### Query Phase (Runtime)
1. User asks question
2. Embed question using Bedrock
3. Vector search Pinecone for similar tables
4. Send relevant tables (3-5) to Bedrock
5. Generate SQL from question + schema
6. Validate SQL (only SELECT)
7. Execute on SQLite
8. Return results

## Acceptance Criteria

- ✅ Automatic schema extraction from Tuva repo
- ✅ No hardcoded schemas
- ✅ Vector search for smart context
- ✅ SQL validation for security
- ✅ One-time setup
- ✅ Production-ready architecture

## License

MIT
# Tuva-parser
