// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // tests/deno runs under Deno with stubbed imports (see its import_map.json).
    ignores: ['dist/*', 'tests/deno/*'],
  },
  {
    // New in eslint-config-expo 57 (react-hooks v7). Existing effects that
    // reset/sync state are intentional; flag them without failing lint.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
