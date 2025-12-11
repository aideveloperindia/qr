# QR Multiplex Demo

A production-feel demo web application that proves a single QR short URL can route to different client-specific actions depending on which app or scanner opened it (Google Pay, PhonePe, Paytm, Google Lens, Camera/browser).

## 🎯 Overview

This demo showcases how a single printed/digital QR code can intelligently route users to different actions based on:
- **App Detection**: Which app scanned the QR (Google Pay, PhonePe, Paytm, Google Lens, or Camera/Browser)
- **Geolocation**: Nearest merchant resolution when multiple merchants share the same QR code
- **Context-Aware Routing**: Payment apps → UPI intents, Google Lens → Reviews, Camera → Landing page with Wi-Fi/details

## 🚀 Quick Start

### Prerequisites

- Node.js 14+ and npm
- ngrok (for mobile testing)

### Installation

```bash
# Install dependencies
npm install

# Start the server
npm start
```

The server will run on the specified port (default: 4000 for local development).

**Deployment URL:** https://oneqrcode.vercel.app

### Generate QR Code

```bash
# Generate QR with deployment URL (default)
npm run generate-qr

# Or specify custom URL
BASE_URL=https://your-custom-url.com npm run generate-qr
```

The QR code PNG will be saved to `public/qr/SHARED1.png` and points to the deployment URL by default.

**Note:** The QR code is configured to use the deployment URL (https://oneqrcode.vercel.app) so it works from any device.

## 📱 Testing with ngrok

### Setup ngrok

1. Install ngrok: https://ngrok.com/download
2. Start your server: `npm start`
3. In a new terminal, start ngrok:
   ```bash
   ngrok http 4000
   ```
4. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)
5. Generate QR code with ngrok URL:
   ```bash
   BASE_URL=https://abc123.ngrok.io npm run generate-qr
   ```

### Test on Mobile

1. Open the generated QR code image (`public/qr/SHARED1.png`) on your computer
2. Scan with different apps:
   - **Google Pay**: Should open Google Pay with merchant UPI prefilled
   - **PhonePe**: Should open PhonePe with merchant UPI prefilled
   - **Paytm**: Should open Paytm with merchant UPI prefilled
   - **Google Lens**: Should redirect to Google Review page
   - **Camera**: Should show landing page with Wi-Fi credentials and options

## 🧪 Testing with curl

### Simulate Google Pay

```bash
curl -v -H "User-Agent: GPay/1.0" \
     -H "X-Requested-With: com.google.android.apps.nbu.paisa.user" \
     http://localhost:4000/p/SHARED1
```

Expected: `302 Redirect` to Google Pay UPI intent.

### Simulate PhonePe

```bash
curl -v -H "User-Agent: PhonePe/1.0" \
     -H "X-Requested-With: com.phonepe.app" \
     http://localhost:4000/p/SHARED1
```

Expected: `302 Redirect` to PhonePe UPI intent.

### Simulate Paytm

```bash
curl -v -H "User-Agent: Paytm/1.0" \
     -H "X-Requested-With: net.one97.paytm" \
     http://localhost:4000/p/SHARED1
```

Expected: `302 Redirect` to Paytm UPI intent.

### Simulate Google Lens

```bash
curl -v -H "User-Agent: Mozilla/5.0 (compatible; GoogleLens/1.0)" \
     http://localhost:4000/p/SHARED1
```

Expected: `302 Redirect` to Google Review page.

### Simulate Camera/Browser

```bash
curl -v -H "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)" \
     http://localhost:4000/p/SHARED1
```

Expected: `200 OK` with HTML landing page.

### Test with Geolocation

```bash
curl -v "http://localhost:4000/p/SHARED1?lat=12.9716&lng=77.5946"
```

This will help resolve the nearest merchant based on coordinates.

## 📊 Demo Merchants

The demo includes 5 pre-configured merchants, all accessible via `/p/SHARED1`:

1. **Merchant A - Coffee Shop**: Payment primary (all UPI intents)
2. **Merchant B - Retail Store**: Google Review primary
3. **Merchant C - Hotel Room**: Wi-Fi primary
4. **Merchant D - Restaurant**: Menu/Ordering primary
5. **Merchant E - Events & Loyalty**: Coupon/Check-in primary

All merchants are located in Bangalore, India (coordinates around 12.97°N, 77.59°E) for demo purposes.

## ⚙️ Admin Panel

Access the admin panel at: `http://localhost:4000/admin`

Features:
- View all merchants
- Edit merchant details (name, location, UPI intents, Wi-Fi, URLs)
- Save changes (updates `data/merchants.json`)

## 🏗️ Architecture

### Core Components

- **`server.js`**: Main Express server with routing
- **`lib/appDetector.js`**: Detects which app opened the QR based on headers
- **`lib/merchantResolver.js`**: Resolves nearest merchant using geolocation/Haversine
- **`data/merchants.json`**: Merchant data storage (JSON for demo simplicity)

### Request Flow

1. QR code scanned → Request to `/p/SHARED1`
2. Server detects app type (User-Agent + X-Requested-With)
3. Server resolves merchant (geolocation or IP fallback)
4. Server routes based on app type:
   - Payment apps → UPI intent redirect
   - Google Lens → Google Review redirect
   - Camera/Browser → Landing page
5. Landing page requests browser geolocation → POSTs to `/choose` → Displays merchant info

### App Detection Rules

The system detects apps using:

- **X-Requested-With header** (most reliable):
  - Google Pay: `com.google.android.apps.nbu.paisa.user`
  - PhonePe: `com.phonepe.app`
  - Paytm: `net.one97.paytm`

