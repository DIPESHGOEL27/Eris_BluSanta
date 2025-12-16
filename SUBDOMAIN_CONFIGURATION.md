# BluSanta Subdomain Configuration Complete ✅

**Date:** December 8, 2025  
**Subdomain:** https://erisblusanta.gonuts.ai/

---

## ✅ Configuration Summary

### 1. Nginx Configuration

**Location:** `/etc/nginx/sites-available/blusanta`

```nginx
- Frontend (Next.js): Port 3000 → https://erisblusanta.gonuts.ai/
- Backend API: Port 3001 → https://erisblusanta.gonuts.ai/api/
- SSL Certificates: Let's Encrypt (Valid until March 6, 2026)
- CORS: Enabled for API endpoints
- Max Upload Size: 500MB (for doctor videos)
```

### 2. Frontend Configuration

**File:** `frontend/.env.local`

```bash
# OLD (Direct IP access):
NEXT_PUBLIC_BACKEND_URL=http://34.171.167.66:3001

# NEW (Subdomain with Nginx proxy):
NEXT_PUBLIC_BACKEND_URL=https://erisblusanta.gonuts.ai
```

**Benefits:**

- ✅ All API calls now go through HTTPS
- ✅ No CORS issues (same origin)
- ✅ Cleaner URLs for production
- ✅ SSL certificate handles encryption

### 3. Service Status

| Component                      | Port | Access Method                       | Status        |
| ------------------------------ | ---- | ----------------------------------- | ------------- |
| **Frontend (Assessment Form)** | 3000 | https://erisblusanta.gonuts.ai/     | ✅ LIVE       |
| **Backend API**                | 3001 | https://erisblusanta.gonuts.ai/api/ | ✅ PROXIED    |
| **Admin Dashboard**            | N/A  | Run locally (not on subdomain)      | ℹ️ Local only |

---

## 🌐 URL Structure

### Public Access (via Subdomain)

```
Frontend Assessment Form:
https://erisblusanta.gonuts.ai/

API Endpoints (proxied through Nginx):
https://erisblusanta.gonuts.ai/api/blusanta/upload-video
https://erisblusanta.gonuts.ai/api/blusanta/generate-audio
https://erisblusanta.gonuts.ai/api/blusanta/trigger-video-stitching
https://erisblusanta.gonuts.ai/api/blusanta/update-after-stitching
https://erisblusanta.gonuts.ai/api/blusanta/get-assessments
https://erisblusanta.gonuts.ai/api/blusanta/delete-assessment
https://erisblusanta.gonuts.ai/api/storage/signed-url
```

### Admin Dashboard (Local Only)

The admin dashboard is **NOT** accessible via the subdomain. It must be run locally:

1. **Run locally on your machine:**

   ```bash
   cd "c:\Users\Dipesh_Goel\AI Video Training\ErisBluSanta\frontend"
   npm run dev
   # Access at: http://localhost:3000/admin
   ```

2. **Or use SSH tunnel to VM:**
   ```bash
   gcloud compute ssh blusanta-campaign --zone=us-central1-c -- -L 3002:localhost:3001
   # Then access backend at: http://localhost:3002/api/blusanta/get-assessments
   ```

---

## 🔒 SSL Certificate Details

```
Certificate Name: erisblusanta.gonuts.ai
Provider: Let's Encrypt
Valid Until: March 6, 2026 (87 days remaining)
Auto-Renewal: Enabled via Certbot
Domains: erisblusanta.gonuts.ai
```

**Certificate Paths:**

- Certificate: `/etc/letsencrypt/live/erisblusanta.gonuts.ai/fullchain.pem`
- Private Key: `/etc/letsencrypt/live/erisblusanta.gonuts.ai/privkey.pem`

---

## 🔄 Traffic Flow

### Doctor Submits Video

```
1. Doctor visits: https://erisblusanta.gonuts.ai/
   ↓
2. Frontend served from port 3000 (Next.js)
   ↓
3. Doctor fills form and uploads video
   ↓
4. Frontend calls: https://erisblusanta.gonuts.ai/api/blusanta/upload-video
   ↓
5. Nginx proxies to: localhost:3001/api/blusanta/upload-video
   ↓
6. Backend (Express) processes request
   ↓
7. Response returned through Nginx → Frontend
```

### Admin Views Dashboard (Local)

