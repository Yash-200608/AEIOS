/*
 * The ONLY place GSAP is imported (development-only Motion Lab). GSAP's "Standard no-charge" licence is not yet approved for
 * production, so no file outside src/motion-lab may import gsap, gsap/* or @gsap/react (docs/design/ANIMATION_ARCHITECTURE.md).
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

export { gsap, ScrollTrigger, useGSAP };
