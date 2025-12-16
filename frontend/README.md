# ErisBluSanta Video Assessment Portal

A Next.js frontend for collecting video assessments from medical representatives.

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn

### Installation

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install
```

### Development

```bash
# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Configuration

### Environment Variables

Create a `.env.local` file with:

```env
# Backend API URL
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

### Employee Data

Update `public/mr-list.csv` with your employee data in the format:

```csv
Emp Code,Name,Mobile
EMP001,John Doe,9876543210
```

## Customization

### Update Questions

Edit `src/app/page.tsx` and replace the placeholder questions with your actual questions.

### Update Branding

1. Add your logo to `public/` folder
2. Update `src/app/layout.tsx` metadata
3. Update the header in `src/app/page.tsx`

## Project Structure

```
frontend/
├── public/
│   └── mr-list.csv          # Employee data
├── src/
│   └── app/
│       ├── globals.css      # Global styles
│       ├── layout.tsx       # Root layout
│       └── page.tsx         # Main assessment form
├── next.config.ts           # Next.js config with API rewrites
├── tailwind.config.ts       # Tailwind CSS config
└── package.json
```

## Features

- Employee code auto-lookup from CSV
- Multi-video upload with signed URLs
- Form validation
- Bilingual support (English/Hindi)
- Responsive design
- Upload progress tracking

## Backend Integration

The frontend expects these backend endpoints:

- `POST /api/get-signed-url` - Get signed URL for video upload
- `POST /api/submit-assessment` - Submit assessment data

See the backend documentation for API details.
