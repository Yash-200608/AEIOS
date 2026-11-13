/* Whether the deck's boot sequence (the globe's fly-in) plays: once per browser session, never under reduced motion. */
export const BOOT_SESSION_KEY = 'aeios:deck-boot:v1';

export function shouldBoot(seen: boolean, reduced: boolean): boolean {
  return !seen && !reduced;
}

export function bootSeen(): boolean {
  try {
    return window.sessionStorage.getItem(BOOT_SESSION_KEY) === 'done';
  } catch {
    return false; // storage blocked: play the boot
  }
}

export function rememberBoot(): void {
  try {
    window.sessionStorage.setItem(BOOT_SESSION_KEY, 'done');
  } catch {
    /* storage blocked: the boot may play again on the next visit */
  }
}
