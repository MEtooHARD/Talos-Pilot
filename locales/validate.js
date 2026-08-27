#!/usr/bin/env node
/**
 * Checks every locale file in this folder has exactly the same key
 * structure — and the same {placeholder} tokens per key — as en.js, the
 * reference file. Run this after editing any translation, BEFORE
 * restarting the app, to catch a typo'd key, a JS syntax mistake, or a
 * mismatched {placeholder} before it causes a broken/missing message.
 *
 * Usage: node locales/validate.js   (or: npm run check-locales)
 */
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = __dirname;
const REFERENCE = 'en.js';

function collectKeys(obj, prefix = '') {
  let out = {};
  for (const k of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
      out = { ...out, ...collectKeys(obj[k], fullKey) };
    } else {
      out[fullKey] = obj[k];
    }
  }
  return out;
}

function placeholders(str) {
  return [...String(str).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
}

const files = fs
  .readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith('.js') && f !== 'validate.js' && f !== REFERENCE);

const refKeys = collectKeys(require(path.join(LOCALES_DIR, REFERENCE)));
const refKeyNames = Object.keys(refKeys).filter((k) => !k.startsWith('meta.'));

let hadProblems = false;

for (const file of files) {
  console.log(`\nChecking ${file}...`);
  let mod;
  try {
    delete require.cache[require.resolve(path.join(LOCALES_DIR, file))];
    mod = require(path.join(LOCALES_DIR, file));
  } catch (err) {
    console.log(`  ❌ Failed to load — this is a JavaScript syntax error: ${err.message}`);
    hadProblems = true;
    continue;
  }
  const keys = collectKeys(mod);
  const keyNames = Object.keys(keys).filter((k) => !k.startsWith('meta.'));

  const missing = refKeyNames.filter((k) => !keyNames.includes(k));
  const extra = keyNames.filter((k) => !refKeyNames.includes(k));
  if (missing.length) {
    console.log('  ❌ Missing keys (these will silently fall back to English):', missing);
    hadProblems = true;
  }
  if (extra.length) {
    console.log('  ⚠️  Extra keys not in en.js (harmless, but probably a leftover or typo):', extra);
  }

  let placeholderProblems = 0;
  for (const k of refKeyNames) {
    if (!(k in keys)) continue;
    const refPh = placeholders(refKeys[k]);
    const ownPh = placeholders(keys[k]);
    if (refPh !== ownPh) {
      console.log(`  ❌ ${k}: placeholders don't match — English has {${refPh || 'none'}}, this file has {${ownPh || 'none'}}`);
      hadProblems = true;
      placeholderProblems++;
    }
  }

  if (!missing.length && !extra.length && !placeholderProblems) {
    console.log(`  ✅ ${keyNames.length} keys, all present, all placeholders match.`);
  }
}

if (hadProblems) {
  console.log('\nSome problems found above — fix them before restarting the app.');
  process.exitCode = 1;
} else {
  console.log('\nAll locale files check out.');
}
