import { createContext, useContext, type ReactNode } from 'react';
import { LazyMotion, domAnimation } from 'motion/react';

/*
 * Provides Motion's feature bundle (the small domAnimation set, loaded synchronously) and tells descendants that `m` components
 * will animate. Components that animate (MorphStateLabel) fall back to plain markup when this is absent.
 */
const Ready = createContext(false);
export const useMotionReady = () => useContext(Ready);

export default function MotionReady({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <Ready.Provider value={true}>{children}</Ready.Provider>
    </LazyMotion>
  );
}
