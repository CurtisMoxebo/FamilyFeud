import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import * as sfxModule from '../src/utils/soundEffects';
import { RoomCreateForm } from '../src/components/RoomCreateForm';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('Frontend Regression Suite: RoomCreateForm Component (US-02)', () => {
  const renderWithProviders = (ui: React.ReactElement) => {
    return render(<LanguageProvider>{ui}</LanguageProvider>);
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders both setup sections: Language and Game Mode (without Room Name input)', () => {
    renderWithProviders(<RoomCreateForm />);

    // Step 1: Languages
    expect(screen.getByTestId('language-option-EN')).toBeInTheDocument();
    expect(screen.getByTestId('language-option-FR')).toBeInTheDocument();
    expect(screen.getByTestId('language-option-ES')).toBeInTheDocument();

    // Step 2: Game modes
    expect(screen.getByTestId('gamemode-card-fast_money')).toBeInTheDocument();
    expect(screen.getByTestId('gamemode-card-main_game')).toBeInTheDocument();

    // Room name input is deprecated (US-29)
    expect(screen.queryByTestId('room-name-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('create-room-submit-btn')).toBeInTheDocument();
  });

  it('satisfies Scenario 1: Successful Room Creation (French, Fast Money)', async () => {
    const user = userEvent.setup();
    const onRoomCreatedMock = vi.fn();

    const mockResponseRoom = {
      id: 'room-123',
      roomCode: 'FEUD-7890',
      language: 'FR',
      gameMode: 'FAST_MONEY',
      status: 'LOBBY',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        room: mockResponseRoom,
      }),
    } as Response);

    renderWithProviders(<RoomCreateForm onRoomCreated={onRoomCreatedMock} />);

    // Select Français
    await user.click(screen.getByTestId('language-option-FR'));

    // Select Fast Money
    await user.click(screen.getByTestId('gamemode-card-fast_money'));

    // Click submit button
    const submitBtn = screen.getByTestId('create-room-submit-btn');
    await user.click(submitBtn);

    // Verify fetch payload
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    const [callUrl, callOptions] = fetchSpy.mock.calls[0];
    expect(callUrl).toContain('/rooms');
    expect(callOptions?.method).toBe('POST');
    expect(JSON.parse(callOptions?.body as string)).toEqual({
      language: 'FR',
      gameMode: 'FAST_MONEY',
    });

    // Verify onRoomCreated callback
    expect(onRoomCreatedMock).toHaveBeenCalledWith(mockResponseRoom);
  });

  it('updates form labels dynamically when switching languages (i18n)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoomCreateForm />);

    // Default English
    expect(screen.getByTestId('create-room-submit-btn')).toHaveTextContent(/Create Room/i);

    // Switch to Spanish
    await user.click(screen.getByTestId('language-option-ES'));
    expect(screen.getByTestId('create-room-submit-btn')).toHaveTextContent(/Crear sala/i);

    // Switch to French
    await user.click(screen.getByTestId('language-option-FR'));
    expect(screen.getByTestId('create-room-submit-btn')).toHaveTextContent(/Créer le salon/i);
  });

  it('displays server error message when API responds with error', async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        message: 'Server capacity reached. Please try again later.',
      }),
    } as Response);

    renderWithProviders(<RoomCreateForm />);

    await user.click(screen.getByTestId('create-room-submit-btn'));

    const errorEl = await screen.findByTestId('room-create-error');
    expect(errorEl).toHaveTextContent('Server capacity reached. Please try again later.');
  });

  it('handles unexpected network failure gracefully', async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error: Failed to fetch'));

    renderWithProviders(<RoomCreateForm />);

    await user.click(screen.getByTestId('create-room-submit-btn'));

    const errorEl = await screen.findByTestId('room-create-error');
    expect(errorEl).toHaveTextContent('Network error: Failed to fetch');
  });

  it('satisfies US-18 Scenario 3: triggers resumeAudioContext when host clicks Create Room button', async () => {
    const resumeSpy = vi.spyOn(sfxModule, 'resumeAudioContext').mockResolvedValue(undefined);
    const user = userEvent.setup();
    const mockRoom = {
      id: 'room-1',
      roomCode: 'FEUD-SFX1',
      language: 'EN',
      gameMode: 'FAST_MONEY',
      status: 'LOBBY',
      createdAt: new Date().toISOString(),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, room: mockRoom }),
    } as Response);

    renderWithProviders(<RoomCreateForm />);

    const submitBtn = screen.getByTestId('create-room-submit-btn');
    await user.click(submitBtn);

    expect(resumeSpy).toHaveBeenCalled();
  });
  it('satisfies US-20 Scenario 1: saves hostSecret in sessionStorage when room is created', async () => {
    const user = userEvent.setup();
    const mockRoom = {
      id: 'room-sec-1',
      roomCode: 'FEUD-SEC1',
      language: 'EN',
      gameMode: 'MAIN_GAME',
      status: 'LOBBY',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        room: mockRoom,
        hostSecret: 'secret-token-xyz-789',
      }),
    } as Response);

    renderWithProviders(<RoomCreateForm />);

    const submitBtn = screen.getByTestId('create-room-submit-btn');
    await user.click(submitBtn);

    expect(sessionStorage.getItem('ff_host_secret')).toBe('secret-token-xyz-789');
    expect(sessionStorage.getItem('ff_host_secret_FEUD-SEC1')).toBe('secret-token-xyz-789');
  });
});
