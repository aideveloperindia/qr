/**
 * QR Code Generation Script
 * Generates a QR code PNG for the SHARED1 code
 */

const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

// Get the base URL from environment or use deployment URL
const BASE_URL = process.env.BASE_URL || 'https://oneqrcode.vercel.app';
const CODE = process.env.CODE || 'SHARED1';
const DEMO_MODE = process.env.DEMO_MODE === 'true' || process.env.DEMO === 'true';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'qr');
const OUTPUT_FILE = path.join(OUTPUT_DIR, `${CODE}${DEMO_MODE ? '_demo' : ''}.png`);

async function generateQR() {
  try {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    let url = `${BASE_URL}/p/${CODE}`;
    if (DEMO_MODE) {
      url += '?demo=true';
    }
    console.log(`Generating QR code for: ${url}`);
    console.log(`Output: ${OUTPUT_FILE}`);

    // Generate QR code
    await QRCode.toFile(OUTPUT_FILE, url, {
      errorCorrectionLevel: 'H',
      type: 'png',
      quality: 0.92,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 512
    });

    console.log('✅ QR code generated successfully!');
    console.log(`📁 File saved to: ${OUTPUT_FILE}`);
    console.log(`\n📱 Test URL: ${url}`);
    if (DEMO_MODE) {
      console.log(`\n🎭 DEMO MODE: Payment simulator will be shown instead of real payment apps`);
    }
    console.log(`\n💡 To use with ngrok, set BASE_URL environment variable:`);
    console.log(`   BASE_URL=https://your-ngrok-url.ngrok.io npm run generate-qr`);
    console.log(`\n💡 For demo mode (payment simulator):`);
    console.log(`   DEMO_MODE=true BASE_URL=https://your-ngrok-url.ngrok.io npm run generate-qr`);
  } catch (error) {
    console.error('❌ Error generating QR code:', error);
    process.exit(1);
  }
}

generateQR();



