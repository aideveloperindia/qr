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

// Menu route
app.get('/menu', async (req, res) => {
  try {
    const code = req.query.code || 'SHARED1';
    const merchantId = req.query.merchant;
    
    let merchant = null;
    if (merchantId) {
      const merchants = getMerchantsByCode(code);
      merchant = merchants.find(m => m.id === merchantId);
    }
    
    res.render('menu', { 
      merchant: merchant || null
    });
  } catch (error) {
    console.error('[ERROR] Menu route:', error);
    res.status(500).render('error', {
      message: 'Error loading menu',
      error: error.message
    });
  }
});

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
    
    // Method 2: Check User-Agent patterns (check Google Lens FIRST)
    const uaLower = userAgent.toLowerCase();
    if (uaLower.includes('lens') || uaLower.includes('googlelens') || uaLower.includes('google-lens')) {
      appType = AppType.GOOGLE_LENS;
      console.log(`[DETECTION] Method: User-Agent -> Google Lens`);
    } else if (appType === AppType.BROWSER || appType === AppType.UNKNOWN) {
      if (uaLower.includes('paisa') || uaLower.includes('gpay') || uaLower.includes('google pay') || uaLower.includes('tez')) {
        appType = AppType.GOOGLE_PAY;
        console.log(`[DETECTION] Method: User-Agent -> Google Pay`);
      } else if (uaLower.includes('phonepe') || uaLower.includes('phone-pe')) {
        appType = AppType.PHONEPE;
        console.log(`[DETECTION] Method: User-Agent -> PhonePe`);
      } else if (uaLower.includes('paytm')) {
        appType = AppType.PAYTM;
        console.log(`[DETECTION] Method: User-Agent -> Paytm`);
      }
    }
    
    // Method 3: Check Referer (check BEFORE other detections override)
    if (referer) {
      const refLower = referer.toLowerCase();
      if (refLower.includes('lens') || refLower.includes('googlelens')) {
        appType = AppType.GOOGLE_LENS;
        console.log(`[DETECTION] Method: Referer -> Google Lens`);
      } else if (refLower.includes('phonepe') || refLower.includes('phone-pe')) {
        appType = AppType.PHONEPE;
        console.log(`[DETECTION] Method: Referer -> PhonePe`);
      } else if (refLower.includes('gpay') || refLower.includes('google pay') || refLower.includes('paisa')) {
        appType = AppType.GOOGLE_PAY;
        console.log(`[DETECTION] Method: Referer -> Google Pay`);
      } else if (refLower.includes('paytm')) {
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

    // CRITICAL: Handle specific app types FIRST (before mobile browser check)
    // These apps should be handled BEFORE checking if it's a mobile browser
    
    // 1. Google Lens → Google Review (must check BEFORE mobile browser)
    if (appType === AppType.GOOGLE_LENS && codeMerchants.length > 0) {
      const merchant = await resolveMerchant(codeMerchants, coords, ip);
      if (merchant.google_place_id) {
        const reviewUrl = `https://search.google.com/local/writereview?placeid=${merchant.google_place_id}`;
        console.log(`[REDIRECT] Google Lens -> Google Review: ${reviewUrl}`);
        return res.redirect(302, reviewUrl);
      }
    }
    
    // 2. Camera → Landing page (shows menu, WiFi, etc.)
    if (appType === AppType.CAMERA && codeMerchants.length > 0) {
      const merchant = await resolveMerchant(codeMerchants, coords, ip);
      console.log(`[REDIRECT] Camera -> Landing page (menu, WiFi)`);
      return res.render('landing', {
        code,
        merchant: merchant,
        merchants: codeMerchants
      });
    }
    
    // 3. Check if mobile browser (for payment apps)
    // CRITICAL: Payment apps open URLs in mobile browsers, so we MUST check this
    // Note: isMobileBrowser will be checked again below, but we log it here for debugging
    const isMobileBrowser = /Mobile|Android|iPhone|iPad|webview|wv/i.test(userAgent);
    
    console.log(`[MOBILE CHECK] isMobileBrowser: ${isMobileBrowser}, userAgent: ${userAgent.substring(0, 150)}`);
    console.log(`[MOBILE CHECK] AppType: ${appType}, Is Payment App: ${appType === AppType.GOOGLE_PAY || appType === AppType.PHONEPE || appType === AppType.PAYTM}`);
    
    // CRITICAL: Only handle payment apps here - NOT Google Lens, NOT Camera, NOT WiFi Scanner
    // Payment apps: GPay, PhonePe, Paytm
    const isPaymentApp = appType === AppType.GOOGLE_PAY || appType === AppType.PHONEPE || appType === AppType.PAYTM;
    
    // CRITICAL: If mobile browser, ALWAYS try to show redirect page (even if detection failed)
    // Payment apps open URLs in mobile browsers, so mobile browsers should get redirect page
    // ONLY skip if it's explicitly Camera or Google Lens (already handled above)
    // Mobile browsers should NEVER see landing page (which requests location)
    const shouldShowRedirect = isPaymentApp || (isMobileBrowser && appType !== AppType.CAMERA && appType !== AppType.GOOGLE_LENS);
    
    console.log(`[REDIRECT CHECK] shouldShowRedirect: ${shouldShowRedirect}, isPaymentApp: ${isPaymentApp}, isMobileBrowser: ${isMobileBrowser}, appType: ${appType}`);
    
    if (shouldShowRedirect && codeMerchants.length > 0) {
      const merchant = codeMerchants[0];
      let upiIntent = null;
      
      // CRITICAL: Use the CORRECT payment app based on detection
      // DO NOT default to PhonePe - use the detected app
      if (appType === AppType.GOOGLE_PAY && merchant.upi?.gpay_intent) {
        upiIntent = merchant.upi.gpay_intent;
        console.log(`[UPI SELECT] Using Google Pay intent (detected)`);
      } else if (appType === AppType.PHONEPE && merchant.upi?.phonepe_intent) {
        upiIntent = merchant.upi.phonepe_intent;
        console.log(`[UPI SELECT] Using PhonePe intent (detected)`);
      } else if (appType === AppType.PAYTM && merchant.upi?.paytm_intent) {
        upiIntent = merchant.upi.paytm_intent;
        console.log(`[UPI SELECT] Using Paytm intent (detected)`);
      }
      
      // If detection failed but we know it's a payment app, check Referer/User-Agent
      if (!upiIntent && referer) {
        const refLower = referer.toLowerCase();
        if ((refLower.includes('gpay') || refLower.includes('google pay') || refLower.includes('paisa')) && merchant.upi?.gpay_intent) {
          upiIntent = merchant.upi.gpay_intent;
          console.log(`[UPI SELECT] Using Google Pay intent (from Referer)`);
        } else if ((refLower.includes('phonepe') || refLower.includes('phone-pe')) && merchant.upi?.phonepe_intent) {
          upiIntent = merchant.upi.phonepe_intent;
          console.log(`[UPI SELECT] Using PhonePe intent (from Referer)`);
        } else if (refLower.includes('paytm') && merchant.upi?.paytm_intent) {
          upiIntent = merchant.upi.paytm_intent;
          console.log(`[UPI SELECT] Using Paytm intent (from Referer)`);
        }
      }
      
      if (!upiIntent && userAgent) {
        const uaLower = userAgent.toLowerCase();
        if ((uaLower.includes('paisa') || uaLower.includes('gpay') || uaLower.includes('google pay') || uaLower.includes('tez')) && merchant.upi?.gpay_intent) {
          upiIntent = merchant.upi.gpay_intent;
          console.log(`[UPI SELECT] Using Google Pay intent (from User-Agent)`);
        } else if ((uaLower.includes('phonepe') || uaLower.includes('phone-pe')) && merchant.upi?.phonepe_intent) {
          upiIntent = merchant.upi.phonepe_intent;
          console.log(`[UPI SELECT] Using PhonePe intent (from User-Agent)`);
        } else if (uaLower.includes('paytm') && merchant.upi?.paytm_intent) {
          upiIntent = merchant.upi.paytm_intent;
          console.log(`[UPI SELECT] Using Paytm intent (from User-Agent)`);
        }
      }
      
      // Return redirect page if we have UPI intent
      if (upiIntent) {
        console.log(`[UPI INTENT] ${appType} -> ${upiIntent}`);
        // Escape UPI intent for HTML/JavaScript
        const escapedUpiIntent = upiIntent.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const jsEscapedUpiIntent = upiIntent.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
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
<meta http-equiv="refresh" content="0;url=${escapedUpiIntent}">
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
  <a href="${escapedUpiIntent}" id="openBtn" class="btn" style="display:none;">Open Payment</a>
</div>
<script>
(function() {
  const upiIntent = "${jsEscapedUpiIntent}";
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
      } else {
        // Mobile browser but no UPI intent available - show error with debug info
        console.log(`[ERROR] Mobile browser detected but no UPI intent available`);
        console.log(`[DEBUG] AppType: ${appType}`);
        console.log(`[DEBUG] Merchant: ${merchant.name}`);
        console.log(`[DEBUG] Merchant UPI:`, JSON.stringify(merchant.upi, null, 2));
        console.log(`[DEBUG] User-Agent: ${userAgent.substring(0, 100)}`);
        console.log(`[DEBUG] Referer: ${referer || 'NONE'}`);
        
        // Try to use any available UPI intent as fallback
        if (merchant.upi) {
          if (merchant.upi.gpay_intent) {
            upiIntent = merchant.upi.gpay_intent;
            console.log(`[FALLBACK] Using GPay intent as fallback`);
          } else if (merchant.upi.phonepe_intent) {
            upiIntent = merchant.upi.phonepe_intent;
            console.log(`[FALLBACK] Using PhonePe intent as fallback`);
          } else if (merchant.upi.paytm_intent) {
            upiIntent = merchant.upi.paytm_intent;
            console.log(`[FALLBACK] Using Paytm intent as fallback`);
          }
        }
        
        if (!upiIntent) {
          return res.status(500).render('error', {
            message: 'Payment configuration error',
            error: 'No UPI intent configured for this merchant'
          });
        }
      }
    }
    
    // IF NOT MOBILE BROWSER OR PAYMENT APP - Show landing page
    // CRITICAL: Only desktop browsers/Camera scans reach here (NOT mobile browsers or payment apps)
    // This handles: Camera scans, desktop browser scans, WiFi scanner
    // WiFi scanner typically opens URL in browser, so it will show landing page with WiFi password
    console.log(`[REDIRECT] Desktop browser/Camera/WiFi Scanner -> Landing page (WiFi, menu, reviews)`);
    const merchant = await resolveMerchant(codeMerchants, coords, ip);
    console.log(`[RESOLUTION] Selected merchant: ${merchant.name} (${merchant.id})`);
    
    // Landing page shows: WiFi password, menu, reviews, coupons
    return res.render('landing', { 
      code,
      merchant: merchant,
      merchants: codeMerchants
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

