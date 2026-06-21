// Standalone parser validation — NO database required.
// Runs detect + parse against every file in prisma/seed-data and prints stats.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { detectFormat } from '../src/services/import/detect.js';
import { parseWorkbook } from '../src/services/import/parsers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '../prisma/seed-data');

const files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.xlsx'));
let total = 0;
const byFormat = {};
const sampleByFormat = {};
let withDate = 0;
let withPhone = 0;
let withAgent = 0;
let withLocation = 0;

for (const file of files) {
  const wb = XLSX.read(fs.readFileSync(path.join(DIR, file)), { type: 'buffer' });
  const fmt = detectFormat(wb);
  const recs = parseWorkbook(wb, fmt, { filename: file });
  byFormat[fmt] = (byFormat[fmt] || 0) + recs.length;
  total += recs.length;
  if (!sampleByFormat[fmt] && recs.length) sampleByFormat[fmt] = recs[0];
  for (const r of recs) {
    if (r.renewalDate || r.nextFollowUpDate || r.inquiryDate) withDate++;
    if (r.phone) withPhone++;
    if (r.agent) withAgent++;
    if (r.location) withLocation++;
  }
  console.log(`${file.padEnd(42)} -> ${fmt.padEnd(9)} ${recs.length} records`);
}

console.log('\n=== TOTALS ===');
console.log('Files:', files.length, ' Records:', total);
console.log('By format:', byFormat);
console.log(`With phone: ${withPhone}/${total}`);
console.log(`With a date: ${withDate}/${total}`);
console.log(`With agent: ${withAgent}/${total}`);
console.log(`With location: ${withLocation}/${total}`);

console.log('\n=== SAMPLE RECORD PER FORMAT ===');
for (const [fmt, rec] of Object.entries(sampleByFormat)) {
  console.log(`\n--- ${fmt} ---`);
  console.log(JSON.stringify(rec, null, 2));
}
