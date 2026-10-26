# NestJS Hello World

A minimal NestJS backend scaffold for the Doctor Appointment Scheduler internship task. It only implements the default Hello World endpoint; no database or appointment features are included.

## Requirements

- Node.js LTS (Node.js 20 or newer recommended)
- npm

## Run locally

Open a terminal in this folder and run:

```bash
npm install
npm run start:dev
```

Open <http://localhost:3000>. Expected response:

```text
Hello World!
```

Stop the development server with `Ctrl+C`.

## Files

- `src/main.ts` — starts the NestJS application.
- `src/app.module.ts` — registers the controller and service.
- `src/app.controller.ts` — handles `GET /`.
- `src/app.service.ts` — returns the Hello World response.

## Note

This is a starter scaffold for today's task, not the complete Doctor Appointment Scheduler.
