import { config as load } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, closeDb } from '../lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
load({ path: path.resolve(__dirname, '../.env.local') });
load({ path: path.resolve(__dirname, '../.env') });

const res = await query('PRAGMA table_info(materials)');
console.table(res.rows.map(c => c.name));
await closeDb();
