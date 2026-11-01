/*
 * Motion tokens for JS animation engines (seconds). They mirror the CSS tokens in tokens.css (--aeios-dur-*, --aeios-ease)
 * so CSS, Motion and GSAP feel like one system. Spec: docs/design/ANIMATION_ARCHITECTURE.md.
 */
export const motionTokens = {
  duration: { instant: 0.12, fast: 0.18, standard: 0.32, reveal: 0.42, sequence: 0.72 },
  // Same curve as --aeios-ease: decisive start, quiet settle. No bounce or overshoot on a scientific instrument.
  ease: {
    standard: [0.2, 0, 0, 1] as const,
    enter: [0.16, 1, 0.3, 1] as const,
    exit: [0.4, 0, 1, 1] as const,
  },
  stagger: { compact: 0.045, standard: 0.075 },
  distance: { reveal: 12, small: 8 },
} as const;

/** The Mission Reveal schedule (seconds from mount). The situation statement is never delayed. */
export const revealSchedule = {
  currency: 0.08,
  assessment: 0.18,
  evidence: 0.32,
  telemetry: 0.46,
  outlook: 0.62,
} as const;

/** GSAP easing names equivalent to the token curves (Lab only). */
export const gsapEase = { standard: 'power2.out', enter: 'expo.out', exit: 'power2.in' } as const;
