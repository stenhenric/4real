import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const outputPath = path.join(rootDir, 'docs', 'repository-architecture-map.md');
const trackedFileListPath = path.join(rootDir, '.generated', 'tracked-files.txt');
const supportedCodeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function toPosixPath(value) {
  return value.replace(/\\/g, '/');
}

function readTrackedFiles() {
  const shouldInclude = (file) => (
    file.length > 0
    && !file.startsWith('.git/')
    && !file.startsWith('node_modules/')
    && !file.startsWith('dist/')
    && !file.startsWith('.generated/')
    && !file.startsWith('playwright-report/')
    && !file.startsWith('test-results/')
    && !file.startsWith('.kiro/')
  );

  try {
    return execSync('git ls-files --cached --others --exclude-standard', {
      cwd: rootDir,
      encoding: 'utf8',
    })
      .split(/\r?\n/)
      .map((file) => file.trim())
      .filter(shouldInclude)
      .map(toPosixPath);
  } catch {
    if (fs.existsSync(trackedFileListPath)) {
      return fs.readFileSync(trackedFileListPath, 'utf8')
        .split(/\r?\n/)
        .map((file) => file.trim())
        .filter(shouldInclude)
        .map(toPosixPath);
    }

    throw new Error('Unable to resolve repository file inventory.');
  }
}

function readEnvKeys() {
  const envExamplePath = path.join(rootDir, '.env.example');
  const content = fs.readFileSync(envExamplePath, 'utf8');

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && line.includes('='))
    .map((line) => line.slice(0, line.indexOf('=')))
    .filter(Boolean);
}

function isCodeFile(filePath) {
  return supportedCodeExtensions.has(path.posix.extname(filePath));
}

function isInternalSpecifier(specifier) {
  return specifier.startsWith('.') || specifier.startsWith('@/');
}

function resolveInternalSpecifier(fromFile, specifier, trackedSet) {
  const baseDirectory = path.posix.dirname(fromFile);
  const normalizedBase = specifier.startsWith('@/') ? specifier.slice(2) : path.posix.normalize(path.posix.join(baseDirectory, specifier));
  const candidates = [
    normalizedBase,
    `${normalizedBase}.ts`,
    `${normalizedBase}.tsx`,
    `${normalizedBase}.js`,
    `${normalizedBase}.jsx`,
    `${normalizedBase}.mjs`,
    `${normalizedBase}.cjs`,
    path.posix.join(normalizedBase, 'index.ts'),
    path.posix.join(normalizedBase, 'index.tsx'),
    path.posix.join(normalizedBase, 'index.js'),
    path.posix.join(normalizedBase, 'index.mjs'),
  ];

  return candidates.find((candidate) => trackedSet.has(candidate)) ?? null;
}

