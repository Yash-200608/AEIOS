import { createContext, useContext, type ReactNode } from 'react';
import { LazyMotion, domMax } from 'motion/react';

/*
 * Provides Motion's feature bundle (domMax, loaded synchronously: the shell's sliding rail bar and site thumb are layout animations) and tells descendants that `m` components
 * will animate. Components that animate (MorphStateLabel) fall back to plain markup when this is absent.
 */
const Ready = createContext(false);
export const useMotionReady = () => useContext(Ready);

export default function MotionReady({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax}>
      <Ready.Provider value={true}>{children}</Ready.Provider>
    </LazyMotion>
  );
}
