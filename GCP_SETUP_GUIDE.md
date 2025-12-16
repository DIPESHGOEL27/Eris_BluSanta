# ============================================

# 🎅 BluSanta GCP Setup Guide

# ============================================

# Complete guide to setup GCS bucket, VM with static IP,

# and deploy frontend/backend

# ============================================

## Prerequisites

1. GCP Project with billing enabled
2. gcloud CLI installed and authenticated
3. Service Account with following roles:
   - Storage Admin
   - Compute Admin
   - Cloud Run Admin (optional)

---

## Step 1: GCS Bucket Setup

The BluSanta project uses the existing `gonuts-public-data` bucket.
Create the following folder structure:

### Using gcloud CLI:

```bash
# Set your project
gcloud config set project <YOUR_PROJECT_ID>

# Create folder structure (GCS uses objects, so we create placeholder files)
echo "" | gsutil cp - gs://gonuts-public-data/blusanta/.keep
echo "" | gsutil cp - gs://gonuts-public-data/blusanta/audio/.keep
echo "" | gsutil cp - gs://gonuts-public-data/blusanta/audio/names/.keep
echo "" | gsutil cp - gs://gonuts-public-data/blusanta/constant-videos/.keep
echo "" | gsutil cp - gs://gonuts-public-data/blusanta/results/.keep

# Set CORS for the bucket (if not already set)
# Create a cors.json file:
cat > cors.json << 'EOF'
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"]
  }
]
EOF

gsutil cors set cors.json gs://gonuts-public-data

# Make bucket publicly readable (for serving videos)
gsutil iam ch allUsers:objectViewer gs://gonuts-public-data
```

### Upload Constant Videos:

```bash
# Upload your pre-recorded constant videos
gsutil cp ./constant-videos/intro.mp4 gs://gonuts-public-data/blusanta/constant-videos/
gsutil cp ./constant-videos/name.mp4 gs://gonuts-public-data/blusanta/constant-videos/
gsutil cp ./constant-videos/story.mp4 gs://gonuts-public-data/blusanta/constant-videos/
gsutil cp ./constant-videos/wishes.mp4 gs://gonuts-public-data/blusanta/constant-videos/
gsutil cp ./constant-videos/outro.mp4 gs://gonuts-public-data/blusanta/constant-videos/
```

---

## Step 2: Reserve Static IP Address

```bash
# Reserve a static external IP
gcloud compute addresses create blusanta-ip \
    --region=us-central1 \
    --network-tier=PREMIUM

# Get the IP address
gcloud compute addresses describe blusanta-ip \
    --region=us-central1 \
    --format="get(address)"

# Note this IP - you'll need it for:
# 1. .env file (BACKEND_IP)
# 2. DNS configuration
# 3. VM creation
```

---

## Step 3: Create VM Instance

```bash
# Create the VM with the static IP
gcloud compute instances create blusanta-campaign \
    --zone=us-central1-c \
    --machine-type=e2-medium \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=30GB \
    --boot-disk-type=pd-standard \
    --address=blusanta-ip \
    --tags=http-server,https-server \
    --metadata=enable-oslogin=TRUE

# Create firewall rules for ports 3000 and 3001
gcloud compute firewall-rules create allow-blusanta-frontend \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:3000 \
    --target-tags=http-server

gcloud compute firewall-rules create allow-blusanta-backend \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:3001 \
    --target-tags=http-server
```

---

## Step 4: Deploy Code to VM

### From your local Windows machine (PowerShell):

```powershell
# SSH into the VM first to accept the key
gcloud compute ssh blusanta-campaign --zone=us-central1-c

# Exit and copy files
gcloud compute scp --recurse "C:\Users\Dipesh_Goel\AI Video Training\ErisBluSanta\*" blusanta-campaign:/home/ubuntu/blusanta/ --zone=us-central1-c

# Copy service account key (keep this secure!)
gcloud compute scp "C:\path\to\service-account-key.json" blusanta-campaign:/home/ubuntu/blusanta/backend/data/service-account-key.json --zone=us-central1-c
```

---

## Step 5: Run Setup on VM

```bash
# SSH into VM
gcloud compute ssh blusanta-campaign --zone=us-central1-c

# Run VM setup script
cd /home/ubuntu/blusanta
chmod +x vm-setup.sh setup-app.sh
./vm-setup.sh

# After vm-setup.sh, run app setup
./setup-app.sh
```