function collectSpecifiers(content) {
  const specifiers = new Set();
  const staticImportRegex = /(?:import|export)\s+(?:type\s+)?(?:[^'"`]+?\s+from\s+)?['"]([^'"`]+)['"]/g;
  const dynamicImportRegex = /import\(\s*['"]([^'"`]+)['"]\s*\)/g;

  for (const regex of [staticImportRegex, dynamicImportRegex]) {
    let match = regex.exec(content);
    while (match) {
      if (match[1]) {
        specifiers.add(match[1]);
      }
      match = regex.exec(content);
    }
  }

  return [...specifiers];
}

function humanizeName(value) {
  return value
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function describePurpose(filePath) {
  const basename = path.posix.basename(filePath);
  const directory = path.posix.dirname(filePath);
  const name = humanizeName(basename);

  if (filePath === '.env.example') return 'Example environment contract for local and production configuration.';
  if (filePath === 'package.json') return 'Workspace manifest, dependency graph, and task entrypoints.';
  if (filePath === 'package-lock.json') return 'Pinned npm dependency lockfile for reproducible installs.';
  if (filePath === 'main.ts') return 'Server bootstrap entry that starts the runtime.';
  if (filePath === 'index.html') return 'Vite HTML shell for the SPA.';
  if (filePath === 'vite.config.ts') return 'Vite build and dev-server configuration.';
  if (filePath === 'tsconfig.json') return 'Shared TypeScript compiler configuration for the frontend workspace.';
  if (filePath === 'tsconfig.server.json') return 'TypeScript compiler configuration for the server build.';
  if (filePath === 'tsconfig.tests.json') return 'TypeScript test compilation configuration.';
  if (filePath.startsWith('public/')) return `Static public asset: ${name}.`;
  if (filePath.startsWith('mongodb-security/')) return `MongoDB security reference or skill material: ${name}.`;
  if (filePath.startsWith('scripts/')) return `Repository utility script for ${name}.`;
  if (filePath.startsWith('server/routes/')) return `Express route registration for ${humanizeName(path.posix.basename(filePath, '.ts'))}.`;
  if (filePath.startsWith('server/controllers/')) return `HTTP controller for ${humanizeName(path.posix.basename(filePath, '.ts'))}.`;
  if (filePath.startsWith('server/services/')) return `Server-side service layer for ${humanizeName(path.posix.basename(filePath, '.ts'))}.`;
  if (filePath.startsWith('server/repositories/')) return `Persistence helper or repository for ${humanizeName(path.posix.basename(filePath, '.ts'))}.`;
  if (filePath.startsWith('server/models/')) return `Mongoose model definition for ${humanizeName(path.posix.basename(filePath, '.ts'))}.`;
  if (filePath.startsWith('server/middleware/') && filePath.endsWith('.test.ts')) return `Node test coverage for ${humanizeName(path.posix.basename(filePath, '.test.ts'))}.`;
  if (filePath.startsWith('server/middleware/')) return `Express middleware for ${humanizeName(path.posix.basename(filePath, '.ts'))}.`;
  if (filePath.startsWith('server/config/')) return `Runtime configuration helper for ${humanizeName(path.posix.basename(filePath, '.ts'))}.`;
  if (filePath.startsWith('server/sockets/')) return `Socket.IO event wiring for ${humanizeName(path.posix.basename(filePath, '.ts'))}.`;
  if (filePath.startsWith('server/workers/')) return `Background worker task for ${humanizeName(path.posix.basename(filePath, '.ts'))}.`;
  if (filePath.startsWith('server/validation/')) return `Request validation schema for ${humanizeName(path.posix.basename(filePath, '.ts'))}.`;
  if (filePath.startsWith('server/schemas/')) return `External payload schema for ${humanizeName(path.posix.basename(filePath, '.ts'))}.`;
  if (filePath.startsWith('server/http/')) return `HTTP frontend integration helper for ${humanizeName(path.posix.basename(filePath, '.ts'))}.`;
  if (filePath.startsWith('server/lib/')) return `Low-level infrastructure helper for ${humanizeName(path.posix.basename(filePath, '.ts'))}.`;
  if (filePath.startsWith('server/utils/')) return `Shared server utility for ${humanizeName(path.posix.basename(filePath, '.ts'))}.`;
  if (filePath.startsWith('shared/')) return `Shared cross-runtime contract for ${name}.`;
  if (filePath.startsWith('src/pages/')) return `React page component for ${humanizeName(path.posix.basename(filePath, path.posix.extname(filePath)))}.`;
  if (filePath.startsWith('src/app/')) return `React application shell component for ${humanizeName(path.posix.basename(filePath, path.posix.extname(filePath)))}.`;
  if (filePath.startsWith('src/components/')) return `Reusable React UI component for ${humanizeName(path.posix.basename(filePath, path.posix.extname(filePath)))}.`;
  if (filePath.startsWith('src/features/')) return `Feature module for ${humanizeName(path.posix.basename(filePath, path.posix.extname(filePath)))}.`;
  if (filePath.startsWith('src/services/')) return `Frontend API or state service for ${humanizeName(path.posix.basename(filePath, path.posix.extname(filePath)))}.`;
  if (filePath.startsWith('src/hooks/')) return `Reusable React hook for ${humanizeName(path.posix.basename(filePath, path.posix.extname(filePath)))}.`;
  if (filePath.startsWith('src/canvas/')) return `Canvas rendering helper for ${humanizeName(path.posix.basename(filePath, path.posix.extname(filePath)))}.`;
  if (filePath.startsWith('src/utils/')) return `Frontend utility helper for ${humanizeName(path.posix.basename(filePath, path.posix.extname(filePath)))}.`;
  if (filePath.startsWith('src/sockets/')) return `Frontend socket client helper for ${humanizeName(path.posix.basename(filePath, path.posix.extname(filePath)))}.`;
  if (filePath.startsWith('src/types/')) return `Frontend type bridge for ${humanizeName(path.posix.basename(filePath, path.posix.extname(filePath)))}.`;
  if (filePath.endsWith('.md')) return `Project documentation: ${name}.`;
  if (filePath.endsWith('.json')) return `JSON metadata asset for ${name}.`;

  return `Tracked repository file for ${name}.`;
}

function determineTechStack(filePath) {
  const extension = path.posix.extname(filePath);

  if (filePath.endsWith('.tsx')) return 'TypeScript + React';
  if (filePath.endsWith('.ts')) {
    if (filePath.startsWith('server/')) return 'TypeScript + Node.js';
    if (filePath.startsWith('src/')) return 'TypeScript';
    if (filePath.startsWith('shared/')) return 'TypeScript shared contract';
    return 'TypeScript';
  }
  if (filePath.endsWith('.mjs') || filePath.endsWith('.js')) return 'JavaScript + Node.js';
  if (filePath.endsWith('.html')) return 'Static HTML';
  if (filePath.endsWith('.svg')) return 'SVG asset';
  if (filePath.endsWith('.json')) return 'JSON';
  if (filePath.endsWith('.md')) return 'Markdown';
  if (filePath === '.env.example') return 'dotenv environment template';

  return extension ? extension.slice(1) : 'text';
}

function determineRuntimeRole(filePath) {
  if (filePath === 'main.ts') return 'Primary server entrypoint';
  if (filePath.startsWith('server/')) return 'Backend runtime';
  if (filePath.startsWith('src/')) return 'Frontend runtime';
  if (filePath.startsWith('shared/')) return 'Shared runtime contract';
  if (filePath.startsWith('public/')) return 'Static asset';
  if (filePath.startsWith('scripts/')) return 'Build or ops script';
  if (filePath.endsWith('.test.ts')) return 'Automated verification';
  if (filePath.endsWith('.md')) return 'Documentation';

  return 'Repository support file';
}

function summarizeItems(items, limit = 4) {
  if (items.length === 0) {
    return 'None';
  }

  const sorted = [...items].sort();
  const head = sorted.slice(0, limit);
  const suffix = sorted.length > limit ? ` +${sorted.length - limit} more` : '';
  return `${head.join(', ')}${suffix}`;
}

function buildMarkdownReport(files, metadata) {
  const topLevelSummary = files.reduce((accumulator, file) => {
    const area = file.includes('/') ? file.slice(0, file.indexOf('/')) : file;
    accumulator.set(area, (accumulator.get(area) ?? 0) + 1);
    return accumulator;
  }, new Map());

  const sections = [];
  sections.push('# Repository Architecture & File Map');
  sections.push('');
  sections.push('Generated from tracked files and the internal import graph. Purpose and runtime-role descriptions are heuristic summaries of the current repository layout.');
  sections.push('');
  sections.push('## Scope');
  sections.push('');
  sections.push(`- Tracked files inventoried: ${files.length}`);
  sections.push(`- Top-level areas: ${[...topLevelSummary.entries()].map(([area, count]) => `${area} (${count})`).join(', ')}`);
  sections.push('- Coverage status is computed from `.test.ts` files that can reach a file through internal imports.');
  sections.push('');

  const groupedFiles = files.reduce((accumulator, file) => {
    const area = file.includes('/') ? file.slice(0, file.indexOf('/')) : 'root';
    if (!accumulator.has(area)) {
      accumulator.set(area, []);
    }
    accumulator.get(area).push(file);
    return accumulator;
  }, new Map());

  for (const [area, areaFiles] of [...groupedFiles.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    sections.push(`## ${area}`);
    sections.push('');
    sections.push('| File | Purpose | Stack | Direct Dependencies | Used By | Runtime Role | Env Touchpoints | Test Coverage |');
    sections.push('| --- | --- | --- | --- | --- | --- | --- | --- |');

    for (const file of areaFiles.sort()) {
      const info = metadata.get(file);
      sections.push(`| \`${file}\` | ${info.purpose} | ${info.techStack} | ${info.directDependencies} | ${info.usedBy} | ${info.runtimeRole} | ${info.envTouchpoints} | ${info.coverageStatus} |`);
    }

    sections.push('');
  }

  return sections.join('\n');
}

const trackedFiles = readTrackedFiles().filter((file) => fs.existsSync(path.join(rootDir, file)));
const trackedSet = new Set(trackedFiles);
const envKeys = readEnvKeys();
const internalGraph = new Map();
const reverseGraph = new Map();
const coverageRoots = new Map();

for (const file of trackedFiles) {
  reverseGraph.set(file, new Set());
  coverageRoots.set(file, new Set());
}

for (const file of trackedFiles.filter(isCodeFile)) {
  const absolutePath = path.join(rootDir, file);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const specifiers = collectSpecifiers(content);
  const dependencies = new Set();

  for (const specifier of specifiers) {
    if (!isInternalSpecifier(specifier)) {
      continue;
    }

    const resolved = resolveInternalSpecifier(file, specifier, trackedSet);
    if (resolved) {
      dependencies.add(resolved);
      reverseGraph.get(resolved)?.add(file);
    }
  }

  internalGraph.set(file, dependencies);
}

function markCoverage(testFile, currentFile, visited = new Set()) {
  if (visited.has(currentFile)) {
    return;
  }

  visited.add(currentFile);
  coverageRoots.get(currentFile)?.add(testFile);

  for (const dependency of internalGraph.get(currentFile) ?? []) {
    markCoverage(testFile, dependency, visited);
  }
}

for (const testFile of trackedFiles.filter((file) => file.endsWith('.test.ts'))) {
  markCoverage(testFile, testFile);
}

const metadata = new Map();

for (const file of trackedFiles) {
  const absolutePath = path.join(rootDir, file);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const envTouchpoints = envKeys.filter((key) => content.includes(key));
  const directDependencies = [...(internalGraph.get(file) ?? [])];
  const usedBy = [...(reverseGraph.get(file) ?? [])];
  const coverageSet = coverageRoots.get(file) ?? new Set();

  metadata.set(file, {
    purpose: describePurpose(file),
    techStack: determineTechStack(file),
    directDependencies: summarizeItems(directDependencies),
    usedBy: summarizeItems(usedBy),
    runtimeRole: determineRuntimeRole(file),
    envTouchpoints: envTouchpoints.length > 0 ? envTouchpoints.join(', ') : 'None',
    coverageStatus: file.endsWith('.test.ts')
      ? 'Test file'
      : coverageSet.size > 0
        ? `Reachable from ${coverageSet.size} test file(s)`
        : 'No direct automated coverage detected',
  });
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, buildMarkdownReport(trackedFiles, metadata), 'utf8');

console.log(`Wrote ${path.relative(rootDir, outputPath)}`);
