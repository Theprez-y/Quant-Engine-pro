// scripts/generate-license.mjs
import 'dotenv/config'; 
import { SignJWT, importPKCS8 } from 'jose';

// ⚠️ REPLACE THIS with the PRIVATE KEY you generated in Step 2
const PRIVATE_KEY = process.env.PRIVATE_KEY_PEM;

async function generateLicense(email, edition = 'PRO', daysValid = 365) {
  const privateKey = await importPKCS8(PRIVATE_KEY, 'EdDSA');
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: email,          // User's email
    edition: edition,    // 'PRO' or 'ENTERPRISE'
    iat: now,            // Issued at
    exp: now + (daysValid * 86400) // Expiration timestamp
  };

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'EdDSA' })
    .sign(privateKey);

  console.log(`\n✅ License generated for: ${email}`);
  console.log(`📅 Valid for: ${daysValid} days`);
  console.log(`\n🔑 LICENSE KEY (Give this to the user):\n${token}\n`);
}

// Example usage: Change the email to test
generateLicense('trader@example.com', 'PRO', 365);