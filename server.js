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

    // ALWAYS SHOW REDIRECT PAGE FOR MOBILE BROWSERS (payment apps open in browser)
    // If it's a mobile browser, assume it might be from a payment app
    const isMobileBrowser = /Mobile|Android|iPhone|iPad|webview|wv/.test(userAgent.toLowerCase());
    
    console.log(`[MOBILE CHECK] isMobileBrowser: ${isMobileBrowser}, userAgent: ${userAgent.substring(0, 100)}`);
    
    // IF PAYMENT APP DETECTED OR MOBILE BROWSER - RETURN UPI INTENT DIRECTLY
    // CRITICAL: Mobile browsers should ALWAYS get redirect page, not landing page
    if (appType === AppType.GOOGLE_PAY || appType === AppType.PHONEPE || appType === AppType.PAYTM || 
        (isMobileBrowser && codeMerchants.length > 0)) {
      // Use first merchant for immediate response (fastest)
      const merchant = codeMerchants[0];
      
      let upiIntent = null;
      if (appType === AppType.GOOGLE_PAY && merchant.upi?.gpay_intent) {
        upiIntent = merchant.upi.gpay_intent;
      } else if (appType === AppType.PHONEPE && merchant.upi?.phonepe_intent) {
        upiIntent = merchant.upi.phonepe_intent;
      } else if (appType === AppType.PAYTM && merchant.upi?.paytm_intent) {
        upiIntent = merchant.upi.paytm_intent;
      } else if (isMobileBrowser) {
        // Mobile browser but detection failed - try PhonePe first (most common in India)
        // Then try others
        if (merchant.upi?.phonepe_intent) {
          upiIntent = merchant.upi.phonepe_intent;
        } else if (merchant.upi?.gpay_intent) {
          upiIntent = merchant.upi.gpay_intent;
        } else if (merchant.upi?.paytm_intent) {
          upiIntent = merchant.upi.paytm_intent;
        }
      }
      
      // CRITICAL: If mobile browser, ALWAYS show redirect page (even if upiIntent is null, use first available)
      if (isMobileBrowser && !upiIntent && merchant.upi) {
        // Force PhonePe intent for mobile browsers (most common in India)
        if (merchant.upi.phonepe_intent) {
          upiIntent = merchant.upi.phonepe_intent;
        } else if (merchant.upi.gpay_intent) {
          upiIntent = merchant.upi.gpay_intent;
        } else if (merchant.upi.paytm_intent) {
          upiIntent = merchant.upi.paytm_intent;
        }
        console.log(`[MOBILE FALLBACK] Using ${upiIntent ? 'PhonePe' : 'first available'} intent for mobile browser`);
      }
      
      if (upiIntent) {
        console.log(`[UPI INTENT] ${appType} -> ${upiIntent}`);
        // Return minimal HTML with clickable link that definitely works
        // PhonePe/Google Pay browsers often block JavaScript redirects, so use direct link
        // CRITICAL: PhonePe shows warning, then opens URL in browser
        // We need to redirect IMMEDIATELY when page loads
        // Use meta refresh + JavaScript + direct link - all methods at once
        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Opening Payment...</title>
<!-- Meta refresh as backup -->
<meta http-equiv="refresh" content="0;url=${upiIntent}">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body { 
  margin:0; padding:0; 
  width:100%; height:100%;
  overflow:hidden;
  background:#000;
}
body { 
  font-family:Arial, sans-serif; 
  display:flex;
  align-items:center;
  justify-content:center;
  position:fixed;
  top:0; left:0; right:0; bottom:0;
}
.container {
  background:white;
  padding:25px 20px;
  border-radius:12px;
  max-width:320px;
  width:90%;
  text-align:center;
}
h1 { color:#333; margin-bottom:12px; font-size:20px; }
p { color:#666; margin-bottom:20px; font-size:14px; }
.btn { 
  display:block; 
  width:100%;
  padding:18px; 
  background:#007bff; 
  color:white; 
  text-decoration:none; 
  border-radius:8px; 
  font-size:18px; 
  font-weight:bold;
  box-shadow:0 4px 12px rgba(0,123,255,0.4);
}
</style>
</head>
<body>
<div class="container">
  <h1>Opening Payment...</h1>
  <p>Please wait...</p>
  <a href="${upiIntent}" id="openBtn" class="btn" style="display:none;">Open Payment</a>
</div>
<script>
(function() {
  const upiIntent = "${upiIntent}";
  console.log('[REDIRECT] Target:', upiIntent);
  
  // IMMEDIATE redirect - try ALL methods
  function redirect() {
    try {
      window.location.replace(upiIntent);
      window.location.href = upiIntent;
      window.location = upiIntent;
      document.location = upiIntent;
      document.location.href = upiIntent;
    } catch(e) {
      console.log('[REDIRECT] Error:', e);
    }
  }
  
  // Redirect immediately
  redirect();
  
  // Also try on every possible event
  setTimeout(redirect, 0);
  setTimeout(redirect, 10);
  setTimeout(redirect, 50);
  setTimeout(redirect, 100);
  setTimeout(redirect, 200);
  setTimeout(redirect, 500);
  
  // Show button as fallback
  const btn = document.getElementById('openBtn');
  if (btn) {
    setTimeout(function() {
      btn.style.display = 'block';
      // Auto-click button
      setTimeout(function() { btn.click(); }, 100);
      setTimeout(function() { btn.click(); }, 300);
      setTimeout(function() { btn.click(); }, 600);
    }, 300);
  }
  
  // When page becomes visible (user returned from warning)
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
      redirect();
      if (btn) {
        setTimeout(function() { btn.click(); }, 50);
      }
    }
  });
  
  // On focus
  window.addEventListener('focus', redirect);
  window.addEventListener('pageshow', redirect);
  
  // Also try on load
  window.addEventListener('load', function() {
    redirect();
    if (btn) {
      setTimeout(function() { btn.click(); }, 100);
    }
  });
})();
</script>
</body>
</html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.send(html);
      }
    }
    
    // IF NOT DETECTED AS PAYMENT APP - Check if mobile browser first
    // CRITICAL: Mobile browsers should NEVER see landing page (they should get redirect page)
    const isMobileBrowser = /Mobile|Android|iPhone|iPad|webview|wv/.test(userAgent.toLowerCase());
    
    if (isMobileBrowser && codeMerchants.length > 0) {
      // Mobile browser but didn't get redirect page - force it now
      const merchant = codeMerchants[0];
      let upiIntent = null;
      if (merchant.upi?.phonepe_intent) {
        upiIntent = merchant.upi.phonepe_intent;
      } else if (merchant.upi?.gpay_intent) {
        upiIntent = merchant.upi.gpay_intent;
      } else if (merchant.upi?.paytm_intent) {
        upiIntent = merchant.upi.paytm_intent;
      }
      
      if (upiIntent) {
        console.log(`[MOBILE FALLBACK] Mobile browser detected, forcing redirect to: ${upiIntent}`);
        // Return redirect page
        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Opening Payment...</title>
<meta http-equiv="refresh" content="0;url=${upiIntent}">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:#000; }
body { font-family:Arial, sans-serif; display:flex; align-items:center; justify-content:center; position:fixed; top:0; left:0; right:0; bottom:0; }
.container { background:white; padding:25px 20px; border-radius:12px; max-width:320px; width:90%; text-align:center; }
h1 { color:#333; margin-bottom:12px; font-size:20px; }
p { color:#666; margin-bottom:20px; font-size:14px; }
.btn { display:block; width:100%; padding:18px; background:#007bff; color:white; text-decoration:none; border-radius:8px; font-size:18px; font-weight:bold; box-shadow:0 4px 12px rgba(0,123,255,0.4); }
</style>
</head>
<body>
<div class="container">
  <h1>Opening Payment...</h1>
  <p>Please wait...</p>
  <a href="${upiIntent}" id="openBtn" class="btn" style="display:none;">Open Payment</a>
</div>
<script>
(function() {
  const upiIntent = "${upiIntent}";
  function redirect() {
    try {
      window.location.replace(upiIntent);
      window.location.href = upiIntent;
      window.location = upiIntent;
    } catch(e) {}
  }
  redirect();
  setTimeout(redirect, 0);
  setTimeout(redirect, 50);
  setTimeout(redirect, 100);
  setTimeout(redirect, 200);
  const btn = document.getElementById('openBtn');
  if (btn) {
    setTimeout(function() { btn.style.display = 'block'; btn.click(); }, 300);
  }
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) { redirect(); if (btn) btn.click(); }
  });
  window.addEventListener('focus', redirect);
  window.addEventListener('load', redirect);
})();
</script>
</body>
</html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.send(html);
      }
    }
    
    // IF NOT MOBILE BROWSER - Show landing page with auto-redirect
    // This handles cases where payment apps open URL in browser but don't send headers
    
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
        // For browser/unknown - render landing page
        // Landing page has client-side detection that will try to redirect
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