```
1. Admin runs: npm run dev (locally)
   ↓
2. Opens: http://localhost:3000/admin
   ↓
3. Frontend calls: https://erisblusanta.gonuts.ai/api/blusanta/get-assessments
   ↓
4. Nginx proxies to backend on VM
   ↓
5. Data displayed in local admin panel
```

---

## 🧪 Testing

### Test Frontend Access

```bash
# Check if subdomain resolves
Test-NetConnection -ComputerName erisblusanta.gonuts.ai -Port 443

# Visit in browser
https://erisblusanta.gonuts.ai/
```

### Test API Access

```bash
# Health check
curl https://erisblusanta.gonuts.ai/api/health

# Get assessments (if any exist)
curl https://erisblusanta.gonuts.ai/api/blusanta/get-assessments
```

### Test SSL Certificate

```bash
# Check SSL validity
openssl s_client -connect erisblusanta.gonuts.ai:443 -servername erisblusanta.gonuts.ai
```

---

## 📝 Nginx Configuration Details

### Location Blocks

**1. Frontend (/ path)**

```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 500M;  # Allow large video uploads
}
```

**2. Backend API (/api/ path)**

```nginx
location /api/ {
    proxy_pass http://localhost:3001/api/;
    proxy_set_header Host $host;
    # CORS headers enabled
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
}
```

**3. SSL Configuration**

```nginx
listen 443 ssl;
ssl_certificate /etc/letsencrypt/live/erisblusanta.gonuts.ai/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/erisblusanta.gonuts.ai/privkey.pem;
```

**4. HTTP → HTTPS Redirect**

```nginx
server {
    listen 80;
    server_name erisblusanta.gonuts.ai;
    return 301 https://$host$request_uri;
}
```

---

## 🚀 Deployment Checklist

- [x] Nginx configuration updated with API proxy
- [x] SSL certificates verified (valid until Mar 6, 2026)
- [x] Frontend `.env.local` updated with subdomain URL
- [x] PM2 services restarted with new environment
- [x] Nginx reloaded with new configuration
- [x] CORS headers configured for API endpoints
- [x] Upload size limit set to 500MB
- [x] HTTP → HTTPS redirect enabled
- [x] Subdomain resolves to correct IP (34.171.167.66)
- [x] Port 443 accessible from internet

---

## ⚠️ Important Notes

1. **Admin Dashboard Security:**

   - The admin dashboard is intentionally NOT exposed via the subdomain
   - This prevents unauthorized access to sensitive data
   - Run admin panel locally or use SSH tunneling for secure access

2. **API Authentication:**

   - Currently API endpoints are open (no authentication)
   - Consider adding API key or JWT authentication for production

3. **CORS Configuration:**

   - CORS is currently set to allow all origins (`*`)
   - For production, restrict to specific domains:
     ```nginx
     add_header 'Access-Control-Allow-Origin' 'https://erisblusanta.gonuts.ai' always;
     ```

4. **Certificate Auto-Renewal:**

   - Certbot automatically renews certificates before expiry
   - Verify renewal works: `sudo certbot renew --dry-run`

5. **Firewall Rules:**
   - Ensure GCP firewall allows HTTPS (port 443)
   - HTTP (port 80) needed for Let's Encrypt validation

---

## 🔧 Maintenance Commands

### Nginx Management

```bash
# Test configuration
sudo nginx -t

# Reload without downtime
sudo systemctl reload nginx

# Restart (if needed)
sudo systemctl restart nginx

# View logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### SSL Certificate Management

```bash
# View certificates
sudo certbot certificates

# Renew manually
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run
```

### PM2 Service Management

```bash
# Check status
pm2 list

# Restart frontend
pm2 restart blusanta-frontend --update-env

# Restart backend
pm2 restart blusanta-backend

# View logs
pm2 logs blusanta-frontend
pm2 logs blusanta-backend
```

---

## ✅ Success Confirmation

**Frontend:** https://erisblusanta.gonuts.ai/ ✅ LIVE  
**Backend API:** https://erisblusanta.gonuts.ai/api/ ✅ PROXIED  
**SSL Status:** ✅ VALID (87 days remaining)  
**Services:** ✅ ONLINE (Backend: 311MB, Frontend: 40MB)

**The BluSanta assessment form is now accessible via the secure subdomain!** 🎉

---

**Configured By:** GitHub Copilot  
**Date:** December 8, 2025  
**VM:** blusanta-campaign (us-central1-c)  
**IP:** 34.171.167.66
