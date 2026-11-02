import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { PlayerJoin } from '../src/pages/PlayerJoin';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { RouterProvider } from '../src/router/router';
import { Room } from '../src/types';

describe('Frontend Regression Suite: PlayerJoin Page (US-03)', () => {
  const mockRoom: Room = {
    id: 'room-123',
    roomCode: 'FEUD-8291',
    roomName: 'Soirée Famille',
    language: 'FR',
    gameMode: 'FAST_MONEY',
    status: 'LOBBY',
    createdAt: new Date().toISOString(),
  };

  const renderWithProviders = (ui: React.ReactElement, initialPath = '/play/FEUD-8291') => {
    return render(
      <LanguageProvider>
        <RouterProvider initialPath={initialPath}>{ui}</RouterProvider>
      </LanguageProvider>
    );
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('satisfies Scenario 3: renders room metadata and nickname input on initial load', () => {
    renderWithProviders(<PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} />);

    // Room info
    expect(screen.getByTestId('player-room-name')).toHaveTextContent('Soirée Famille');
    expect(screen.getByText('FEUD-8291')).toBeInTheDocument();
    expect(screen.getByTestId('player-room-language')).toHaveTextContent('Français (FR)');
    expect(screen.getByTestId('player-room-mode')).toHaveTextContent(/Face-à-Face Rapide/i);

    // Form elements
    expect(screen.getByLabelText(/votre pseudo/i)).toBeInTheDocument();
    expect(screen.getByTestId('player-nickname-input')).toBeInTheDocument();
    expect(screen.getByTestId('player-join-submit-btn')).toHaveTextContent(/rejoindre le salon/i);
  });

  it('satisfies Scenario 3: blocks empty or whitespace-only nickname with validation error', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} />);

    const submitBtn = screen.getByTestId('player-join-submit-btn');

    // Click submit with empty input
    await user.click(submitBtn);

    const errorBanner = screen.getByTestId('player-validation-error');
    expect(errorBanner).toBeInTheDocument();
    expect(errorBanner).toHaveTextContent(/veuillez saisir un pseudo/i);

    // Type spaces only and submit
    const input = screen.getByTestId('player-nickname-input');
    await user.type(input, '   ');
    await user.click(submitBtn);

    expect(screen.getByTestId('player-validation-error')).toBeInTheDocument();
  });

  it('blocks nickname with fewer than 2 characters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} />);

    const input = screen.getByTestId('player-nickname-input');
    await user.type(input, 'A');

    const submitBtn = screen.getByTestId('player-join-submit-btn');
    await user.click(submitBtn);

    expect(screen.getByTestId('player-validation-error')).toHaveTextContent(/veuillez saisir un pseudo/i);
  });

  it('satisfies Scenario 3: accepts valid nickname and calls onJoined callback', async () => {
    const user = userEvent.setup();
    const onJoinedMock = vi.fn();

    renderWithProviders(
      <PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} onJoined={onJoinedMock} />
    );

    const input = screen.getByTestId('player-nickname-input');
    await user.type(input, 'Sophie');

    const submitBtn = screen.getByTestId('player-join-submit-btn');
    await user.click(submitBtn);

    expect(onJoinedMock).toHaveBeenCalledWith({
      room: mockRoom,
      nickname: 'Sophie',
    });

    expect(sessionStorage.getItem('feud_nickname_FEUD-8291')).toBe('Sophie');

    // Shows welcome state
    await waitFor(() => {
      expect(screen.getByText(/welcome, sophie!/i)).toBeInTheDocument();
    });
  });

  it('fetches room details via API when rendered without initialRoom', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        room: {
          ...mockRoom,
          roomName: 'Noche en Familia',
          language: 'ES',
        },
      }),
    } as Response);

    renderWithProviders(<PlayerJoin roomCode="FEUD-8291" />);

    expect(screen.getByText(/connecting to room/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('player-room-name')).toHaveTextContent('Noche en Familia');
    });

    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/rooms/FEUD-8291'));
    expect(screen.getByTestId('player-room-language')).toHaveTextContent('Español (ES)');
  });

  it('displays error state when room cannot be found (404)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({
        success: false,
        error: 'Room not found or session has ended',
      }),
    } as Response);

    renderWithProviders(<PlayerJoin roomCode="FEUD-NOTFOUND" />);

    await waitFor(() => {
      expect(screen.getByText(/room unavailable/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/room not found or session has ended/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to home/i })).toBeInTheDocument();
  });
});

