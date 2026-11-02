import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { HostBoard } from '../src/pages/HostBoard';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { RouterProvider } from '../src/router/router';
import { Room } from '../src/types';

describe('Frontend Regression Suite: HostBoard Page & QR Code (US-02 & US-03)', () => {
  const mockRoom: Room = {
    id: 'room-abc',
    roomCode: 'FEUD-7890',
    roomName: 'Soirée Famille',
    language: 'FR',
    gameMode: 'FAST_MONEY',
    status: 'LOBBY',
    createdAt: new Date().toISOString(),
  };

  const renderWithProviders = (ui: React.ReactElement, initialPath = '/host/FEUD-7890') => {
    return render(
      <LanguageProvider>
        <RouterProvider initialPath={initialPath}>{ui}</RouterProvider>
      </LanguageProvider>
    );
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('satisfies Scenario 3: Language and Mode Persistence with initialRoom prop', () => {
    renderWithProviders(<HostBoard roomCode="FEUD-7890" initialRoom={mockRoom} />);

    // Room Name and Code
    expect(screen.getByText('Soirée Famille')).toBeInTheDocument();
    expect(screen.getByTestId('host-room-code')).toHaveTextContent('FEUD-7890');

    // Language reflects French
    expect(screen.getByTestId('host-room-language')).toHaveTextContent('Français (FR)');

    // Mode reflects Fast Money (Face-à-Face Rapide in French)
    expect(screen.getByTestId('host-room-mode')).toHaveTextContent(/Face-à-Face Rapide/i);

    // Status is LOBBY
    expect(screen.getByText('LOBBY')).toBeInTheDocument();
  });

  it('satisfies US-03 Scenario 1: renders high-contrast QR code and mobile scan instructions', () => {
    renderWithProviders(<HostBoard roomCode="FEUD-7890" initialRoom={mockRoom} />);

    // Check QR Code SVG is rendered
    const qrCode = screen.getByTestId('host-qr-code');
    expect(qrCode).toBeInTheDocument();
    expect(qrCode.tagName.toLowerCase()).toBe('svg');

    // Check scan instruction in French
    const scanInstruction = screen.getByTestId('host-scan-instruction');
    expect(scanInstruction).toBeInTheDocument();
    expect(scanInstruction).toHaveTextContent(/scannez avec votre téléphone/i);

    // Check direct link URL is displayed
    expect(screen.getByText(new RegExp('/play/FEUD-7890'))).toBeInTheDocument();
  });

  it('satisfies US-03 Scenario 2: copies the join URL when Copy Link is clicked', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    renderWithProviders(<HostBoard roomCode="FEUD-7890" initialRoom={mockRoom} />);

    const copyBtn = screen.getByTestId('host-copy-link-btn');
    await user.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('/play/FEUD-7890'));
    expect(screen.getByText(/copié/i)).toBeInTheDocument();

    // Secondary link copy button also works
    const directCopyBtn = screen.getByTestId('host-direct-link-copy-btn');
    await user.click(directCopyBtn);
    expect(writeTextMock).toHaveBeenCalledTimes(2);
  });

  it('fetches room details via REST API when loaded without initialRoom', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        room: {
          ...mockRoom,
          language: 'ES',
          gameMode: 'MAIN_GAME',
          roomName: 'Noche en Familia',
        },
      }),
    } as Response);

    renderWithProviders(<HostBoard roomCode="FEUD-7890" />);

    // Shows loading initially
    expect(screen.getByText(/loading game show board/i)).toBeInTheDocument();

    // Resolves and displays Spanish Main Game details
    await waitFor(() => {
      expect(screen.getByText('Noche en Familia')).toBeInTheDocument();
    });

    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/rooms/FEUD-7890'));
    expect(screen.getByTestId('host-room-language')).toHaveTextContent('Español (ES)');
    expect(screen.getByTestId('host-room-mode')).toHaveTextContent(/Juego Principal/i);
    expect(screen.getByTestId('host-qr-code')).toBeInTheDocument();
  });

  it('displays error state when room cannot be found (404) and allows returning home', async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({
        success: false,
        error: 'Room not found',
      }),
    } as Response);

    renderWithProviders(<HostBoard roomCode="FEUD-NONEXISTENT" />);

    await waitFor(() => {
      expect(screen.getByText(/room unavailable/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/room not found/i)).toBeInTheDocument();
    const backBtn = screen.getByRole('button', { name: /back to home/i });
    expect(backBtn).toBeInTheDocument();

    await user.click(backBtn);
  });

  it('allows host to leave lobby and return to home page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<HostBoard roomCode="FEUD-7890" initialRoom={mockRoom} />);

    const leaveBtn = screen.getByTestId('host-back-home-btn');
    expect(leaveBtn).toBeInTheDocument();
    await user.click(leaveBtn);
  });
});
