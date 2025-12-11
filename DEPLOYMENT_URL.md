# Deployment Information

## 🌐 Production Deployment

**Deployment URL:** https://oneqrcode.vercel.app

## 📱 QR Code

The QR code (`public/qr/SHARED1.png`) points to:
```
https://oneqrcode.vercel.app/p/SHARED1
```

## 🔗 Important Links

- **Main QR Endpoint:** https://oneqrcode.vercel.app/p/SHARED1
- **Admin Panel:** https://oneqrcode.vercel.app/admin
- **Health Check:** https://oneqrcode.vercel.app/health

## ✅ Testing

You can now scan the QR code from any device and it will work:

1. **Scan with Google Pay** → Opens Google Pay with UPI prefilled
2. **Scan with PhonePe** → Opens PhonePe with UPI prefilled
3. **Scan with Paytm** → Opens Paytm with UPI prefilled
4. **Scan with Google Lens** → Opens Google Review page
5. **Scan with Camera** → Shows landing page with Wi-Fi and options

## 🎯 The Flow

When investor scans QR code:

1. QR code contains: `https://oneqrcode.vercel.app/p/SHARED1`
2. Phone makes request to deployment URL
3. Server detects which app scanned (Google Pay/PhonePe/etc.)
4. Server redirects to appropriate action:
   - Payment apps → UPI intent
   - Google Lens → Review page
   - Camera → Landing page
5. App opens with correct details! ✅

---

**Everything is configured to use the deployment URL. No localhost references!**

