// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  // ── Guard rails (class audit 8/6) ──────────────────────────────────────────
  // ① i18n: bare tf() is BANNED in .tsx — render-path tf() is subscribed-but-
  //   cached (the community stale-locale class, 79 back-swept siblings).
  //   Render paths use tfIn(lang, …); genuinely imperative sites (Alert
  //   bodies, share sheets — fire-time reads) carry an inline disable with
  //   the reason. HONEST LIMITS: this rule cannot catch bare t() in render
  //   (t is legitimate imperative and the two are syntactically identical),
  //   missing useT anchors, or a tfIn whose `lang` is stale in a useCallback
  //   — those remain convention + review. It catches exactly the tf class.
  // ② MapView: `&&` children and Fragments inside <MapView> are BANNED —
  //   the AIRMap insertReactSubview nil class (P1, 8/3): non-boolean leaks
  //   and interop children-walk wrappers. Currently zero instances; this
  //   fossilizes the sweep so future MapView consumers can't regress it.
  {
    files: ['**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='tf']",
          message: 'Bare tf() in .tsx: render paths must use tfIn(lang, …) — the compiler caches tf() on its visible args and strands the old locale (stale-locale class, 8/6). If this call is genuinely imperative (Alert/handler fire-time), add an inline eslint-disable with the reason.',
        },
        {
          selector: "JSXElement[openingElement.name.name='MapView'] > JSXExpressionContainer > LogicalExpression[operator='&&']",
          message: '&& child inside <MapView>: a non-boolean leak becomes a native nil insert under new-arch interop (AIRMap P1 class, 8/3). Use a ternary-to-null.',
        },
        {
          selector: "JSXElement[openingElement.name.name='MapView'] > JSXFragment",
          message: 'Fragment inside <MapView>: an unexpected wrapper in the interop children-walk is a nil-insert candidate (AIRMap P1 class, 8/3). Decompose to sibling conditionals.',
        },
      ],
    },
  },
]);
