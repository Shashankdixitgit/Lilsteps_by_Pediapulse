// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // New in eslint-config-expo 57 (react-hooks v7). Existing effects that
    // reset/sync state are intentional; flag them without failing lint.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
