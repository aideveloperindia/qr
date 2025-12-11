const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { detectApp, AppType } = require('./lib/appDetector');
const { resolveMerchant, getMerchantsByCode } = require('./lib/merchantResolver');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));

// Logging middleware
app.use((req, res, next) => {
  const logData = {
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    userAgent: req.get('user-agent'),
    xRequestedWith: req.get('x-requested-with'),
    ip: req.ip || req.connection.remoteAddress,
    query: req.query
  };
  console.log('[REQUEST]', JSON.stringify(logData, null, 2));
  next();
});

// Helper to reload merchants
function reloadMerchants() {
  delete require.cache[require.resolve('./data/merchants.json')];
  return require('./data/merchants.json');
}

// Helper to extract UPI ID from intent URL
function extractUPIId(intentUrl) {
  const match = intentUrl.match(/pa=([^&]+)/);
  if (match) {
    return decodeURIComponent(match[1]);
  }
  return 'unknown@upi';
}

// Home route
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>QR Multiplex Demo</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        h1 { color: #667eea; }
        .endpoint { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 8px; }
        a { color: #667eea; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <h1>🚀 QR Multiplex Demo</h1>
      <p>Welcome to the QR Multiplex demo application.</p>
      <div class="endpoint">
        <strong>Main QR Endpoint:</strong> <a href="/p/SHARED1">/p/SHARED1</a>
      </div>
      <div class="endpoint">
        <strong>Admin Panel:</strong> <a href="/admin">/admin</a>
      </div>
      <div class="endpoint">
        <strong>Health Check:</strong> <a href="/health">/health</a>
      </div>
    </body>
    </html>
  `);
});

// Admin routes
app.get('/admin', (req, res) => {
  const currentMerchants = reloadMerchants();
  res.render('admin', { merchants: currentMerchants });
});

app.post('/admin/merchants', (req, res) => {
  const fs = require('fs');
  const updatedMerchants = req.body.merchants;
  fs.writeFileSync(
    path.join(__dirname, 'data/merchants.json'),
    JSON.stringify(updatedMerchants, null, 2)
  );
  // Reload merchants
  reloadMerchants();
  res.json({ success: true, message: 'Merchants updated successfully' });
});

// Main QR endpoint
app.get('/p/:code', async (req, res) => {
  // DISABLE CACHING - Always execute code
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  const { code } = req.params;
  const userAgent = (req.get('user-agent') || '').toLowerCase();
  const xRequestedWith = (req.get('x-requested-with') || '').toLowerCase();
  const referer = (req.get('referer') || '').toLowerCase();
  const ip = req.ip || req.connection.remoteAddress;
  
  // CRITICAL: ALWAYS LOG EVERYTHING
  console.log('========================================');
  console.log(`[QR SCAN] Code: ${code}`);
  console.log(`[QR SCAN] User-Agent: ${req.get('user-agent') || 'NONE'}`);
  console.log(`[QR SCAN] X-Requested-With: ${req.get('x-requested-with') || 'NONE'}`);
  console.log(`[QR SCAN] Referer: ${req.get('referer') || 'NONE'}`);
  console.log(`[QR SCAN] All Headers:`, JSON.stringify(req.headers, null, 2));
  console.log('========================================');
  
  // Check for app type in query params (fallback for apps that don't send headers)
  const appParam = req.query.app; // ?app=gpay, ?app=phonepe, etc.
  
  // Get coordinates from query params (if available)
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const coords = (!isNaN(lat) && !isNaN(lng)) ? { lat, lng } : null;

  try {
    // Get all merchants for this code
    const codeMerchants = getMerchantsByCode(code);
    
    if (codeMerchants.length === 0) {
      return res.status(404).render('error', { 
        message: `No merchants found for code: ${code}` 
      });
    }

    // DETECT APP - MULTIPLE METHODS
    let appType = detectApp(req.get('user-agent') || '', req.get('x-requested-with') || '');
    
    // Method 1: Check X-Requested-With header (most reliable if present)
    if (xRequestedWith.includes('com.google.android.apps.nbu.paisa.user')) {
      appType = AppType.GOOGLE_PAY;
      console.log(`[DETECTION] Method: X-Requested-With -> Google Pay`);
    } else if (xRequestedWith.includes('com.phonepe.app')) {
      appType = AppType.PHONEPE;
      console.log(`[DETECTION] Method: X-Requested-With -> PhonePe`);
    } else if (xRequestedWith.includes('net.one97.paytm')) {
      appType = AppType.PAYTM;
      console.log(`[DETECTION] Method: X-Requested-With -> Paytm`);
    }
    
    // Method 2: Check User-Agent patterns
    if (appType === AppType.BROWSER) {
      if (userAgent.includes('paisa') || userAgent.includes('gpay') || userAgent.includes('google pay') || userAgent.includes('tez')) {
        appType = AppType.GOOGLE_PAY;
        console.log(`[DETECTION] Method: User-Agent -> Google Pay`);
      } else if (userAgent.includes('phonepe') || userAgent.includes('phone-pe')) {
        appType = AppType.PHONEPE;
        console.log(`[DETECTION] Method: User-Agent -> PhonePe`);
      } else if (userAgent.includes('paytm')) {
        appType = AppType.PAYTM;
        console.log(`[DETECTION] Method: User-Agent -> Paytm`);
      }
    }
    
    // Method 3: Check Referer
    if (appType === AppType.BROWSER && referer) {
      if (referer.includes('phonepe') || referer.includes('phone-pe')) {
        appType = AppType.PHONEPE;
        console.log(`[DETECTION] Method: Referer -> PhonePe`);
      } else if (referer.includes('gpay') || referer.includes('google pay') || referer.includes('paisa')) {
        appType = AppType.GOOGLE_PAY;
        console.log(`[DETECTION] Method: Referer -> Google Pay`);
      } else if (referer.includes('paytm')) {
        appType = AppType.PAYTM;
        console.log(`[DETECTION] Method: Referer -> Paytm`);
      }
    }
    
    // Method 4: Query parameter override (for testing/fallback)
    if (appParam) {
      const appMap = {
        'gpay': AppType.GOOGLE_PAY,
        'phonepe': AppType.PHONEPE,
        'paytm': AppType.PAYTM,
        'lens': AppType.GOOGLE_LENS
      };
      if (appMap[appParam.toLowerCase()]) {
        appType = appMap[appParam.toLowerCase()];
        console.log(`[DETECTION] Method: Query Param -> ${appType}`);
      }
    }
    
    // FINAL DETECTION LOG
    console.log(`[DETECTION RESULT] Code: ${code}, App: ${appType}`);

    // IF PAYMENT APP DETECTED - RETURN UPI INTENT DIRECTLY (no redirect, no HTML)
    if (appType === AppType.GOOGLE_PAY || appType === AppType.PHONEPE || appType === AppType.PAYTM) {
      // Use first merchant for immediate response (fastest)
      const merchant = codeMerchants[0];
      
      let upiIntent = null;
      if (appType === AppType.GOOGLE_PAY && merchant.upi?.gpay_intent) {
        upiIntent = merchant.upi.gpay_intent;
      } else if (appType === AppType.PHONEPE && merchant.upi?.phonepe_intent) {
        upiIntent = merchant.upi.phonepe_intent;
      } else if (appType === AppType.PAYTM && merchant.upi?.paytm_intent) {
        upiIntent = merchant.upi.paytm_intent;
      }
      
      if (upiIntent) {
        console.log(`[UPI INTENT] ${appType} -> ${upiIntent}`);
        // Try direct redirect first (307 for payment apps)
        // If that doesn't work, payment apps might handle it better than browser redirect
        res.writeHead(307, {
          'Location': upiIntent,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        return res.end();
      }
    }
    
    // Resolve merchant (only for non-payment apps or if payment app redirect failed)
    const merchant = await resolveMerchant(codeMerchants, coords, ip);
    console.log(`[RESOLUTION] Selected merchant: ${merchant.name} (${merchant.id})`);

    // Handle other app types
    switch (appType) {
      case AppType.GOOGLE_LENS:
        if (merchant.google_place_id) {
          const reviewUrl = `https://search.google.com/local/writereview?placeid=${merchant.google_place_id}`;
          return res.redirect(302, reviewUrl);
        }
        break;
      
      case AppType.CAMERA:
      case AppType.BROWSER:
      default:
        // Only render landing page if NOT a payment app
        return res.render('landing', { 
          code,
          merchant: null, // Will be resolved via geolocation
          merchants: codeMerchants
        });
    }

    // If we get here, the app was detected but merchant doesn't have that action
    // Show chooser page
    return res.render('chooser', { 
      code,
      merchant,
      appType 
    });

  } catch (error) {
    console.error('[ERROR]', error);
    return res.status(500).render('error', { 
      message: 'Internal server error',
      error: error.message 
    });
  }
});

