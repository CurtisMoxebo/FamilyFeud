import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('Frontend Regression Suite: Main App Landing Page', () => {
  it('renders the game show header and AI badge', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: /family feud/i })).toBeInTheDocument();
    expect(screen.getByText(/powered by google gemini ai/i)).toBeInTheDocument();
    expect(
      screen.getByText(/multiplayer game show & real-time duel/i)
    ).toBeInTheDocument();
  });

  it('renders the WebSocket connection card', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 2, name: /websocket engine/i })).toBeInTheDocument();
  });

  it('renders the Host TV display card with launch button', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 3, name: /host tv board/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /launch host screen/i })).toBeInTheDocument();
  });

  it('renders the Player Controller card with join button', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 3, name: /player controller/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join game room/i })).toBeInTheDocument();
  });

  it('renders the application footer', () => {
    render(<App />);

    expect(
      screen.getByText(/family feud ai showdown • fast money & main game modes • real-time socket.io sync/i)
    ).toBeInTheDocument();
  });
});
