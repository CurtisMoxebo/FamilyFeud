# 📺 Family Feud Online

An interactive, real-time multiplayer web application bringing the classic television game show **Family Feud** to modern web browsers. Built with a dual-screen architecture (Host TV screen vs. Player mobile controllers), real-time WebSockets, AI-powered survey question generation via Google Gemini, and automated host Text-to-Speech (TTS).

---

## 🌟 Key Features

- **Dual-Display Architecture**:
  - **Host TV Display (`/host/:roomCode`)**: High-definition 16:9 broadcast stage featuring animated flip cards, strike overlays ($X, XX, XXX$), round bank tallies, automated SpeechSynthesis (TTS), and sound synthesizer.
  - **Player Mobile Controller (`/play/:roomCode`)**: Low-latency, touch-optimized smartphone controller with prominent buzzers, answer inputs, haptic vibration feedback, and personal team scorecards.
- **Multilingual Support**: Play natively in **English**, **French**, or **Spanish** with fully localized UI text, questions, and native TTS pronunciation.
- **AI-Powered (Google Gemini API)**:
  - Dynamically generates survey questions with answers strictly summing to 100 points.
  - Intelligent two-tier answer validation: instant local exact match first, followed by Gemini semantic evaluation (tolerant of typos, synonyms, colloquialisms, and regional phrasing).
- **Two Complete Game Show Modes**:
  - **Fast Money**: 2 players, 5 questions, 60s & 75s countdowns, pass & return mechanic, duplicate answer detection ("Try again"), sequential reveal, and a 200-point combined victory target.
  - **Main Game**: 2 to 10 players (even count), auto-balanced into two teams, 1-on-1 buzzer face-offs, pass or play decisions, sequential team guessing, 3-strike counter, dramatic steal attempts, persistent real-time grand total scoreboards, sudden death tie-breaking, and seamless match replay.
- **Zero-Friction Joining**: Scan a high-contrast QR code or share a direct URL. No app store downloads or user account registration required.
- **Code-First Database**: Full persistence via **Prisma ORM** with modular schemas and version-controlled migrations on MySQL.
- **Resilient Networking**: Automatic host and player reconnection within a 30-second grace window to protect ongoing games against screen locks or Wi-Fi drops.
- **Host Administrative Controls & Overrides**: Discrete TV host control bar with authoritative timer Pause/Resume (including Spacebar shortcut and full player lockout banner), live Judge Manual Answer Override with automatic strike retraction & steal-phase reversion, and Lobby AFK player kick moderation.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Socket.io-client, Canvas Confetti |
| **Backend** | Node.js, Express, TypeScript, Socket.io, `@google/genai` (Google Gemini SDK), Zod |
| **Database & ORM** | MySQL 8.0, Prisma ORM (Code-First with modular multi-file schema) |
| **Testing** | Vitest, Supertest, @testing-library/react, jsdom |
| **DevOps & Containers** | Docker, Docker Compose, Nginx, GitHub Actions (CI) |
| **Audio & Speech** | Native Web Speech API (`window.speechSynthesis`) + Web Audio API synthesizer |

---

## 📁 Project Structure