---

## Step 6: Configure Environment Variables

```bash
# Edit the .env file with actual values
cd /home/ubuntu/blusanta/backend
nano .env

# Update these critical values:
# - ELEVENLABS_API_KEY=your_actual_api_key
# - ELEVENLABS_VOICE_ID=your_blusanta_voice_id
# - BACKEND_IP=<your-static-ip>
# - SPREADSHEET_ID=your_google_sheet_id
# - GUPSHUP_* credentials

# Restart backend after changes
pm2 restart blusanta-backend
```

---

## Step 7: Verify Deployment

### Check Application Status:

```bash
pm2 status
pm2 logs
```

### Test Endpoints:

```bash
# Test backend health
curl http://localhost:3001/health

# Test frontend (from browser)
# http://<STATIC_IP>:3000
```

---

## Step 8: Optional - Setup Nginx (for production)

```bash
# Install nginx
sudo apt-get install -y nginx

# Create nginx config
sudo nano /etc/nginx/sites-available/blusanta

# Add configuration:
server {
    listen 80;
    server_name blusanta.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Enable the site
sudo ln -s /etc/nginx/sites-available/blusanta /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Quick Reference Commands

### PM2 Commands:

```bash
pm2 status                  # Check status
pm2 logs                    # View all logs
pm2 logs blusanta-backend   # View backend logs
pm2 restart all             # Restart all apps
pm2 stop all                # Stop all apps
pm2 delete all              # Remove all apps
```

### Useful Diagnostics:

```bash
# Check if ports are listening
sudo netstat -tlnp | grep -E '3000|3001'

# Check PM2 process memory
pm2 monit

# Check system resources
htop

# View backend database
sqlite3 /home/ubuntu/blusanta/backend/data/assessments.db ".tables"
```

### Redeploy After Code Changes:

```bash
# On local machine - copy updated files
gcloud compute scp --recurse ./ErisBluSanta/* blusanta-campaign:/home/ubuntu/blusanta/ --zone=us-central1-c

# On VM
cd /home/ubuntu/blusanta
npm install --prefix backend
npm install --prefix frontend
npm run build --prefix frontend
pm2 restart all
```

---

## Troubleshooting

### Port Already in Use:

```bash
sudo lsof -i :3000
sudo lsof -i :3001
# Kill the process if needed
sudo kill -9 <PID>
```

### PM2 Not Starting on Boot:

```bash
pm2 startup
pm2 save
```

### Database Issues:

```bash
# Reset database
rm /home/ubuntu/blusanta/backend/data/assessments.db
pm2 restart blusanta-backend
```

### GCS Permission Issues:

```bash
# Verify service account key
cat /home/ubuntu/blusanta/backend/data/service-account-key.json | head -5

# Test GCS access
gsutil ls gs://gonuts-public-data/blusanta/
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     GCP VM (blusanta-campaign)               │
│                     Static IP: xxx.xxx.xxx.xxx               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────────┐        ┌─────────────────┐            │
│   │   Frontend      │        │    Backend       │            │
│   │   (Next.js)     │◄──────►│   (Express)      │            │
│   │   Port: 3000    │        │   Port: 3001     │            │
│   └─────────────────┘        └────────┬─────────┘            │
│                                       │                      │
└───────────────────────────────────────┼──────────────────────┘
                                        │
        ┌───────────────────────────────┼───────────────────────┐
        │                               │                       │
        ▼                               ▼                       ▼
┌───────────────┐           ┌───────────────┐         ┌─────────────────┐
│  ElevenLabs   │           │  GCS Bucket   │         │  Video Stitch   │
│  API (TTS)    │           │  (Storage)    │         │  Server         │
│               │           │               │         │  (video-stitch) │
└───────────────┘           └───────────────┘         └─────────────────┘
```

---

## Cost Estimation (Monthly)

| Resource            | Estimated Cost |
| ------------------- | -------------- |
| e2-medium VM (24/7) | ~$25           |
| Static IP           | ~$3            |
| GCS Storage (10GB)  | ~$0.26         |
| Egress (50GB)       | ~$6            |
| **Total**           | **~$35/month** |

Note: ElevenLabs API costs are separate (based on character usage)
