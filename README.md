# Medella — Doctor Appointment Scheduler MVP

Full-stack MVP with a React + Vite frontend and NestJS API. It includes patient/doctor registration, login, doctor directory/search, seeded doctor profiles and slots, patient booking, appointment lists, doctor status updates, and SQLite persistence.

## Requirements
- Node.js 20 or newer (Node 20 LTS recommended)
- npm

## Run locally (two terminals)

### 1. Backend
```powershell
cd backend
npm install
$env:JWT_SECRET="replace-with-a-long-random-secret"
npm run start:dev
```
API: `http://localhost:3000/health`

### 2. Frontend
```powershell
cd frontend
npm install
npm run dev
```
Open the local URL Vite prints, usually `http://localhost:5173`.

The backend creates `backend/data/appointments.sqlite` and seeds four sample doctors with slots for the next seven days. Use different email addresses for patient and doctor test accounts. A doctor registered through the UI gets a profile; seed doctors are available for patient booking but do not have login accounts.

## API routes
- `POST /api/auth/register` — `{name,email,password,role}`; doctors may also send `specialty,experience,fee,bio`
- `POST /api/auth/login` — `{email,password}`
- `GET /api/auth/me` — Bearer token
- `GET /api/doctors?q=` — search directory
- `GET /api/doctors/:id/slots` — open slots
- `POST /api/appointments` — patient token + `{slotId,reason}`
- `GET /api/appointments/mine` — patient appointments
- `GET /api/appointments/doctor` — current doctor's appointments
- `PATCH /api/appointments/:id/status` — doctor token + `{status: "confirmed"|"completed"|"cancelled"}`

## Deployment notes
- Deploy the backend to a Node-capable host and set `JWT_SECRET`, `PORT`, `DATA_DIR`, and `CORS_ORIGIN` (comma-separated frontend origins). If using SQLite, mount a persistent disk and set `DATA_DIR` to its mount path; otherwise data may be lost on redeploy/restart depending on the host.
- Build the frontend with `npm run build` and set `VITE_API_URL` to the deployed API origin before building. Deploy `frontend/dist` to a static host such as Vercel or Netlify.
- This is a learning/demo MVP, not a production medical system. Before production use, add rate limiting, email verification/password reset, audit logging, stronger secret management, backups, privacy/compliance review, and robust concurrent booking tests.