```text
FamilyFeud/
├── backend/
│   ├── src/
│   │   ├── config/          # Environment configuration
│   │   ├── controllers/     # REST route handlers (rooms, etc.)
│   │   ├── middleware/      # Request logging & Zod validation
│   │   ├── routes/          # Express API routes
│   │   ├── services/        # Gemini AI & DB business logic
│   │   ├── sockets/         # Real-time game state managers
│   │   ├── utils/           # Structured logger & roomCode generator
│   │   ├── validators/      # Zod request validation schemas
│   │   └── server.ts        # Server entry point
│   ├── prisma/
│   │   └── schema/          # Modular multi-file Prisma schema
│   │       ├── base.prisma
│   │       ├── enums.prisma
│   │       ├── room.prisma
│   │       ├── player.prisma
│   │       ├── game.prisma
│   │       ├── question.prisma
│   │       ├── answer.prisma
│   │       └── response.prisma
│   ├── tests/               # Backend regression & integration suites
│   ├── tsconfig.json
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/      # FastMoneyController, FastMoneyHostBoard, FastMoneyIsolation, MainGameTeamsStage, MainGameFaceOffBoard, MainGameFaceOffController, MainGameTeamGuessingBoard, MainGameTeamController, MainGameScoreboardHeader, MainGameVictoryModal, MainGamePlayerView, forms
│   │   ├── i18n/            # Modular i18n localization
│   │   │   ├── en.ts        # English translations
│   │   │   ├── fr.ts        # French translations
│   │   │   ├── es.ts        # Spanish translations
│   │   │   ├── types.ts     # Translation dictionary schema
│   │   │   ├── translations.ts # Aggregated dictionary lookup
│   │   │   └── LanguageContext.tsx # React Context & useTranslation hook
│   │   ├── pages/           # HomePage, HostBoard, PlayerJoin
│   │   ├── router/          # Client router with param matching
│   │   ├── hooks/           # useSocket
│   │   ├── types/           # Shared TypeScript contracts
│   │   ├── utils/           # Web Speech API TTS (tts.ts) & Web Audio SFX (soundEffects.ts)
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── tests/               # Symmetrical frontend regression & component suites
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── package.json
│   └── .env.example
├── docs/                    # Wiki & User Stories documentation
├── .gitignore
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- **Google Gemini API Key** (Free from [Google AI Studio](https://aistudio.google.com/))
- **Docker & Docker Compose** (for containerized setup) **OR**
- **Node.js** v18+ & **MySQL** v8.0+ (for manual local development)

---

### Option A: Run the Whole Project with Docker (Recommended)

Run the full stack (MySQL database, Express/Socket.io backend, and Nginx/React frontend) with a single command without installing MySQL or Node locally:

1. **Set your Google Gemini API Key**:
   Create a `.env` file in the project root (or set an environment variable):
   ```bash
   # In PowerShell
   $env:GEMINI_API_KEY="your_gemini_api_key_here"

   # In Bash / macOS / Linux
   export GEMINI_API_KEY="your_gemini_api_key_here"
   ```

2. **Start the Multi-Container Stack**:
   ```bash
   docker compose up --build
   ```

3. **Access the Applications**:
   - 📺 **Host & Player Web App**: [`http://localhost`](http://localhost) (Port 80 via Nginx)
   - 📡 **Backend REST & Health API**: [`http://localhost:5000/api/health`](http://localhost:5000/api/health)
   - 🗄️ **MySQL Database**: `localhost:3306` (`user: family-feud-user`, `password: 123`, `database: family_feud` / `root: feud_root_password`)

4. **Initialize Database Schema with Prisma (first run)**:
   ```bash
   docker compose exec backend npx prisma db push
   ```

5. **Stop the Application**:
   ```bash
   # Stop all running containers
   docker compose down

   # Stop and delete persistent database volumes (reset data)
   docker compose down -v
   ```

---

### Option B: Manual Local Development Setup

#### 1. Database Setup
Create your local MySQL database:
```sql
CREATE DATABASE family_feud CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

#### 2. Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your DATABASE_URL and GEMINI_API_KEY
npx prisma generate
npx prisma db push
npm run dev
```
The backend API and WebSocket server will run at `http://localhost:5000`.

#### 3. Frontend Setup
In a separate terminal:
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```
The frontend application will be accessible at `http://localhost:5173`.

> **Tip**: From the project root, you can also start backend and frontend concurrently in two terminals:
> ```bash
> # Terminal 1 (Backend API & WebSocket server)
> npm run dev:backend
> 
> # Terminal 2 (Vite Frontend dev server)
> npm run dev:frontend
> ```

---

## 🧪 Running Regression Tests

The project includes automated regression test suites powered by **Vitest** for both backend and frontend.

All test suites are symmetrically organized in dedicated top-level `tests/` directories (`backend/tests/` and `frontend/tests/`), completely isolated from production application code in `src/`. Currently, **all 894 regression tests** (528 backend, 366 frontend) pass cleanly with **>90% code coverage** across 70 suites:

```bash
# Run all regression tests across the whole project
npm test

# Run backend regression tests (REST API, WebSockets, Prisma delegates, Room endpoints)
npm run test:backend

# Run frontend regression tests (Components, i18n, router, HostBoard, useSocket hook)
npm run test:frontend

# Generate code coverage reports (V8 engine)
npm run test:coverage
npm run test:coverage:backend
npm run test:coverage:frontend
```

---

## 📱 Dual-Screen Local Testing

To test the TV Host view and Player mobile controllers on a single computer:
1. **Host Screen**: Open `http://localhost:5173` in a standard browser window. Select a language, game mode, enter a room name, and click Create.
2. **Player 1**: Open an **Incognito / Private** window and visit the join URL or scan the QR code.
3. **Player 2**: Open a second **Incognito** window or a different browser profile.
4. **Mobile Phone Testing**: Find your local IP (e.g. `192.168.1.50`), ensure your phone is connected to the same Wi-Fi, and scan the QR code directly from your phone camera!

---

## 📜 License

This project is licensed under the MIT License.
