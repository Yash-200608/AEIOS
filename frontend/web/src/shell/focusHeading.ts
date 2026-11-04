/*
 * Moves keyboard and screen-reader focus to a view's heading without scrolling: the ViewHero title ([data-view-heading]) or,
 * on the Overview, the situation statement (its <h1>). A heading that is not focusable gets tabindex="-1" (programmatic focus
 * only; it never joins the Tab order). Returns false when the view has no heading yet.
 */
export function focusViewHeading(root: ParentNode | null | undefined): boolean {
  if (!root) return false;
  const heading = root.querySelector<HTMLElement>('[data-view-heading]') ?? root.querySelector<HTMLElement>('h1');
  if (!heading) return false;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
  return true;
}
