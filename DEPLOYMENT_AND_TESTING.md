# Deployment and Testing Guide

## 🎯 Current Status

**Your QR code is here:** `public/qr/SHARED1.png`

**BUT** - It currently points to `localhost:4000`, which only works on your computer.

## 📍 Where is the QR Code?

The **SINGLE QR code** is located at:
```
/Users/nandagiriaditya/Documents/QR/public/qr/SHARED1.png
```

This is the QR code that routes to all 5 merchants and detects which app scanned it.

## 🚀 Two Ways to Test

### Option 1: Quick Testing with ngrok (No Deployment Needed)

**Perfect for investor demo!**

1. **Start your server:**
   ```bash
   npm start
   ```

2. **Start ngrok (in another terminal):**
   ```bash
   ./ngrok http 4000
   ```

3. **Copy the HTTPS URL** (e.g., `https://abc123.ngrok.io`)

4. **Generate NEW QR code with ngrok URL:**
   ```bash
   BASE_URL=https://abc123.ngrok.io npm run generate-qr
   ```

5. **Open the new QR code:**
   ```bash
   open public/qr/SHARED1.png
   ```

6. **Scan from your phone:**
   - Open Google Pay → Scan QR → Google Pay opens with UPI prefilled! ✅
   - Open PhonePe → Scan QR → PhonePe opens with UPI prefilled! ✅
   - Open Paytm → Scan QR → Paytm opens with UPI prefilled! ✅
   - Open Google Lens → Scan QR → Opens Google Review! ✅
   - Open Camera → Scan QR → Shows landing page with Wi-Fi! ✅

### Option 2: Deploy to Production

**For permanent/public access:**

1. **Deploy to a hosting service:**
   - Heroku
   - Railway
   - Render
   - DigitalOcean
   - AWS
   - Any Node.js hosting

2. **Get your deployment URL** (e.g., `https://qr-multiplex.herokuapp.com`)

3. **Generate QR code with deployment URL:**
   ```bash
   BASE_URL=https://qr-multiplex.herokuapp.com npm run generate-qr
   ```

4. **The QR code will now work from anywhere!**

## 📱 Testing with Real Apps

### What You Can Test:

1. **Google Pay:**
   - Open Google Pay app
   - Tap "Scan QR"
   - Scan your QR code
   - ✅ Google Pay opens with `nad.nandagiri-3@okicici` prefilled
   - ✅ Amount shows ₹0 (safe for demo)

2. **PhonePe:**
   - Open PhonePe app
   - Tap "Scan QR"
   - Scan your QR code
   - ✅ PhonePe opens with UPI prefilled

3. **Paytm:**
   - Open Paytm app
   - Tap "Scan QR"
   - Scan your QR code
   - ✅ Paytm opens with UPI prefilled

4. **Google Lens:**
   - Open Google Lens
   - Point at QR code
   - Tap the detected link
   - ✅ Opens Google Review page

5. **Camera (iPhone/Android):**
   - Open phone camera
   - Scan QR code
   - ✅ Opens landing page
   - ✅ Shows Wi-Fi credentials
   - ✅ Shows review, menu, coupon links

## 🎯 The SINGLE QR Code

**Location:** `public/qr/SHARED1.png`

**What it does:**
- ✅ One QR code for ALL scenarios
- ✅ Detects which app scanned it
- ✅ Routes to appropriate action:
  - Google Pay → UPI intent
  - PhonePe → UPI intent
  - Paytm → UPI intent
  - Google Lens → Review page
  - Camera → Landing page

**All 5 merchants** share this same QR code!

## 🔧 Quick Setup for Testing

```bash
# Terminal 1: Start server
npm start

# Terminal 2: Start ngrok
./ngrok http 4000

# Terminal 2: Copy the HTTPS URL, then:
BASE_URL=https://your-ngrok-url.ngrok.io npm run generate-qr

# Open QR code
open public/qr/SHARED1.png

# Scan from phone - it works! 🎉
```

## 📋 Testing Checklist

- [ ] Server running (`npm start`)
- [ ] ngrok running (`./ngrok http 4000`)
- [ ] QR code generated with ngrok URL
- [ ] QR code opened/displayed
- [ ] Tested Google Pay scan
- [ ] Tested PhonePe scan
- [ ] Tested Paytm scan
- [ ] Tested Google Lens scan
- [ ] Tested Camera scan

## 🎬 For Investor Demo

1. **Start ngrok** (get public URL)
2. **Generate QR** with ngrok URL
3. **Display QR** on screen or print
4. **Scan with different apps** to show automatic routing

---

**The QR code is ready - just need to generate it with a public URL (ngrok or deployment)!**