- **User-Agent patterns** (fallback):
  - Google Lens: Contains "GoogleLens" or "Lens"
  - Camera: Contains "Camera"

- **Default**: Browser (renders landing page)

## 📝 API Endpoints

### `GET /p/:code`

Main QR endpoint. Detects app and routes accordingly.

**Query Parameters:**
- `lat` (optional): Latitude for geolocation
- `lng` (optional): Longitude for geolocation

**Response:**
- Payment apps: `302 Redirect` to UPI intent
- Google Lens: `302 Redirect` to Google Review
- Browser: `200 OK` with landing page HTML

### `POST /choose`

Resolves merchant based on geolocation.

**Request Body:**
```json
{
  "code": "SHARED1",
  "lat": 12.9716,
  "lng": 77.5946
}
```

**Response:**
```json
{
  "success": true,
  "merchant": {
    "id": "merchant_a",
    "name": "Merchant A - Coffee Shop",
    "wifi": { "ssid": "...", "password": "..." },
    "google_place_id": "...",
    "menu_url": "...",
    "coupon_url": "...",
    "upi": { "gpay_intent": "...", "phonepe_intent": "...", "paytm_intent": "..." }
  }
}
```

### `GET /admin`

Admin panel UI for managing merchants.

### `POST /admin/merchants`

Update merchant data.

**Request Body:**
```json
{
  "merchants": [/* array of merchant objects */]
}
```

### `GET /health`

Health check endpoint.

## 🎬 Investor Demo Script

### Step 1: Setup
1. Start server: `npm start`
2. Start ngrok: `ngrok http 4000`
3. Generate QR: `BASE_URL=https://your-ngrok.ngrok.io npm run generate-qr`
4. Display QR code image on screen

### Step 2: Demo Scenarios

**Scenario A: Google Pay**
- "Watch as I scan this QR with Google Pay..."
- Scan QR with Google Pay app
- Google Pay opens with merchant UPI prefilled (amount = 0, demo mode)
- "Notice how it automatically detected Google Pay and routed to the payment intent"

**Scenario B: PhonePe**
- "Now let's try PhonePe..."
- Scan same QR with PhonePe
- PhonePe opens with merchant UPI prefilled
- "Same QR, different app, different routing"

**Scenario C: Google Lens**
- "With Google Lens, it routes to reviews..."
- Scan QR with Google Lens
- Browser opens Google Review page for the merchant
- "Perfect for collecting customer feedback"

**Scenario D: Camera/Browser**
- "When scanned with a regular camera..."
- Scan QR with phone camera (opens in browser)
- Landing page loads, requests location permission
- After permission, shows Wi-Fi credentials, review link, menu, coupon, and demo payment buttons
- "This is the full experience - Wi-Fi, reviews, menu, coupons, and payment options"

**Scenario E: Multiple Merchants**
- "The same QR code works for multiple merchants..."
- Explain geolocation-based merchant resolution
- Show how different locations get different merchants
- "One QR, infinite merchants, intelligent routing"

### Key Talking Points

1. **Single QR Code**: One physical QR code for all scenarios
2. **App Detection**: Automatic detection of scanning app
3. **Geolocation Intelligence**: Nearest merchant resolution
4. **Context-Aware**: Different actions for different apps
5. **Non-Transactional**: All UPI intents use `am=0` (demo mode)
6. **Production-Ready**: Logging, error handling, admin panel

## ✅ QA Checklist

- [ ] `npm start` runs successfully
- [ ] `/p/SHARED1` loads in browser
- [ ] Curl simulation: Google Pay header → 302 to UPI intent
- [ ] Curl simulation: PhonePe header → 302 to UPI intent
- [ ] Curl simulation: Paytm header → 302 to UPI intent
- [ ] Curl simulation: Google Lens UA → 302 to Google Review
- [ ] Phone camera scan → Landing page with geolocation request
- [ ] Landing page shows Wi-Fi for nearest merchant after geolocation
- [ ] Admin UI loads at `/admin`
- [ ] Admin UI allows editing merchant data
- [ ] ngrok tested: Mobile scans work correctly
- [ ] QR code generated successfully
- [ ] QR code scans correctly on mobile devices

## 🔒 Demo Safety

- All UPI intents use `am=0` (amount = 0) for non-transactional demo
- No real payments are processed
- All merchant data is placeholder/demo data
- Logging captures UA, headers, IP, and chosen merchant for analytics only

## 📁 Project Structure

```
QR/
├── server.js              # Main Express server
├── package.json           # Dependencies
├── data/
│   └── merchants.json    # Merchant data (5 demo merchants)
├── lib/
│   ├── appDetector.js    # App detection logic
│   └── merchantResolver.js # Merchant resolution with geolocation
├── views/
│   ├── landing.ejs       # Landing page for camera/browser
│   ├── chooser.ejs       # Action chooser (fallback)
│   ├── admin.ejs         # Admin panel UI
│   └── error.ejs         # Error page
├── scripts/
│   └── generateQR.js     # QR code generation script
├── public/
│   └── qr/               # Generated QR code images
└── README.md             # This file
```

## 🛠️ Development

### Environment Variables

- `PORT`: Server port (default: 4000)
- `BASE_URL`: Base URL for QR generation (default: http://localhost:4000)

### Adding New Merchants

Edit `data/merchants.json` or use the admin panel at `/admin`.

### Extending App Detection

Edit `lib/appDetector.js` to add new detection rules.

## 📄 License

MIT

## 🙏 Support

For issues or questions, check the logs in the terminal where the server is running. All requests are logged with full details for debugging.

---

**Built for investor demo purposes. All UPI intents are non-transactional (am=0).**



