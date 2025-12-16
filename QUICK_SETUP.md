# ============================================

# 🎅 BluSanta Quick Setup Commands

# ============================================

# Copy-paste ready commands for fast deployment

# ============================================

## From Local Machine (PowerShell)

### 1. Reserve Static IP

```powershell
gcloud compute addresses create blusanta-ip --region=us-central1 --network-tier=PREMIUM
gcloud compute addresses describe blusanta-ip --region=us-central1 --format="get(address)"
```

### 2. Create VM

```powershell
gcloud compute instances create blusanta-campaign `
    --zone=us-central1-c `
    --machine-type=e2-medium `
    --image-family=ubuntu-2204-lts `
    --image-project=ubuntu-os-cloud `
    --boot-disk-size=30GB `
    --address=blusanta-ip `
    --tags=http-server,https-server
```

### 3. Create Firewall Rules

```powershell
gcloud compute firewall-rules create allow-blusanta-3000 --allow=tcp:3000 --target-tags=http-server
gcloud compute firewall-rules create allow-blusanta-3001 --allow=tcp:3001 --target-tags=http-server
```

### 4. SSH into VM

```powershell
gcloud compute ssh blusanta-campaign --zone=us-central1-c
```

### 5. Copy Files to VM

```powershell
# From ErisBluSanta directory
gcloud compute scp --recurse .\backend blusanta-campaign:/home/ubuntu/blusanta/backend --zone=us-central1-c
gcloud compute scp --recurse .\frontend blusanta-campaign:/home/ubuntu/blusanta/frontend --zone=us-central1-c
gcloud compute scp .\vm-setup.sh blusanta-campaign:/home/ubuntu/blusanta/ --zone=us-central1-c
gcloud compute scp .\setup-app.sh blusanta-campaign:/home/ubuntu/blusanta/ --zone=us-central1-c
```

---

## On VM (Bash)

### 6. Run Initial Setup

```bash
cd /home/ubuntu/blusanta
chmod +x vm-setup.sh setup-app.sh
./vm-setup.sh
```

### 7. Install Dependencies & Start

```bash
# Install backend dependencies
cd /home/ubuntu/blusanta/backend
npm install

# Install frontend dependencies
cd /home/ubuntu/blusanta/frontend
npm install
npm run build
```

### 8. Start with PM2

```bash
cd /home/ubuntu/blusanta

# Start backend
pm2 start backend/index.js --name blusanta-backend

# Start frontend (production)
cd frontend && pm2 start npm --name blusanta-frontend -- start

# Save and enable startup
pm2 save
pm2 startup
```

### 9. Update .env with Static IP

```bash
# Get your static IP
curl ifconfig.me

# Edit .env
nano /home/ubuntu/blusanta/backend/.env
# Update BACKEND_IP with the static IP
```

---

## GCS Bucket Setup

```bash
# Create folder structure
gsutil mb -l us-central1 gs://gonuts-public-data  # Skip if bucket exists

# Create BluSanta folders
echo "" | gsutil cp - gs://gonuts-public-data/blusanta/audio/.keep
echo "" | gsutil cp - gs://gonuts-public-data/blusanta/audio/names/.keep
echo "" | gsutil cp - gs://gonuts-public-data/blusanta/constant-videos/.keep
echo "" | gsutil cp - gs://gonuts-public-data/blusanta/results/.keep

# Set public access
gsutil iam ch allUsers:objectViewer gs://gonuts-public-data
```

---

## Verification Commands

```bash
# Check PM2 status
pm2 status

# Check backend health
curl http://localhost:3001/health

# Check logs
pm2 logs

# Check ports
netstat -tlnp | grep -E '3000|3001'
```

---

## Useful URLs (after deployment)

- Frontend: `http://<STATIC_IP>:3000`
- Backend Health: `http://<STATIC_IP>:3001/health`
- Admin Dashboard: `http://<STATIC_IP>:3001/api/admin/dashboard`
