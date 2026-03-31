"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  SessionProvider,
  useSession,
  signIn as nextAuthSignIn,
  signOut as nextAuthSignOut,
} from "next-auth/react";

interface AuthState {
  session: ReturnType<typeof useSession>["data"];
  status: "loading" | "authenticated" | "unauthenticated";
  signIn: (provider?: string, options?: { callbackUrl?: string }) => void;
  signOut: (options?: { callbackUrl?: string }) => void;
}

const AuthContext = createContext<AuthState>({
  session: null,
  status: "loading",
  signIn: () => {},
  signOut: () => {},
});

function AuthInner({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  return (
    <AuthContext.Provider
      value={{
        session,
        status,
        signIn: (provider, options) => nextAuthSignIn(provider, options),
        signOut: (options) => nextAuthSignOut(options),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AuthInner>{children}</AuthInner>
    </SessionProvider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
