import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * ESLint configuration.
 *
 * Beyond the Next.js defaults, this enforces two project-specific invariants
 * that protect the database layer — see the `no-restricted-syntax` block.
 */
const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts', 'storage-uploads/**'],
  },
  {
    rules: {
      // Unused bindings are a real signal; an underscore prefix is the escape.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // `any` erases the type safety the rest of the codebase depends on.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          /**
           * SQL injection guard. Every query goes through postgres.js tagged
           * templates, which parameterise interpolations. `sql.unsafe()`
           * bypasses that, so it is banned in application code — only the
           * migration runner, which must execute whole files, may use it.
           */
          selector: "MemberExpression[property.name='unsafe'][object.name=/^(sql|tx|db)$/]",
          message:
            'sql.unsafe() bypasses parameterisation. Use a tagged template — interpolations are parameterised automatically.',
        },
        {
          /**
           * jsonb double-encoding guard. postgres.js serialises jsonb
           * parameters itself, so `${JSON.stringify(x)}::jsonb` stores a JSON
           * string rather than an object. Use the `json()` helper instead.
           */
          selector:
            "TaggedTemplateExpression[tag.name=/^(sql|tx|db)$/] CallExpression[callee.object.name='JSON'][callee.property.name='stringify']",
          message:
            'Do not JSON.stringify into a SQL template. Use the `json()` helper from @/lib/db/client.',
        },
      ],
    },
  },
];

export default config;
