// ESLint flat config — Phase 0 tooling.
//
// Requires devDependencies before first run:
//   npm i -D eslint @eslint/js typescript-eslint
// Then add to package.json scripts: "lint": "eslint ."
// (Not wired into CI yet — enable after the first clean pass.)
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/', 'node_modules/', 'resources/', 'textures_placeholder/', 'public/data/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Agent-generated code tends to swallow errors silently — keep them visible.
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
);
