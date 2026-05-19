const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REQUIRED_KEYS = ['GH_TOKEN', 'GH_OWNER', 'GH_REPO'];

function parseEnvFile(envPath) {
  const result = {};
  if (!fs.existsSync(envPath)) {
    return result;
  }

  const content = fs.readFileSync(envPath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const idx = line.indexOf('=');
    if (idx <= 0) {
      continue;
    }

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^["']|["']$/g, '');
    result[key] = value;
  }

  return result;
}

function buildReleaseEnv() {
  const envPath = path.join(process.cwd(), '.env');
  const envFromFile = parseEnvFile(envPath);
  const merged = { ...process.env };

  for (const key of REQUIRED_KEYS) {
    if (!merged[key] && envFromFile[key]) {
      merged[key] = envFromFile[key];
    }
  }

  return merged;
}

function validateReleaseEnv(env) {
  const missing = REQUIRED_KEYS.filter((key) => !env[key]);
  return missing;
}

function main() {
  const mode = process.argv[2] || '';
  const env = buildReleaseEnv();
  const missing = validateReleaseEnv(env);

  if (missing.length > 0) {
    console.error(`Missing required env vars for release: ${missing.join(', ')}`);
    console.error('Set them in process environment or in .env at project root.');
    process.exit(1);
  }

  if (mode === '--check') {
    console.log('Release env check: OK');
    return;
  }

  execSync('npm run release:github', {
    stdio: 'inherit',
    env,
  });
}

main();
