# BluSanta Video Stitching - Deployment Workflow

## Git Workflow

### Initial Setup

```powershell
cd "c:\Users\Dipesh_Goel\AI Video Training\ErisBluSanta"
git init
git remote add origin https://github.com/DIPESHGOEL27/Eris_BluSanta.git
```

### Daily Workflow

#### 1. Pull Latest Changes

```powershell
git pull origin main
```

#### 2. Make Changes

Edit files as needed, test locally if possible.

#### 3. Commit Changes

```powershell
git add .
git commit -m "Description of changes"
```

#### 4. Push to GitHub

```powershell
git push origin main
```

#### 5. Deploy to VM

```powershell
# Deploy without restart
.\deploy-to-vm.ps1

# Deploy and restart service
.\deploy-to-vm.ps1 -Restart
```

## Quick Deploy Script

The `deploy-to-vm.ps1` script:

- Creates a timestamped backup on VM
- Uploads `blusanta_zoom_stitch.py` to video-stitch-blusanta VM
- Optionally restarts the PM2 service

## VM Information

- **VM Name**: video-stitch-blusanta
- **Zone**: us-central1-a
- **File Path**: /home/Dipesh_Goel/blusanta_zoom_stitch.py
- **Service**: PM2 (video-stitch)
- **Port**: 8080

## Monitoring

Check logs:

```powershell
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a --command="pm2 logs video-stitch --lines 50"
```

Check service status:

```powershell
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a --command="pm2 status"
```

## Important Files

- `blusanta_zoom_stitch.py` - Main video stitching script (production)
- `deploy-to-vm.ps1` - Deployment script
- `backend/` - Node.js backend API
- `frontend/` - Next.js frontend
- `docs/` - Documentation

## Recent Fixes

### December 16, 2024

1. **Filter Script Fix**: Changed from inline `-filter_complex` to `-filter_complex_script` to avoid command-line length issues
2. **Audio Codec Fix**: Added audio transcoding for doctor videos with unsupported codecs (e.g., 'apac')

## Troubleshooting

### Video Stitching Fails

1. Check PM2 logs for errors
2. Verify all GCS files are accessible
3. Check if doctor video has compatible audio codec

### Deployment Fails

1. Ensure you have gcloud authentication
2. Check VM is running
3. Verify SSH keys are configured

### Audio Issues

The script now automatically transcodes audio to AAC if needed.

### FFmpeg Filter Issues

Filter expressions are now written to a temporary file to avoid command-line length limits.
