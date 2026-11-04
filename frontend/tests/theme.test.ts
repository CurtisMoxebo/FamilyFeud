import { describe, it, expect, vi } from 'vitest';
import tailwindConfig from '../tailwind.config.js';
import indexHtml from '../index.html?raw';

describe('Frontend Regression Suite: Game Show Theme, Viewport & Safe-Area Tokens (US-01 & US-22)', () => {
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

  it('satisfies US-22: defines safe-area spacing, >=48px touch tokens, and 1080p/4K TV breakpoints', () => {
    const extend = tailwindConfig.theme?.extend as Record<string, any>;
    expect(extend.spacing['safe-top']).toBe('env(safe-area-inset-top, 0px)');
    expect(extend.spacing['safe-bottom']).toBe('env(safe-area-inset-bottom, 0px)');
    expect(extend.spacing['safe-left']).toBe('env(safe-area-inset-left, 0px)');
    expect(extend.spacing['safe-right']).toBe('env(safe-area-inset-right, 0px)');
    expect(extend.spacing['touch']).toBe('48px');
    expect(extend.minHeight['touch']).toBe('48px');
    expect(extend.minWidth['touch']).toBe('48px');
    expect(extend.minHeight['dvh']).toBe('100dvh');
    expect(extend.screens['3xl']).toBe('1920px');
    expect(extend.screens['4k']).toBe('2560px');
  });

  it('satisfies US-22 Technical Specs: configures mobile viewport meta tag and safe-area Tailwind utilities', () => {
    expect(indexHtml).toContain('width=device-width');
    expect(indexHtml).toContain('initial-scale=1.0');
    expect(indexHtml).toContain('maximum-scale=1.0');
    expect(indexHtml).toContain('user-scalable=no');
    expect(indexHtml).toContain('viewport-fit=cover');
    expect(indexHtml).toContain('overflow-x-hidden');

    const plugins = tailwindConfig.plugins ?? [];
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThan(0);

    const addUtilities = vi.fn();
    const registerPlugin = plugins[0] as unknown as (api: {
      addUtilities: typeof addUtilities;
    }) => void;
    registerPlugin({ addUtilities });

    expect(addUtilities).toHaveBeenCalledTimes(1);
    const registered = addUtilities.mock.calls[0][0] as Record<string, any>;
    expect(registered['.pt-safe']).toEqual({ paddingTop: 'env(safe-area-inset-top, 0px)' });
    expect(registered['.pb-safe']).toEqual({ paddingBottom: 'env(safe-area-inset-bottom, 0px)' });
    expect(registered['.px-safe']).toEqual({
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
    });
    expect(registered['.touch-target']).toEqual({
      minHeight: '48px',
      minWidth: '48px',
      touchAction: 'manipulation',
    });
  });
});
