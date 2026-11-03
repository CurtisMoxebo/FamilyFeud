import { useCallback, useEffect, useState } from 'react';

interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface WebkitHTMLElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

export interface UseFullscreenOptions {
  /**
   * When true, listens for the `F11` keyboard shortcut (outside editable inputs)
   * and toggles Fullscreen via the Fullscreen API (US-22 Scenario 1).
   */
  enableShortcut?: boolean;
}

export interface UseFullscreenResult {
  isFullscreen: boolean;
  isFullscreenSupported: boolean;
  enterFullscreen: () => Promise<boolean>;
  exitFullscreen: () => Promise<boolean>;
  toggleFullscreen: () => Promise<boolean>;
}

function getActiveFullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  const doc = document as WebkitDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function checkFullscreenSupport(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as WebkitDocument;
  const root = document.documentElement as WebkitHTMLElement | null;
  return Boolean(
    doc.fullscreenEnabled ||
      doc.webkitFullscreenEnabled ||
      typeof root?.requestFullscreen === 'function' ||
      typeof root?.webkitRequestFullscreen === 'function'
  );
}

/**
 * Reusable Fullscreen management hook for the Host TV Display (US-22 Scenario 1).
 * Supports standard Fullscreen API + WebKit fallbacks, event synchronization,
 * and optional `F11` keyboard shortcut toggling.
 */
export function useFullscreen(options: UseFullscreenOptions = {}): UseFullscreenResult {
  const { enableShortcut = false } = options;

  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    Boolean(getActiveFullscreenElement())
  );

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(getActiveFullscreenElement()));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const enterFullscreen = useCallback(async (): Promise<boolean> => {
    if (typeof document === 'undefined' || !document.documentElement) {
      return false;
    }

    const root = document.documentElement as WebkitHTMLElement;
    const requestFn =
      typeof root.requestFullscreen === 'function'
        ? root.requestFullscreen.bind(root)
        : typeof root.webkitRequestFullscreen === 'function'
        ? root.webkitRequestFullscreen.bind(root)
        : null;

    if (!requestFn) {
      return false;
    }

    try {
      await requestFn();
      setIsFullscreen(true);
      return true;
    } catch {
      setIsFullscreen(Boolean(getActiveFullscreenElement()));
      return false;
    }
  }, []);

  const exitFullscreen = useCallback(async (): Promise<boolean> => {
    if (typeof document === 'undefined') {
      return false;
    }

    const doc = document as WebkitDocument;
    const exitFn =
      typeof doc.exitFullscreen === 'function'
        ? doc.exitFullscreen.bind(doc)
        : typeof doc.webkitExitFullscreen === 'function'
        ? doc.webkitExitFullscreen.bind(doc)
        : null;

    if (!exitFn) {
      setIsFullscreen(false);
      return false;
    }

    try {
      await exitFn();
      setIsFullscreen(false);
      return true;
    } catch {
      setIsFullscreen(Boolean(getActiveFullscreenElement()));
      return false;
    }
  }, []);

  const toggleFullscreen = useCallback(async (): Promise<boolean> => {
    const currentlyActive = Boolean(getActiveFullscreenElement()) || isFullscreen;
    if (currentlyActive) {
      return exitFullscreen();
    }
    return enterFullscreen();
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  useEffect(() => {
    if (!enableShortcut || typeof window === 'undefined') return undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key !== 'F11' && e.code !== 'F11') return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      e.preventDefault();
      void toggleFullscreen();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enableShortcut, toggleFullscreen]);

  return {
    isFullscreen,
    isFullscreenSupported: checkFullscreenSupport(),
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
  };
}

export default useFullscreen;

