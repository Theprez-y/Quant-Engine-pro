import { jwtVerify, importSPKI } from 'jose';

// ⚠️ REPLACE THIS with the PUBLIC KEY you generated in Step 2
// Format it as a single line with \n characters, or use template literals.
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAO+66iWrKRmvcrYzS/GUaLvig/oyKtuMci8YDZafQbzc=\n-----END PUBLIC KEY-----`;

export interface LicenseStatus {
  isValid: boolean;
  email?: string;
  edition?: string;
  expiresAt?: Date;
  error?: string;
}

export async function verifyLicense(licenseKey: string): Promise<LicenseStatus> {
  try {
    // 1. Import the public key
    const publicKey = await importSPKI(PUBLIC_KEY_PEM, 'EdDSA');

    // 2. Verify the JWT signature and expiration locally (NO NETWORK CALLS)
    const { payload } = await jwtVerify(licenseKey, publicKey, {
      algorithms: ['EdDSA'],
    });

    // 3. Check custom claims
    if (payload.edition !== 'PRO' && payload.edition !== 'ENTERPRISE') {
      return { isValid: false, error: 'Invalid license edition.' };
    }

    return {
      isValid: true,
      email: payload.sub as string,
      edition: payload.edition as string,
      expiresAt: payload.exp ? new Date(payload.exp * 1000) : undefined,
    };
  } catch (err: any) {
    // jose throws specific errors we can catch
    if (err.code === 'ERR_JWT_EXPIRED') {
      return { isValid: false, error: 'License has expired.' };
    }
    if (err.code === 'ERR_JWS_INVALID') {
      return { isValid: false, error: 'Invalid or tampered license key.' };
    }
    return { isValid: false, error: 'Verification failed.' };
  }
}