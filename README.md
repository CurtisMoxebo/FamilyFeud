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
  - **Main Game**: 2 to 10 players (even count), auto-balanced into two teams, 1-on-1 buzzer face-offs, pass or play decisions, sequential team guessing, 3-strike counter, and dramatic steal attempts.
- **Zero-Friction Joining**: Scan a high-contrast QR code or share a direct URL. No app store downloads or user account registration required.
- **Code-First Database**: Full persistence via **Prisma ORM** with version-controlled migrations on MySQL.
- **Resilient Networking**: Automatic host and player reconnection within a 30-second grace window to protect ongoing games against screen locks or Wi-Fi drops.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Socket.io-client, Canvas Confetti |
| **Backend** | Node.js, Express, TypeScript, Socket.io, `@google/genai` (Google Gemini SDK) |
| **Database & ORM** | MySQL 8.0, Prisma ORM (Code-First with versioned migrations) |
| **Audio & Speech** | Native Web Speech API (`window.speechSynthesis`) + Web Audio API synthesizer |

---

## 📁 Project Structure

```text
FamilyFeud/
├── backend/
│   ├── src/
│   │   ├── config/          # Environment configuration
│   │   ├── controllers/     # REST route handlers
│   │   ├── routes/          # Express API routes
│   │   ├── services/        # Gemini AI & DB business logic
│   │   ├── sockets/         # Real-time game state managers
│   │   ├── utils/           # String normalizers & sound helpers
│   │   └── server.ts        # Server entry point
│   ├── prisma/
│   │   └── schema.prisma    # Code-First Prisma models
│   ├── tsconfig.json
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/      # Board, Buzzer, Strikes, Scoreboard
│   │   ├── pages/           # Home, HostBoard, PlayerController
│   │   ├── hooks/           # useSocket, useTTS, useAudio
│   │   ├── types/           # Shared TypeScript contracts
│   │   ├── App.tsx
│   │   └── main.tsx
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
- **Node.js** v18.0.0 or higher
- **npm** v9.0.0 or higher
- **MySQL Server** v8.0 or MariaDB v10.5+
- **Google Gemini API Key** (Free from [Google AI Studio](https://aistudio.google.com/))

### 1. Database Setup
Create your local MySQL database:
```sql
CREATE DATABASE family_feud CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your DATABASE_URL and GEMINI_API_KEY
npx prisma migrate dev --name init
npm run dev
```
The backend API and WebSocket server will run at `http://localhost:5000`.

### 3. Frontend Setup
In a new terminal:
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```
The frontend application will be accessible at `http://localhost:5173`.

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
