import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App, { AppContent } from '../src/App';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { RouterProvider } from '../src/router/router';

describe('Frontend Regression Suite: App Flow & End-to-End Routing (US-02 & US-03)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('renders the game show landing page and room creation form at root path', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: /family feud/i })).toBeInTheDocument();
    expect(screen.queryByText(/powered by google gemini ai/i)).not.toBeInTheDocument();
    expect(screen.getByText(/multiplayer game show & real-time duel/i)).toBeInTheDocument();

    // Check Room Creation Form is mounted
    expect(screen.getByTestId('create-room-submit-btn')).toBeInTheDocument();
  });

  it('completes the full flow: creates a room and transitions seamlessly to Host Board (/host/:roomCode)', async () => {
    const user = userEvent.setup();

    const mockRoom = {
      id: 'room-xyz-123',
      roomCode: 'FEUD-9999',
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

    // Click submit
    const submitBtn = screen.getByTestId('create-room-submit-btn');
    await user.click(submitBtn);

    // Verify navigation to Host Board with Room details
    await waitFor(() => {
      expect(screen.getByTestId('host-room-code')).toHaveTextContent('FEUD-9999');
    });

    expect(screen.getByTestId('host-room-mode')).toHaveTextContent(/fast money/i);
    expect(screen.getByTestId('host-qr-code')).toBeInTheDocument();
  });

  it('renders Host Board directly when initialPath is /host/:roomCode', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        room: {
          id: 'room-direct-1',
          roomCode: 'FEUD-1234',
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

    expect(screen.getByTestId('host-qr-code')).toBeInTheDocument();
  });

  it('satisfies US-03: renders PlayerJoin page directly when initialPath is /play/:roomCode', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        room: {
          id: 'room-play-1',
          roomCode: 'FEUD-7777',
          language: 'EN' as const,
          gameMode: 'MAIN_GAME' as const,
          status: 'LOBBY' as const,
          createdAt: new Date().toISOString(),
        },
      }),
    } as Response);

    render(
      <LanguageProvider>
        <RouterProvider initialPath="/play/FEUD-7777">
          <AppContent />
        </RouterProvider>
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('FEUD-7777')).toBeInTheDocument();
    });

    expect(screen.getByTestId('player-nickname-input')).toBeInTheDocument();
    expect(screen.getByTestId('player-join-submit-btn')).toBeInTheDocument();
  });

  it('satisfies US-03: completes manual join flow from homepage tab and transitions to /play/:roomCode', async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        room: {
          id: 'room-manual-1',
          roomCode: 'FEUD-8293',
          language: 'EN' as const,
          gameMode: 'FAST_MONEY' as const,
          status: 'LOBBY' as const,
          createdAt: new Date().toISOString(),
        },
      }),
    } as Response);

    render(<App />);

    // Switch to Join Game tab
    const joinTabBtn = screen.getByTestId('tab-join-btn');
    await user.click(joinTabBtn);

    // Enter code and nickname
    const codeInput = screen.getByTestId('join-room-code-input');
    const nickInput = screen.getByTestId('join-nickname-input');
    const submitBtn = screen.getByTestId('join-form-submit-btn');

    await user.type(codeInput, '8293');
    await user.type(nickInput, 'Charlie');
    await user.click(submitBtn);

    // Transitions to PlayerJoin view for FEUD-8293
    await waitFor(() => {
      expect(screen.getByText('FEUD-8293')).toBeInTheDocument();
    });
  });
});
