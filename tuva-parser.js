import simpleGit from 'simple-git';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Tuva Schema Parser
 * Automatically extracts schema information from the Tuva Project repository
 */

const TUVA_REPO_URL = 'https://github.com/tuva-health/tuva.git';
const REPO_DIR = path.join(__dirname, 'tuva-repo');
const OUTPUT_FILE = path.join(__dirname, 'tuva-schema.json');

/**
 * Clone or update the Tuva repository
 */
async function cloneTuvaRepo() {
  console.log('📥 Cloning Tuva repository...');
  
  const git = simpleGit(__dirname);
  
  if (fs.existsSync(REPO_DIR)) {
    console.log('Repository already exists. Pulling latest changes...');
    await git.cwd(REPO_DIR);
    await git.pull();
  } else {
    console.log('Cloning repository for the first time...');
    await git.clone(TUVA_REPO_URL, REPO_DIR);
    console.log('✅ Repository cloned successfully');
  }
}

/**
 * Find all YAML files in the models directory
 */
function findYamlFiles(dir) {
  const files = [];
  
  function walkDir(currentPath) {
    if (!fs.existsSync(currentPath)) return;
    
    const items = fs.readdirSync(currentPath, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(currentPath, item.name);
      
      if (item.isDirectory()) {
        // Skip certain directories
        if (!item.name.startsWith('.') && item.name !== 'node_modules') {
          walkDir(fullPath);
        }
      } else if (item.isFile() && (item.name.endsWith('.yml') || item.name.endsWith('.yaml'))) {
        files.push(fullPath);
      }
    }
  }
  
  walkDir(dir);
  return files;
}

/**
 * Parse a YAML file to extract table schemas
 */
function parseYamlFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = yaml.load(content);
    
    const schemas = [];
    
    // Parse YAML structure for dbt models
    if (data && typeof data === 'object') {
      // Look for version key (dbt uses this)
      if (data.version === 2) {
        // This is a dbt v2 YAML file
        const models = data.models || [];
        
        for (const model of models) {
          if (model.name && model.columns) {
            schemas.push({
              table_name: model.name,
              description: model.description || model.docs?.meta?.description || '',
              columns: model.columns.map(col => ({
                name: col.name,
                type: col.data_type || col.dataType || 'TEXT',
                description: col.description || ''
              }))
            });
          }
        }
      } else {
        // Generic YAML structure - try to find model definitions
        Object.keys(data).forEach(key => {
          if (typeof data[key] === 'object' && data[key].columns) {
            schemas.push({
              table_name: key,
              description: data[key].description || '',
              columns: (data[key].columns || []).map(col => ({
                name: typeof col === 'string' ? col : col.name,
                type: typeof col === 'string' ? 'TEXT' : (col.type || col.data_type || 'TEXT'),
                description: typeof col === 'string' ? '' : (col.description || '')
              }))
            });
          }
        });
      }
    }
    
    return schemas;
  } catch (error) {
    console.warn(`⚠️  Error parsing ${filePath}:`, error.message);
    return [];
  }
}

/**
 * Extract documentation from markdown files
 */
function extractDocumentation() {
  const docsDir = path.join(REPO_DIR, 'dbt_doc_blocks');
  const documentation = {};
  
  if (!fs.existsSync(docsDir)) {
    console.log('📝 Documentation directory not found, skipping...');
    return documentation;
  }
  
  const files = findYamlFiles(docsDir);
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const data = yaml.load(content);
      
      if (data && typeof data === 'object') {
        Object.keys(data).forEach(key => {
          documentation[key] = data[key];
        });
      }
    } catch (error) {
      console.warn(`⚠️  Error reading doc file ${file}:`, error.message);
    }
  }
  
  return documentation;
}

/**
 * Main parsing function
 */
async function parseTuvaSchema() {
  try {
    // Step 1: Clone/update repository
    await cloneTuvaRepo();
    
    // Step 2: Find all YAML files in models directory
    const modelsDir = path.join(REPO_DIR, 'models');
    
    if (!fs.existsSync(modelsDir)) {
      console.error('❌ Models directory not found in Tuva repo');
      console.log('Attempting to find structure...');
      const items = fs.readdirSync(REPO_DIR);
      console.log('Found directories:', items);
      return;
    }
    
    console.log('📂 Scanning for YAML files in models directory...');
    const yamlFiles = findYamlFiles(modelsDir);
    console.log(`Found ${yamlFiles.length} YAML files`);
    
    // Step 3: Parse each YAML file
    const allSchemas = [];
    
    for (const file of yamlFiles) {
      const schemas = parseYamlFile(file);
      allSchemas.push(...schemas);
    }
    
    console.log(`✅ Parsed ${allSchemas.length} table schemas`);
    
    // Step 4: Extract documentation
    const documentation = extractDocumentation();
    
    // Step 5: Merge documentation with schemas
    const enrichedSchemas = allSchemas.map(schema => {
      const doc = documentation[schema.table_name] || {};
      return {
        ...schema,
        description: schema.description || doc.description || doc.content || '',
        full_description: doc.content || schema.description
      };
    });
    
    // Step 6: Save to JSON
    const output = {
      timestamp: new Date().toISOString(),
      total_tables: enrichedSchemas.length,
      schemas: enrichedSchemas
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`✅ Schema saved to ${OUTPUT_FILE}`);
    
    // Step 7: Print summary
    console.log('\n📊 Summary:');
    console.log(`   Total tables: ${enrichedSchemas.length}`);
    console.log(`   Tables: ${enrichedSchemas.map(s => s.table_name).join(', ')}`);
    
    return enrichedSchemas;
    
  } catch (error) {
    console.error('❌ Error parsing Tuva schema:', error);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  parseTuvaSchema()
    .then(schemas => {
      console.log('\n✅ Tuva schema parsing complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Failed to parse Tuva schema:', error);
      process.exit(1);
    });
}

export { parseTuvaSchema, TUVA_REPO_URL, REPO_DIR, OUTPUT_FILE };