// Endpoint for POST geolocation from landing page
app.post('/choose', async (req, res) => {
  const { code, lat, lng } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  try {
    const codeMerchants = getMerchantsByCode(code);
    
    if (codeMerchants.length === 0) {
      return res.status(404).json({ error: 'No merchants found for code' });
    }

    const coords = (!isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) 
      ? { lat: parseFloat(lat), lng: parseFloat(lng) } 
      : null;

    const merchant = await resolveMerchant(codeMerchants, coords, ip);
    
    console.log(`[CHOOSE] Code: ${code}, Coords: ${coords ? `${coords.lat},${coords.lng}` : 'IP'}, Merchant: ${merchant.name}`);

    res.json({
      success: true,
      merchant: {
        id: merchant.id,
        name: merchant.name,
        wifi: merchant.wifi,
        google_place_id: merchant.google_place_id,
        menu_url: merchant.menu_url,
        coupon_url: merchant.coupon_url,
        upi: merchant.upi
      }
    });
  } catch (error) {
    console.error('[CHOOSE ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug endpoint to see all headers
app.get('/debug', (req, res) => {
  res.json({
    headers: req.headers,
    userAgent: req.get('user-agent'),
    xRequestedWith: req.get('x-requested-with'),
    referer: req.get('referer'),
    detectedApp: detectApp(req.get('user-agent') || '', req.get('x-requested-with') || ''),
    query: req.query
  });
});

app.listen(PORT, () => {
  const deploymentUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://oneqrcode.vercel.app';
  console.log(`🚀 QR Multiplex Demo server running on port ${PORT}`);
  console.log(`📱 Main endpoint: ${deploymentUrl}/p/SHARED1`);
  console.log(`⚙️  Admin UI: ${deploymentUrl}/admin`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🔧 Local access: http://localhost:${PORT}`);
  }
});

