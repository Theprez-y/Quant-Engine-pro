// scripts/generate-keys.mjs
import { generateKeyPair, exportSPKI, exportPKCS8 } from 'jose';

async function main() {
  console.log('Generating Ed25519 Key Pair...\n');
  
  // FIX: Added { extractable: true } so the keys can be exported to text
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true });
  
  // Export them as PEM strings (easy to copy/paste)
  const spki = await exportSPKI(publicKey);
  const pkcs8 = await exportPKCS8(privateKey);

  console.log('✅ PUBLIC KEY (Embed this in your app):');
  console.log(spki.replace(/\n/g, '\\n').replace(/"/g, '\\"'));
  console.log('\n🔒 PRIVATE KEY (Keep this secret! Use this to generate licenses):');
  console.log(pkcs8.replace(/\n/g, '\\n').replace(/"/g, '\\"'));
}

main().catch(console.error);