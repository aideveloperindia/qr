# Where is the SINGLE QR Code?

## 📍 Location

**The SINGLE QR code is here:**
```
/Users/nandagiriaditya/Documents/QR/public/qr/SHARED1.png
```

**I just opened it for you!** You should see it in your image viewer.

## ⚠️ Important: Current QR Code Points to Localhost

The current QR code (`SHARED1.png`) points to:
```
http://localhost:4000/p/SHARED1
```

**This only works on your computer!** For mobile testing, you need a public URL.

## 🚀 Quick Setup for Testing

### Step 1: Get ngrok URL

I've started ngrok for you. To get the URL:

1. **Open ngrok web interface:**
   ```bash
   open http://127.0.0.1:4040
   ```
   Or check the terminal where ngrok is running.

2. **Copy the HTTPS URL** (looks like: `https://abc123.ngrok.io`)

### Step 2: Generate QR with ngrok URL

```bash
BASE_URL=https://your-ngrok-url.ngrok.io npm run generate-qr
```

This will create a NEW QR code that works from your phone!

### Step 3: Open the New QR Code

```bash
open public/qr/SHARED1.png
```

### Step 4: Test from Phone

Now scan the QR code from your phone with:
- ✅ Google Pay → Opens with UPI prefilled
- ✅ PhonePe → Opens with UPI prefilled
- ✅ Paytm → Opens with UPI prefilled
- ✅ Google Lens → Opens review page
- ✅ Camera → Shows landing page

## 🎯 The SINGLE QR Code Concept

**One QR code (`SHARED1.png`) does ALL of this:**

1. **Google Pay scans** → Opens Google Pay with UPI
2. **PhonePe scans** → Opens PhonePe with UPI
3. **Paytm scans** → Opens Paytm with UPI
4. **Google Lens scans** → Opens Google Review
5. **Camera scans** → Shows landing page with Wi-Fi

**All from ONE QR code!** The system automatically detects which app scanned it.

## 📱 Testing Right Now

1. **Check ngrok URL:**
   - Open: http://127.0.0.1:4040
   - Copy the HTTPS URL

2. **Generate QR:**
   ```bash
   BASE_URL=https://your-ngrok-url npm run generate-qr
   ```

3. **Scan from phone** - It will work! 🎉

---

**The QR code file is ready - just need to generate it with ngrok URL for mobile testing!**

