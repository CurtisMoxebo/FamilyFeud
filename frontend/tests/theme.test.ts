import { describe, it, expect } from 'vitest';
import tailwindConfig from '../tailwind.config.js';

describe('Frontend Regression Suite: Game Show Theme & Design Tokens', () => {
  it('defines the required game show color palette', () => {
    const colors = tailwindConfig.theme?.extend?.colors as Record<string, any> | undefined;
    const feud = colors?.feud;
    expect(feud).toBeDefined();

    // Verify Blue palette
    expect(feud.blue.DEFAULT).toBe('#0d2568');
    expect(feud.blue.dark).toBe('#081742');

    // Verify Gold palette
    expect(feud.gold.DEFAULT).toBe('#f59e0b');
    expect(feud.gold.light).toBe('#fbbf24');

    // Verify Red palette
    expect(feud.red.DEFAULT).toBe('#dc2626');

    // Verify Slate palette
    expect(feud.slate.DEFAULT).toBe('#0f172a');
  });

  it('defines custom game show animations', () => {
    const animations = tailwindConfig.theme?.extend?.animation as Record<string, any> | undefined;
    expect(animations).toBeDefined();
    expect(animations?.['card-flip']).toBeDefined();
    expect(animations?.['buzzer-pulse']).toBeDefined();
    expect(animations?.['strike-shake']).toBeDefined();
  });
});

