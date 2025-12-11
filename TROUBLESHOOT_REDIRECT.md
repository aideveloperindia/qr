# Troubleshooting: "Redirecting to External Site" Warning

## 🎯 The Problem

When scanning QR code from Google Pay/PhonePe, you see:
- "You are being redirected to external site"
- Instead of directly opening the payment app

## 🔍 Why This Happens

Payment apps have security features that warn when:
1. Opening URLs in their in-app browser
2. Redirecting to external URLs (like `upi://` or `phonepe://`)
3. The redirect is detected as "external"

## ✅ Solutions to Try

### Solution 1: Check Server Logs

Check Vercel function logs to see:
- What User-Agent is received
- What X-Requested-With header is received
- What app type is detected

If app is detected as `browser` instead of `google_pay`/`phonepe`, that's the problem.

### Solution 2: Use Query Parameter

Generate QR code with app parameter:
```
https://oneqrcode.vercel.app/p/SHARED1?app=gpay
https://oneqrcode.vercel.app/p/SHARED1?app=phonepe
```

This forces detection even if headers aren't sent.

### Solution 3: Check Detection

Visit debug endpoint after scanning:
```
https://oneqrcode.vercel.app/debug
```

This shows all headers received.

## 🔧 Current Implementation

The code now:
1. Detects app from headers/referer
2. Returns HTML with immediate JavaScript redirect
3. Uses `window.location.replace()` to avoid warning

## 📱 Testing

1. Scan QR from Google Pay
2. Check server logs - what app is detected?
3. If detected as `browser`, detection is failing
4. If detected correctly but still shows warning, it's a payment app security feature

## 💡 Next Steps

1. Check Vercel logs to see what's detected
2. If detection fails, we need to improve detection
3. If detection works but warning appears, it's expected behavior (payment app security)

---

**Check the logs first to see what's actually happening!**

