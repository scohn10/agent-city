'use client';

// Account state for the app. Works with Clerk when configured, a cookie stand-in for local tests,
// or not at all (signed-out only) when neither is set up.

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth, useClerk, UserButton } from '@clerk/nextjs';

const AccountCtx = createContext({ me: { loaded: false }, signIn: () => {}, signOut: () => {}, refresh: () => {} });

export function useAccount() {
  return useContext(AccountCtx);
}

function ClerkBridge({ onChange, setActions }) {
  const { isLoaded, userId } = useAuth();
  const clerk = useClerk();
  useEffect(() => { if (isLoaded) onChange(); }, [isLoaded, userId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setActions({
      signIn: () => clerk.openSignIn({ forceRedirectUrl: window.location.href }),
      signOut: () => clerk.signOut(),
    });
  }, [clerk, setActions]);
  return null;
}

export function AccountProvider({ clerk, children }) {
  const [me, setMe] = useState({ loaded: false, auth: false, sync: false, signedIn: false, id: null });
  const [version, setVersion] = useState(0);
  const [actions, setActions] = useState(null);
  const bump = useRef(() => setVersion(v => v + 1)).current;

  useEffect(() => {
    let live = true;
    fetch('/api/me', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (live) setMe({ ...d, loaded: true }); })
      .catch(() => { if (live) setMe(m => ({ ...m, loaded: true })); });
    return () => { live = false; };
  }, [version]);

  // Without Clerk (local tests), "signing in" sets a test cookie.
  const testSignIn = () => { document.cookie = 'test_user=tester; path=/; SameSite=Lax'; bump(); };
  const testSignOut = () => { document.cookie = 'test_user=; path=/; Max-Age=0'; bump(); };

  const value = {
    me,
    refresh: bump,
    signIn: () => (actions?.signIn ? actions.signIn() : testSignIn()),
    signOut: () => (actions?.signOut ? actions.signOut() : testSignOut()),
    clerk,
  };

  return (
    <AccountCtx.Provider value={value}>
      {clerk && <ClerkBridge onChange={bump} setActions={setActions} />}
      {children}
    </AccountCtx.Provider>
  );
}

export function AccountButton() {
  const { me, signIn, signOut, clerk } = useAccount();
  if (!me.loaded || !me.auth) return null;
  if (!me.signedIn) return <button className="ghost signin" onClick={signIn}>Sign in</button>;
  if (clerk) return <span className="userbtn"><UserButton /></span>;
  return <button className="ghost signin" onClick={signOut} title="Sign out">{me.id} · Sign out</button>;
}
