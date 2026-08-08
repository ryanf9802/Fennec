const defaultMaximum = 10;

function propertyName(node) {
  if (!node || node.computed) return undefined;
  if (node.key.type === 'Identifier') return node.key.name;
  if (node.key.type === 'Literal') return String(node.key.value);
  return undefined;
}

function exportedAnchor(node) {
  return node.parent?.type === 'ExportNamedDeclaration' ||
    node.parent?.type === 'ExportDefaultDeclaration'
    ? node.parent
    : node;
}

/**
 * Resolves a durable name and declaration anchor for documentable functions.
 * Anonymous callbacks are intentionally omitted because their surrounding API
 * call is a more useful place for an explanatory comment.
 */
function documentedFunction(node) {
  if (node.type === 'FunctionDeclaration' && node.id) {
    return { name: node.id.name, anchor: exportedAnchor(node) };
  }

  if (node.type === 'FunctionExpression' && node.id) {
    return { name: node.id.name, anchor: node };
  }

  const parent = node.parent;
  if (
    parent?.type === 'VariableDeclarator' &&
    parent.init === node &&
    parent.id.type === 'Identifier'
  ) {
    const declaration = parent.parent;
    return {
      name: parent.id.name,
      anchor:
        declaration?.type === 'VariableDeclaration'
          ? exportedAnchor(declaration)
          : parent,
    };
  }

  if (parent?.type === 'MethodDefinition' && parent.value === node) {
    const name = propertyName(parent);
    return name ? { name, anchor: parent } : undefined;
  }

  if (parent?.type === 'Property' && parent.value === node) {
    const name = propertyName(parent);
    return name ? { name, anchor: parent } : undefined;
  }

  return undefined;
}

function attachedJsdoc(sourceCode, anchor) {
  const comment = sourceCode.getCommentsBefore(anchor).at(-1);
  if (!comment || comment.type !== 'Block' || !comment.value.startsWith('*'))
    return undefined;

  const gap = sourceCode.text.slice(comment.range[1], anchor.range[0]);
  return /\n\s*\n/.test(gap) ? undefined : comment;
}

function hasSummary(comment) {
  const lines = comment.value
    .slice(1)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*?\s?/, '').trim());
  const firstTag = lines.findIndex((line) => line.startsWith('@'));
  const summary = lines
    .slice(0, firstTag === -1 ? undefined : firstTag)
    .join(' ')
    .trim();
  return summary.length > 0;
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require explanatory JSDoc for named functions above a complexity threshold',
    },
    schema: [
      {
        type: 'object',
        properties: { max: { type: 'integer', minimum: 0 } },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ max: defaultMaximum }],
    messages: {
      missing:
        "Function '{{name}}' has cyclomatic complexity {{complexity}} (maximum without documentation: {{max}}) and requires explanatory JSDoc.",
      summary:
        "The JSDoc for complex function '{{name}}' must include explanatory prose, not only tags.",
    },
  },

  create(context) {
    const maximum = context.options[0]?.max ?? defaultMaximum;
    const sourceCode = context.sourceCode;
    const complexities = [];

    function increaseComplexity() {
      const current = complexities.at(-1);
      if (current) current.value += 1;
    }

    return {
      onCodePathStart(codePath, node) {
        complexities.push({ codePath, node, value: 1 });
      },
      CatchClause: increaseComplexity,
      ConditionalExpression: increaseComplexity,
      LogicalExpression: increaseComplexity,
      ForStatement: increaseComplexity,
      ForInStatement: increaseComplexity,
      ForOfStatement: increaseComplexity,
      IfStatement: increaseComplexity,
      WhileStatement: increaseComplexity,
      DoWhileStatement: increaseComplexity,
      AssignmentPattern: increaseComplexity,
      'SwitchCase[test]': increaseComplexity,
      AssignmentExpression(node) {
        if (['&&=', '||=', '??='].includes(node.operator)) increaseComplexity();
      },
      MemberExpression(node) {
        if (node.optional === true) increaseComplexity();
      },
      CallExpression(node) {
        if (node.optional === true) increaseComplexity();
      },
      onCodePathEnd(codePath) {
        const current = complexities.pop();
        if (
          !current ||
          current.codePath !== codePath ||
          codePath.origin !== 'function'
        )
          return;
        if (current.value <= maximum) return;

        const functionInfo = documentedFunction(current.node);
        if (!functionInfo) return;

        const jsdoc = attachedJsdoc(sourceCode, functionInfo.anchor);
        if (!jsdoc) {
          context.report({
            node: functionInfo.anchor,
            messageId: 'missing',
            data: {
              name: functionInfo.name,
              complexity: current.value,
              max: maximum,
            },
          });
          return;
        }

        if (!hasSummary(jsdoc)) {
          context.report({
            node: jsdoc,
            messageId: 'summary',
            data: { name: functionInfo.name },
          });
        }
      },
    };
  },
};
