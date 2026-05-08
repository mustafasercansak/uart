import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const base = process.argv[2];
if (!base || !/^\d+\.\d+$/.test(base)) {
  console.error('Usage: npm run release -- 1.5');
  process.exit(1);
}

const counterFile = 'scripts/.release-counter.json';
const counters = existsSync(counterFile)
  ? JSON.parse(readFileSync(counterFile, 'utf8'))
  : {};

let patch = (counters[base] ?? -1) + 1;

// Tag zaten varsa bir sonrakine geç
const existingTags = execSync('git tag').toString().split('\n');
while (existingTags.includes(`v${base}.${patch}`)) {
  patch++;
}

counters[base] = patch;
writeFileSync(counterFile, JSON.stringify(counters, null, 2) + '\n');

const version = `${base}.${patch}`;
const tag = `v${version}`;

// package.json
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
pkg.version = version;
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log(`✓ package.json → ${version}`);

// Cargo.toml
let cargo = readFileSync('src-tauri/Cargo.toml', 'utf8');
cargo = cargo.replace(/^version = ".+"/m, `version = "${version}"`);
writeFileSync('src-tauri/Cargo.toml', cargo);
console.log(`✓ Cargo.toml → ${version}`);

// tauri.conf.json
const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
conf.version = version;
writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(conf, null, 2) + '\n');
console.log(`✓ tauri.conf.json → ${version}`);

// README.md
let readme = readFileSync('README.md', 'utf8');
readme = readme.replace(/v\d+\.\d+\.\d+/g, `v${version}`);
writeFileSync('README.md', readme);
console.log(`✓ README.md → ${version}`);

// CHANGELOG.md
const today = new Date().toISOString().slice(0, 10);
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const newEntry = `## [v${version}] — ${today}\n### 🚀 Release v${version}\n- Yeni sürüm yayınlandı.\n\n---\n\n`;
const insertAt = changelog.indexOf('\n## [');
const updatedChangelog = insertAt === -1
  ? changelog + '\n' + newEntry
  : changelog.slice(0, insertAt + 1) + newEntry + changelog.slice(insertAt + 1);
writeFileSync('CHANGELOG.md', updatedChangelog);
console.log(`✓ CHANGELOG.md → ${version}`);

// git
execSync(`git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json README.md CHANGELOG.md ${counterFile}`);
execSync(`git commit -m "chore: release ${tag}"`);
execSync(`git tag ${tag}`);
execSync(`git push origin main ${tag}`);

console.log(`\n🚀 Released ${tag}`);
