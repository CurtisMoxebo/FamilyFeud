import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface RouterContextType {
  path: string;
  navigate: (to: string) => void;
  params: Record<string, string>;
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

export interface RouterProviderProps {
  children: ReactNode;
  initialPath?: string;
}

/**
 * Extracts route parameters from a pattern like "/host/:roomCode"
 */
export function matchRoute(pattern: string, actualPath: string): Record<string, string> | null {
  const patternSegments = pattern.split('/').filter(Boolean);
  const actualSegments = actualPath.split('/').filter(Boolean);

  if (patternSegments.length !== actualSegments.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternSegments.length; i++) {
    const patternPart = patternSegments[i];
    const actualPart = actualSegments[i];

    if (patternPart.startsWith(':')) {
      const paramName = patternPart.slice(1);
      params[paramName] = actualPart;
    } else if (patternPart.toLowerCase() !== actualPart.toLowerCase()) {
      return null;
    }
  }

  return params;
}

export const RouterProvider: React.FC<RouterProviderProps> = ({
  children,
  initialPath,
}) => {
  const [currentPath, setCurrentPath] = useState<string>(
    initialPath ?? (typeof window !== 'undefined' ? window.location.pathname : '/')
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (to: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', to);
    }
    setCurrentPath(to);
  };

  return (
    <RouterContext.Provider value={{ path: currentPath, navigate, params: {} }}>
      {children}
    </RouterContext.Provider>
  );
};

export const useRouter = (): RouterContextType => {
  const context = useContext(RouterContext);
  if (!context) {
    return {
      path: typeof window !== 'undefined' ? window.location.pathname : '/',
      navigate: (to: string) => {
        if (typeof window !== 'undefined') {
          window.history.pushState({}, '', to);
        }
      },
      params: {},
    };
  }
  return context;
};

