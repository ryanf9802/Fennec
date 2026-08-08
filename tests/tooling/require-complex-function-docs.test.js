import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import requireComplexFunctionDocs from '../../scripts/eslint-rules/require-complex-function-docs.js';

function lint(source, max = 2) {
  const linter = new Linter({ configType: 'flat' });
  return linter.verify(
    source,
    {
      languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
      plugins: {
        local: {
          rules: {
            'require-complex-function-docs': requireComplexFunctionDocs,
          },
        },
      },
      rules: {
        'local/require-complex-function-docs': ['error', { max }],
      },
    },
    'fixture.js',
  );
}

describe('require-complex-function-docs', () => {
  it('allows named functions at the complexity threshold', () => {
    expect(
      lint('function choose(value) { if (value) return 1; return 0; }'),
    ).toEqual([]);
  });

  it('requires documentation above the threshold', () => {
    const messages = lint(
      'function choose(value) { if (value && ready) return 1; return 0; }',
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      ruleId: 'local/require-complex-function-docs',
      messageId: 'missing',
    });
    expect(messages[0].message).toContain(
      "Function 'choose' has cyclomatic complexity 3",
    );
  });

  it('accepts explanatory JSDoc on an exported declaration', () => {
    const source = `
      /** Selects the first ready value while preserving the empty fallback. */
      export function choose(value) { if (value && ready) return 1; return 0; }
    `;

    expect(lint(source)).toEqual([]);
  });

  it('rejects empty and tag-only JSDoc', () => {
    const empty = lint(
      '/** */\nfunction choose(value) { if (value && ready) return 1; return 0; }',
    );
    const tags = lint(
      '/** @returns {number} */\nfunction choose(value) { if (value && ready) return 1; return 0; }',
    );
    const continuedTag = lint(`
      /**
       * @param value
       *   Value to inspect.
       */
      function choose(value) { if (value && ready) return 1; return 0; }
    `);

    expect(empty[0]).toMatchObject({ messageId: 'summary' });
    expect(tags[0]).toMatchObject({ messageId: 'summary' });
    expect(continuedTag[0]).toMatchObject({ messageId: 'summary' });
  });

  it('enforces named arrow functions and object methods', () => {
    const arrows = lint('const choose = (value) => value && ready ? 1 : 0;');
    const methods = lint(
      'const service = { choose(value) { return value && ready ? 1 : 0; } };',
    );

    expect(arrows[0]).toMatchObject({ messageId: 'missing' });
    expect(methods[0]).toMatchObject({ messageId: 'missing' });
  });

  it('enforces class methods', () => {
    const messages = lint(
      'class Service { choose(value) { return value && ready ? 1 : 0; } }',
    );

    expect(messages[0]).toMatchObject({ messageId: 'missing' });
  });

  it('ignores anonymous callbacks', () => {
    expect(lint('values.map((value) => value && ready ? 1 : 0);')).toEqual([]);
  });

  it('isolates nested function complexity from its documented parent', () => {
    const source = `
      /** Chooses a ready nested value. */
      function outer() {
        /** Applies the nested selection rules. */
        const nested = (value) => value && ready ? 1 : 0;
        return nested(input);
      }
    `;

    expect(lint(source)).toEqual([]);
  });
});
