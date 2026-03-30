"use client";

import { createContext, useContext, type ReactNode } from "react";
import { SessionProvider, useSession, signIn as nextAuthSignIn, signOut as nextAuthSignOut } from "next-auth/react";
import { MOCK_SESSION } from "./auth-mock";

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

interface AuthState {
  session: typeof MOCK_SESSION | null;
  status: "loading" | "authenticated" | "unauthenticated";
  signIn: (provider?: string, options?: { callbackUrl?: string }) => void;
  signOut: (options?: { callbackUrl?: string }) => void;
}

const MockAuthContext = createContext<AuthState>({
  session: MOCK_SESSION,
  status: "authenticated",
  signIn: () => {},
  signOut: () => {},
});

function MockAuthProvider({ children }: { children: ReactNode }) {
  return (
    <MockAuthContext.Provider
      value={{
        session: MOCK_SESSION,
        status: "authenticated",
        signIn: () => {},
        signOut: () => {},
      }}
    >
      {children}
    </MockAuthContext.Provider>
  );
}

function RealAuthInner({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (IS_MOCK) {
    return <MockAuthProvider>{children}</MockAuthProvider>;
  }
  return (
    <SessionProvider>
      <RealAuthInner>{children}</RealAuthInner>
    </SessionProvider>
  );
}

function useRealAuth(): AuthState {
  const { data: session, status } = useSession();
  return {
    session: session as AuthState["session"],
    status,
    signIn: (provider?: string, options?: { callbackUrl?: string }) => {
      nextAuthSignIn(provider, options);
    },
    signOut: (options?: { callbackUrl?: string }) => {
      nextAuthSignOut(options);
    },
  };
}

export function useAuth(): AuthState {
  const mockCtx = useContext(MockAuthContext);

  if (IS_MOCK) {
    return mockCtx;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useRealAuth();
}
