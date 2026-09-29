import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DENYLIST_FILE = path.join(ROOT_DIR, '.project-names-denylist');

if (!fs.existsSync(DENYLIST_FILE)) {
  console.error(`Error: Denylist file not found at ${DENYLIST_FILE}`);
  process.exit(1);
}

const denylistLines = fs
  .readFileSync(DENYLIST_FILE, 'utf-8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('#'));

const patterns = denylistLines.map((entry) => {
  // If entry contains regex constructs like \b, compile directly, else word boundary regex
  if (entry.includes('\\b')) {
    return { name: entry, regex: new RegExp(entry, 'i') };
  }
  return { name: entry, regex: new RegExp(`\\b${entry.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i') };
});

function getAllFiles(dir, extensions = ['.ts', '.js', '.svelte', '.json', '.html', '.css']) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(filePath, extensions));
    } else {
      const ext = path.extname(filePath);
      if (extensions.includes(ext)) {
        results.push(filePath);
      }
    }
  }
  return results;
}

const files = getAllFiles(SRC_DIR);
let violations = 0;

for (const file of files) {
  const relPath = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    for (const { name, regex } of patterns) {
      if (regex.test(line)) {
        console.error(`❌ Denylist violation in ${relPath}:${index + 1} - Matched "${name}":`);
        console.error(`   ${line.trim()}`);
        violations++;
      }
    }
  });
}

if (violations > 0) {
  console.error(`\nFound ${violations} denylist violation(s) in src/.`);
  process.exit(1);
} else {
  console.log(`✅ Denylist check passed: 0 forbidden project names found in ${files.length} src/ files.`);
  process.exit(0);
}
