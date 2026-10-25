/**
 * ============================================================================
 * PRINT-SATHI: Initial Administrator Provisioning Script
 * ============================================================================
 * 
 * Sets up the official campus administrator account in Firebase Authentication:
 * - Username: Jaideep Singh
 * - Email: admin.jaideep@printsathi.campus
 * - Password: [Passed as argument or default 123456789]
 * 
 * Usage:
 *   node scripts/setup-admin.js [optional_password]
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Read .env file for Firebase API Key
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  const envVars = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let val = match[2] || '';
        val = val.replace(/^['"]|['"]$/g, '').trim();
        envVars[match[1]] = val;
      }
    }
  }
  return envVars;
}

const env = loadEnv();
const apiKey = env.VITE_FIREBASE_API_KEY;
const projectId = env.VITE_FIREBASE_PROJECT_ID || 'print-sathi-campus';

if (!apiKey) {
  console.error('❌ Error: VITE_FIREBASE_API_KEY is not defined in .env');
  process.exit(1);
}

const adminEmail = 'admin.jaideep@printsathi.campus';
const adminDisplayName = 'Jaideep Singh';
const adminPassword = process.argv[2] || '123456789';

console.log('================================================================');
console.log('🛡️  PRINT SATHI: Campus Administrator Account Initializer');
console.log('================================================================');
console.log(`Project ID:    ${projectId}`);
console.log(`Admin Handle:  ${adminDisplayName}`);
console.log(`Admin Email:   ${adminEmail}`);
console.log('----------------------------------------------------------------\n');

async function provisionAdminAccount() {
  const payload = JSON.stringify({
    email: adminEmail,
    password: adminPassword,
    displayName: adminDisplayName,
    returnSecureToken: true,
  });

  const options = {
    hostname: 'identitytoolkit.googleapis.com',
    port: 443,
    path: `/v1/accounts:signUp?key=${apiKey}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      try {
        const json = JSON.parse(body);
        if (res.statusCode === 200) {
          console.log('✅ SUCCESS! Administrator account created in Firebase Authentication:');
          console.log(`   UID:          ${json.localId}`);
          console.log(`   Email:        ${json.email}`);
          console.log(`   Display Name: ${adminDisplayName}`);
          console.log('\nYou can now sign in at the /admin portal using:');
          console.log(`   Username: Jaideep Singh`);
          console.log(`   Password: ${adminPassword}\n`);
        } else if (json.error?.message === 'EMAIL_EXISTS') {
          console.log('ℹ️  NOTICE: Administrator account already exists in Firebase Auth.');
          console.log('   The administrator can sign in directly at the /admin portal.\n');
        } else if (json.error?.message === 'CONFIGURATION_NOT_FOUND') {
          console.error('⚠️  FIREBASE CONSOLE ACTION REQUIRED:');
          console.error('   Firebase Authentication has not been enabled in the Firebase Console for project "print-sathi-campus".');
          console.error('\n   Please follow these 4 quick steps:');
          console.error('   1. Open: https://console.firebase.google.com/project/' + projectId + '/authentication');
          console.error('   2. Click the "Get started" button.');
          console.error('   3. In the "Sign-in method" tab, select "Email/Password".');
          console.error('   4. Toggle "Enable" ON and click "Save".');
          console.error('\n   Then re-run this command: node scripts/setup-admin.js\n');
        } else {
          console.error(`❌ Provisioning Failed (HTTP ${res.statusCode}):`, json.error?.message || body);
        }
      } catch (e) {
        console.error('❌ Parse error:', e.message, body);
      }
    });
  });

  req.on('error', (err) => {
    console.error('❌ Network error during provisioning:', err.message);
  });

  req.write(payload);
  req.end();
}

provisionAdminAccount();
