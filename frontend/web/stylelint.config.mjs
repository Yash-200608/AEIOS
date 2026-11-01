// Stylelint for new motion-phase CSS. stylelint-config-standard, relaxed where it fights the established token style
// (BEM-ish `cc-x__y--z` classes, `--aeios-*` tokens, dense one-line rule blocks, rgb()/hsl() with legacy notation).
/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  rules: {
    'selector-class-pattern': null,
    'custom-property-pattern': null,
    'keyframes-name-pattern': null,
    'declaration-block-single-line-max-declarations': null,
    // The token style packs related one-line rules together, without blank lines between them.
    'rule-empty-line-before': null,
    'at-rule-empty-line-before': null,
    'comment-empty-line-before': null,
    'no-descending-specificity': null,
    'color-function-notation': null,
    'alpha-value-notation': null,
    // Font family names (e.g. "IBM Plex Mono", Inter) keep their own case.
    'value-keyword-case': ['lower', { ignoreProperties: ['font-family', 'font', '/^--/'] }],
  },
};
