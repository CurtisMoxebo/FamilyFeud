import { useCallback, useEffect, useRef, useState } from 'react';

/** Minimum viewport height reduction (px) treated as a virtual soft-keyboard open event */
export const KEYBOARD_HEIGHT_THRESHOLD_PX = 120;

export interface VirtualKeyboardState {
  /** True when a mobile soft keyboard is detected obscuring part of the viewport */
  isKeyboardOpen: boolean;
  /** Estimated height (px) of the soft keyboard inset (0 when closed) */
  keyboardHeight: number;
  /** Currently visible viewport height (px) above the soft keyboard */
  viewportHeight: number;
  /** Safely scrolls a form or question card into the visible area above the keyboard */
  keepElementVisible: (element: HTMLElement | null) => void;
}

function isEditableElement(el: EventTarget | Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) {
    return false;
  }
  const tagName = el.tagName;
  if (tagName === 'TEXTAREA') {
    return !(el as HTMLTextAreaElement).readOnly && !(el as HTMLTextAreaElement).disabled;
  }
  if (tagName === 'INPUT') {
    const input = el as HTMLInputElement;
    if (input.readOnly || input.disabled) return false;
    const nonKeyboardTypes = new Set([
      'button',
      'checkbox',
      'color',
      'file',
      'hidden',
      'image',
      'radio',
      'range',
      'reset',
      'submit',
    ]);
    return !nonKeyboardTypes.has((input.type || 'text').toLowerCase());
  }
  return Boolean(el.isContentEditable);
}

/**
 * Mobile Virtual Soft-Keyboard Awareness Hook (US-22 Scenario 4).
 *
 * Tracks `window.visualViewport` (iOS Safari / Android Chrome) and layout `resize` +
 * focus transitions so mobile player controllers keep active questions, text inputs,
 * and Pass / Submit buttons visible above the soft keyboard without layout clipping.
 */
export function useVirtualKeyboard(): VirtualKeyboardState {
  const baselineHeightRef = useRef<number>(
    typeof window !== 'undefined' ? window.innerHeight : 0
  );
  const focusedRef = useRef<boolean>(
    typeof document !== 'undefined' && isEditableElement(document.activeElement)
  );

  const computeSnapshot = useCallback((focusedOverride?: boolean) => {
    if (typeof window === 'undefined') {
      return {
        isKeyboardOpen: false,
        keyboardHeight: 0,
        viewportHeight: 0,
      };
    }

    const activeFocused =
      typeof focusedOverride === 'boolean'
        ? focusedOverride
        : focusedRef.current ||
          (typeof document !== 'undefined' && isEditableElement(document.activeElement));

    const layoutHeight = window.innerHeight;
    if (!activeFocused && layoutHeight > baselineHeightRef.current) {
      baselineHeightRef.current = layoutHeight;
    }

    const vv = window.visualViewport;
    const visibleHeight = vv ? Math.round(vv.height) : layoutHeight;
    const offsetTop = vv ? Math.round(vv.offsetTop || 0) : 0;

    // 1. iOS Safari / VisualViewport overlay inset calculation
    const visualInset = vv ? Math.max(0, Math.round(layoutHeight - vv.height - offsetTop)) : 0;

    // 2. Android Chrome resizes-content calculation (layout innerHeight shrinks while focused)
    const baselineDrop = activeFocused
      ? Math.max(0, Math.round(baselineHeightRef.current - visibleHeight))
      : 0;

    const keyboardHeight = Math.max(visualInset, baselineDrop);

    const isCompressedMobileFocus =
      activeFocused && window.innerWidth <= 900 && visibleHeight > 0 && visibleHeight <= 500;

    const isKeyboardOpen =
      keyboardHeight >= KEYBOARD_HEIGHT_THRESHOLD_PX || isCompressedMobileFocus;

    return {
      isKeyboardOpen,
      keyboardHeight: isKeyboardOpen ? keyboardHeight : 0,
      viewportHeight: visibleHeight,
    };
  }, []);

  const [state, setState] = useState(() => computeSnapshot());

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    baselineHeightRef.current = Math.max(baselineHeightRef.current, window.innerHeight);

    const syncViewportState = (focusedOverride?: boolean) => {
      const next = computeSnapshot(focusedOverride);
      setState((prev) => {
        if (
          prev.isKeyboardOpen === next.isKeyboardOpen &&
          prev.keyboardHeight === next.keyboardHeight &&
          prev.viewportHeight === next.viewportHeight
        ) {
          return prev;
        }
        return next;
      });

      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.style.setProperty(
          '--visual-viewport-height',
          `${next.viewportHeight}px`
        );
        document.documentElement.style.setProperty(
          '--keyboard-inset-height',
          `${next.keyboardHeight}px`
        );
      }
    };

    const handleViewportResize = () => syncViewportState();
    const handleFocusIn = (e: FocusEvent) => {
      const editable = isEditableElement(e.target);
      focusedRef.current = editable;
      if (editable) {
        syncViewportState(true);
      }
    };
    const handleFocusOut = () => {
      focusedRef.current =
        typeof document !== 'undefined' && isEditableElement(document.activeElement);
      syncViewportState(focusedRef.current);
    };

    syncViewportState();

    window.addEventListener('resize', handleViewportResize);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', handleViewportResize);
      vv.addEventListener('scroll', handleViewportResize);
    }

    return () => {
      window.removeEventListener('resize', handleViewportResize);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      if (vv) {
        vv.removeEventListener('resize', handleViewportResize);
        vv.removeEventListener('scroll', handleViewportResize);
      }
    };
  }, [computeSnapshot]);

  const keepElementVisible = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    if (typeof element.scrollIntoView === 'function') {
      try {
        element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch {
        // Fallback for older browsers that only accept a boolean argument
        element.scrollIntoView(false);
      }
    }
  }, []);

  return {
    ...state,
    keepElementVisible,
  };
}

export default useVirtualKeyboard;
