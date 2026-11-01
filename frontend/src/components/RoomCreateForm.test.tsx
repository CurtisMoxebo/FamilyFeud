import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { RoomCreateForm } from './RoomCreateForm';
import { LanguageProvider } from '../i18n/LanguageContext';

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

  it('renders all 3 setup sections: Language, Game Mode, and Room Name', () => {
    renderWithProviders(<RoomCreateForm />);

    // Step 1: Languages
    expect(screen.getByTestId('language-option-EN')).toBeInTheDocument();
    expect(screen.getByTestId('language-option-FR')).toBeInTheDocument();
    expect(screen.getByTestId('language-option-ES')).toBeInTheDocument();

    // Step 2: Game modes
    expect(screen.getByTestId('gamemode-card-fast_money')).toBeInTheDocument();
    expect(screen.getByTestId('gamemode-card-main_game')).toBeInTheDocument();

    // Step 3: Room name
    expect(screen.getByTestId('room-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('create-room-submit-btn')).toBeInTheDocument();
  });

  it('satisfies Scenario 1: Successful Room Creation (French, Fast Money, Soirée Famille)', async () => {
    const user = userEvent.setup();
    const onRoomCreatedMock = vi.fn();

    const mockResponseRoom = {
      id: 'room-123',
      roomCode: 'FEUD-7890',
      roomName: 'Soirée Famille',
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

    // Type room name
    const input = screen.getByTestId('room-name-input');
    await user.type(input, 'Soirée Famille');

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
      roomName: 'Soirée Famille',
      language: 'FR',
      gameMode: 'FAST_MONEY',
    });

    // Verify onRoomCreated callback
    expect(onRoomCreatedMock).toHaveBeenCalledWith(mockResponseRoom);
  });

  it('satisfies Scenario 2: Validation of Empty or Invalid Room Name', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const onRoomCreatedMock = vi.fn();

    renderWithProviders(<RoomCreateForm onRoomCreated={onRoomCreatedMock} />);

    // Try submitting with empty room name
    const submitBtn = screen.getByTestId('create-room-submit-btn');
    await user.click(submitBtn);

    // Fetch should NOT be called
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onRoomCreatedMock).not.toHaveBeenCalled();

    // Error message must appear
    const errorEl = await screen.findByTestId('room-create-error');
    expect(errorEl).toHaveTextContent('Please enter a room name (3-50 characters)');

    // Try submitting with name shorter than 3 characters
    const input = screen.getByTestId('room-name-input');
    await user.type(input, 'AB');
    await user.click(submitBtn);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('room-create-error')).toHaveTextContent(
      'Please enter a room name (3-50 characters)'
    );
  });

  it('updates form labels dynamically when switching languages (i18n)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoomCreateForm />);

    // Default English
    expect(screen.getByTestId('create-room-submit-btn')).toHaveTextContent(/Create Room/i);

    // Switch to Spanish
    await user.click(screen.getByTestId('language-option-ES'));
    expect(screen.getByTestId('create-room-submit-btn')).toHaveTextContent(/Crear sala/i);
    expect(screen.getByPlaceholderText(/ej\. Noche Familiar/i)).toBeInTheDocument();

    // Switch to French
    await user.click(screen.getByTestId('language-option-FR'));
    expect(screen.getByTestId('create-room-submit-btn')).toHaveTextContent(/Créer le salon/i);
    expect(screen.getByPlaceholderText(/ex\. Soirée Famille/i)).toBeInTheDocument();
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

    const input = screen.getByTestId('room-name-input');
    await user.type(input, 'Valid Room Name');

    await user.click(screen.getByTestId('create-room-submit-btn'));

    const errorEl = await screen.findByTestId('room-create-error');
    expect(errorEl).toHaveTextContent('Server capacity reached. Please try again later.');
  });

  it('handles unexpected network failure gracefully', async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error: Failed to fetch'));

    renderWithProviders(<RoomCreateForm />);

    const input = screen.getByTestId('room-name-input');
    await user.type(input, 'Valid Room Name');

    await user.click(screen.getByTestId('create-room-submit-btn'));

    const errorEl = await screen.findByTestId('room-create-error');
    expect(errorEl).toHaveTextContent('Network error: Failed to fetch');
  });
});

