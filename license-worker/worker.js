import { SignJWT, importPKCS8 } from 'jose';
import { createHmac } from 'crypto';

export default {
  async fetch(request, env) {
    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      // 1. Verify LemonSqueezy webhook signature
      const signature = request.headers.get('x-signature');
      const body = await request.text();
      
      if (!verifyWebhookSignature(body, signature, env.LEMONSQUEEZY_WEBHOOK_SECRET)) {
        return new Response('Invalid signature', { status: 401 });
      }

      // 2. Parse the webhook payload
      const payload = JSON.parse(body);
      const eventName = payload.meta.event_name;
      
      // Only process successful orders
      if (eventName !== 'order_created') {
        return new Response('Event ignored', { status: 200 });
      }

      const orderAttributes = payload.data.attributes;
      const email = orderAttributes.user_email;
      const productName = orderAttributes.first_order_item?.name || 'QuantEngine Pro';
      
      // Determine edition based on product variant
      const variantName = orderAttributes.first_order_item?.variant_name || '';
      const edition = variantName.toLowerCase().includes('enterprise') ? 'ENTERPRISE' : 'PRO';
      const daysValid = 365;

      // 3. Generate the license key
      const licenseKey = await generateLicenseKey(email, edition, daysValid, env.PRIVATE_KEY_PEM);

      // 4. Send the license key via email
      await sendLicenseEmail(email, licenseKey, edition, daysValid, env.RESEND_API_KEY);

      // 5. (Optional) Store in KV for key recovery
      if (env.LICENSE_KV) {
        await env.LICENSE_KV.put(`license:${email}`, JSON.stringify({
          key: licenseKey,
          edition,
          expiresAt: Date.now() + (daysValid * 86400000),
          createdAt: Date.now()
        }));
      }

      return new Response(JSON.stringify({ 
        success: true, 
        email, 
        edition 
      }), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Webhook error:', error);
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

// Verify LemonSqueezy webhook signature
function verifyWebhookSignature(body, signature, secret) {
  const hmac = createHmac('sha256', secret);
  hmac.update(body);
  const computedSignature = hmac.digest('hex');
  return computedSignature === signature;
}

// Generate Ed25519-signed JWT license key
async function generateLicenseKey(email, edition, daysValid, privateKeyPem) {
  const privateKey = await importPKCS8(privateKeyPem, 'EdDSA');
  
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    sub: email,
    edition: edition,
    iat: now,
    exp: now + (daysValid * 86400)
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .sign(privateKey);

  return jwt;
}

// Send license key via Resend email API
async function sendLicenseEmail(email, licenseKey, edition, daysValid, resendApiKey) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'QuantEngine Pro <licenses@yourdomain.com>', // Replace with your domain
      to: email,
      subject: `Your QuantEngine Pro ${edition} License Key`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #C9A15A; margin-bottom: 20px;">Thank you for your purchase!</h2>
          
          <p style="color: #333; line-height: 1.6;">
            Your <strong>${edition}</strong> license key for QuantEngine Pro is ready.
          </p>
          
          <div style="background: #14161A; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <div style="color: #8B92A0; font-size: 12px; margin-bottom: 8px;">YOUR LICENSE KEY</div>
            <div style="color: #C9A15A; font-family: 'Courier New', monospace; font-size: 14px; word-break: break-all; line-height: 1.5;">
              ${licenseKey}
            </div>
          </div>
          
          <h3 style="color: #333; margin-top: 30px;">How to Activate</h3>
          <ol style="color: #555; line-height: 1.8;">
            <li>Open QuantEngine Pro</li>
            <li>Paste your license key into the activation screen</li>
            <li>Click "Activate License"</li>
          </ol>
          
          <div style="background: #f5f5f5; border-left: 4px solid #C9A15A; padding: 15px; margin: 20px 0;">
            <div style="color: #666; font-size: 13px;">
              <strong>License Details:</strong><br>
              Edition: ${edition}<br>
              Valid for: ${daysValid} days<br>
              Licensed to: ${email}
            </div>
          </div>
          
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            If you have any questions, reply to this email.
          </p>
        </div>
      `
    })
  });

  if (!response.ok) {
    throw new Error(`Email send failed: ${await response.text()}`);
  }
}