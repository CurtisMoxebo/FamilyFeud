import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { RoomJoinForm, normalizeRoomCodeInput } from '../src/components/RoomJoinForm';
import { HomePage } from '../src/pages/HomePage';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { RouterProvider } from '../src/router/router';

describe('Frontend Regression Suite: RoomJoinForm & Homepage Tabs (US-03)', () => {
  const renderWithProviders = (ui: React.ReactElement, initialPath = '/') => {
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

  describe('normalizeRoomCodeInput helper', () => {
    it('automatically prepends FEUD- to 4-character code', () => {
      expect(normalizeRoomCodeInput('8293')).toBe('FEUD-8293');
      expect(normalizeRoomCodeInput('abcd')).toBe('FEUD-ABCD');
    });

    it('preserves and uppercases full FEUD-XXXX codes', () => {
      expect(normalizeRoomCodeInput('feud-8293')).toBe('FEUD-8293');
      expect(normalizeRoomCodeInput('FEUD-JUQM')).toBe('FEUD-JUQM');
    });
  });

  describe('RoomJoinForm Component', () => {
    it('satisfies Scenario 4: renders room code and nickname inputs', () => {
      renderWithProviders(<RoomJoinForm />);

      expect(screen.getByTestId('join-room-code-input')).toBeInTheDocument();
      expect(screen.getByTestId('join-nickname-input')).toBeInTheDocument();
      expect(screen.getByTestId('join-form-submit-btn')).toHaveTextContent(/join game/i);
    });

    it('satisfies Scenario 4: blocks submission if room code format is invalid', async () => {
      const user = userEvent.setup();
      renderWithProviders(<RoomJoinForm />);

      const codeInput = screen.getByTestId('join-room-code-input');
      const nickInput = screen.getByTestId('join-nickname-input');
      const submitBtn = screen.getByTestId('join-form-submit-btn');

      // Invalid code
      await user.type(codeInput, 'INVALID');
      await user.type(nickInput, 'Alice');
      await user.click(submitBtn);

      expect(screen.getByTestId('join-form-error-banner')).toHaveTextContent(
        /invalid room code format/i
      );
    });

    it('satisfies Scenario 4: blocks submission if nickname is shorter than 2 characters', async () => {
      const user = userEvent.setup();
      renderWithProviders(<RoomJoinForm />);

      const codeInput = screen.getByTestId('join-room-code-input');
      const nickInput = screen.getByTestId('join-nickname-input');
      const submitBtn = screen.getByTestId('join-form-submit-btn');

      await user.type(codeInput, 'FEUD-8293');
      await user.type(nickInput, 'A');
      await user.click(submitBtn);

      expect(screen.getByTestId('join-form-error-banner')).toHaveTextContent(
        /please enter a nickname/i
      );
    });

    it('satisfies Scenario 4: accepts valid credentials and triggers submission callback', async () => {
      const user = userEvent.setup();
      const onJoinSubmittedMock = vi.fn();

      renderWithProviders(<RoomJoinForm onJoinSubmitted={onJoinSubmittedMock} />);

      const codeInput = screen.getByTestId('join-room-code-input');
      const nickInput = screen.getByTestId('join-nickname-input');
      const submitBtn = screen.getByTestId('join-form-submit-btn');

      // Enter 4-character code (auto normalized) and nickname
      await user.type(codeInput, '8293');
      await user.type(nickInput, 'Bob');
      await user.click(submitBtn);

      expect(onJoinSubmittedMock).toHaveBeenCalledWith({
        roomCode: 'FEUD-8293',
        nickname: 'Bob',
      });

      expect(sessionStorage.getItem('feud_nickname_FEUD-8293')).toBe('Bob');
    });
  });

  describe('HomePage Tab Switching (Scenario 4)', () => {
    it('switches between Host Game and Join Game forms via tab buttons', async () => {
      const user = userEvent.setup();
      renderWithProviders(<HomePage />);

      // Defaults to Host tab
      expect(screen.getByRole('button', { name: /create room/i })).toBeInTheDocument();
      expect(screen.queryByTestId('join-room-code-input')).not.toBeInTheDocument();

      // Click Join a Game tab
      const joinTabBtn = screen.getByTestId('tab-join-btn');
      await user.click(joinTabBtn);

      // Now shows Join form
      expect(screen.getByTestId('join-room-code-input')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /create room/i })).not.toBeInTheDocument();

      // Click Host a Game tab to switch back
      const hostTabBtn = screen.getByTestId('tab-host-btn');
      await user.click(hostTabBtn);

      expect(screen.getByRole('button', { name: /create room/i })).toBeInTheDocument();
    });
  });
});
