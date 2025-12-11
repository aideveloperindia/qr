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
  const { code } = req.params;
  const userAgent = req.get('user-agent') || '';
  const xRequestedWith = req.get('x-requested-with') || '';
  const ip = req.ip || req.connection.remoteAddress;
  
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

    // Detect which app opened the URL
    const appType = detectApp(userAgent, xRequestedWith);
    
    console.log(`[DETECTION] Code: ${code}, App: ${appType}, Coords: ${coords ? `${coords.lat},${coords.lng}` : 'none'}`);

    // Resolve merchant (nearest if multiple, or first if single)
    const merchant = await resolveMerchant(codeMerchants, coords, ip);
    
    console.log(`[RESOLUTION] Selected merchant: ${merchant.name} (${merchant.id})`);

    // Route based on app type - Always use real payment apps (no simulator)
    switch (appType) {
      case AppType.GOOGLE_PAY:
        if (merchant.upi?.gpay_intent) {
          return res.redirect(302, merchant.upi.gpay_intent);
        }
        break;
      
      case AppType.PHONEPE:
        if (merchant.upi?.phonepe_intent) {
          return res.redirect(302, merchant.upi.phonepe_intent);
        }
        break;
      
      case AppType.PAYTM:
        if (merchant.upi?.paytm_intent) {
          return res.redirect(302, merchant.upi.paytm_intent);
        }
        break;
      
      case AppType.GOOGLE_LENS:
        if (merchant.google_place_id) {
          const reviewUrl = `https://search.google.com/local/writereview?placeid=${merchant.google_place_id}`;
          return res.redirect(302, reviewUrl);
        }
        break;
      
      case AppType.CAMERA:
      case AppType.BROWSER:
      default:
        // Render landing page
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

app.listen(PORT, () => {
  const deploymentUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://oneqrcode.vercel.app';
  console.log(`🚀 QR Multiplex Demo server running on port ${PORT}`);
  console.log(`📱 Main endpoint: ${deploymentUrl}/p/SHARED1`);
  console.log(`⚙️  Admin UI: ${deploymentUrl}/admin`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🔧 Local access: http://localhost:${PORT}`);
  }
});

