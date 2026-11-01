import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App, { AppContent } from './App';
import { LanguageProvider } from './i18n/LanguageContext';
import { RouterProvider } from './router/router';

describe('Frontend Regression Suite: App Flow & End-to-End Routing (US-02)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the game show landing page and room creation form at root path', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: /family feud/i })).toBeInTheDocument();
    expect(screen.getByText(/powered by google gemini ai/i)).toBeInTheDocument();
    expect(screen.getByText(/multiplayer game show & real-time duel/i)).toBeInTheDocument();

    // Check Room Creation Form is mounted
    expect(screen.getByTestId('room-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('create-room-submit-btn')).toBeInTheDocument();
  });

  it('completes the full flow: creates a room and transitions seamlessly to Host Board (/host/:roomCode)', async () => {
    const user = userEvent.setup();

    const mockRoom = {
      id: 'room-xyz-123',
      roomCode: 'FEUD-9999',
      roomName: 'Victory Feud',
      language: 'EN' as const,
      gameMode: 'FAST_MONEY' as const,
      status: 'LOBBY' as const,
      createdAt: new Date().toISOString(),
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        room: mockRoom,
      }),
    } as Response);

    render(<App />);

    // Type a room name
    const roomInput = screen.getByTestId('room-name-input');
    await user.type(roomInput, 'Victory Feud');

    // Click submit
    const submitBtn = screen.getByTestId('create-room-submit-btn');
    await user.click(submitBtn);

    // Verify navigation to Host Board with Room details
    await waitFor(() => {
      expect(screen.getByTestId('host-room-code')).toHaveTextContent('FEUD-9999');
    });

    expect(screen.getByText('Victory Feud')).toBeInTheDocument();
    expect(screen.getByTestId('host-room-mode')).toHaveTextContent(/fast money/i);
  });

  it('renders Host Board directly when initialPath is /host/:roomCode', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        room: {
          id: 'room-direct-1',
          roomCode: 'FEUD-1234',
          roomName: 'Direct Access Night',
          language: 'EN' as const,
          gameMode: 'FAST_MONEY' as const,
          status: 'LOBBY' as const,
          createdAt: new Date().toISOString(),
        },
      }),
    } as Response);

    render(
      <LanguageProvider>
        <RouterProvider initialPath="/host/FEUD-1234">
          <AppContent />
        </RouterProvider>
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('host-room-code')).toHaveTextContent('FEUD-1234');
    });

    expect(screen.getByText('Direct Access Night')).toBeInTheDocument();
  });
});
