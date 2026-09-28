import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('mobile API calls retain the server /api namespace', () => {
    const invalid: string[] = [];
    function visitDirectory(directory: string) {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = resolve(directory, entry.name);
            if (entry.isDirectory()) visitDirectory(path);
            else if (/\.tsx?$/.test(path)) {
                const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
                function visit(node: ts.Node) {
                    if (ts.isCallExpression(node) && node.expression.getText(source) === 'apiRequest') {
                        const arg = node.arguments[0];
                        const value = arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))
                            ? arg.text : arg && ts.isTemplateExpression(arg) ? arg.head.text : null;
                        if (value !== null && !value.startsWith('/api/')) invalid.push(`${path}: ${value}`);
                    }
                    ts.forEachChild(node, visit);
                }
                visit(source);
            }
        }
    }
    visitDirectory(resolve('..', 'mobile', 'src'));
    visitDirectory(resolve('..', 'mobile', 'app'));
    expect(invalid).toEqual([]);
});
