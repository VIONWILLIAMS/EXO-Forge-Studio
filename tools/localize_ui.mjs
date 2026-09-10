// One-time source migration. Keeps React state and canonical model data intact.
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceFiles = fs.readdirSync('src/components').filter(f => f.endsWith('.tsx') && f !== 'LanguageSwitch.tsx').map(f => `src/components/${f}`);
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const chinese = /[\u3400-\u9fff]/u;
const inventory = new Map();
const add = (s, file) => { s = s.trim(); if (!s || !/\p{L}/u.test(s)) return; const row = inventory.get(s) ?? { source: s, files: [] }; if (!row.files.includes(file)) row.files.push(file); inventory.set(s, row); };
const templateText = n => n.head.text + n.templateSpans.map((s, i) => `{${i}}${s.literal.text}`).join('');
const jsxText = n => n.text.includes('\n') ? n.text.replace(/\s+/g, ' ').trim() : n.text;

for (const sf of program.getSourceFiles().filter(f => /\/src\//.test(f.fileName) && !/\/i18n\//.test(f.fileName))) {
  function collect(n) {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && chinese.test(n.text)) add(n.text, sf.fileName);
    if (ts.isTemplateExpression(n) && chinese.test(templateText(n))) add(templateText(n), sf.fileName);
    if (ts.isJsxText(n)) add(jsxText(n), sf.fileName);
    ts.forEachChild(n, collect);
  }
  collect(sf);
}
for (const file of ['public/assets/v04/assembly.json', 'public/assets/exo-design-config.v0.1.json']) {
  const collect = value => { if (typeof value === 'string' && chinese.test(value)) add(value, file); else if (value && typeof value === 'object') Object.values(value).forEach(collect); };
  collect(JSON.parse(fs.readFileSync(file, 'utf8')));
}

if (process.argv.includes('--apply')) for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes("from '../i18n'")) continue;
  const sf = program.getSourceFile(path.resolve(file));
  const edits = [];
  const replace = (n, text) => edits.push([n.getStart(sf), n.getEnd(), text]);
  const wrap = n => ts.isTemplateExpression(n) && chinese.test(templateText(n))
    ? `tr(${JSON.stringify(templateText(n))}, [${n.templateSpans.map(s => s.expression.getText(sf)).join(', ')}])`
    : `tr(${n.getText(sf)})`;
  const hasString = type => Boolean(type.flags & ts.TypeFlags.StringLike) || (type.isUnion() && type.types.some(t => Boolean(t.flags & ts.TypeFlags.StringLike)));
  function visit(n) {
    if (ts.isFunctionDeclaration(n) && n.body && /^[A-Z]/.test(n.name?.text ?? '')) edits.push([n.body.getStart(sf) + 1, n.body.getStart(sf) + 1, '\n  useLocale();']);
    if (ts.isJsxText(n) && /\p{L}/u.test(n.text)) { edits.push([n.pos, n.end, `{tr(${JSON.stringify(jsxText(n))})}`]); return; }
    if (ts.isJsxAttribute(n)) {
      const name = n.name.getText(sf);
      if (['aria-label', 'aria-description', 'aria-valuetext', 'title', 'placeholder', 'alt'].includes(name) && n.initializer) {
        if (ts.isStringLiteral(n.initializer)) { add(n.initializer.text, file); replace(n.initializer, `{tr(${JSON.stringify(n.initializer.text)})}`); return; }
        if (ts.isJsxExpression(n.initializer) && n.initializer.expression) { replace(n.initializer.expression, wrap(n.initializer.expression)); return; }
      }
      return; // Values, keys, test IDs and custom component props remain canonical.
    }
    if (ts.isJsxExpression(n) && n.expression && hasString(checker.getTypeAtLocation(n.expression))) {
      if (n.expression.getText(sf).trim() !== "' '" && n.expression.getText(sf).trim() !== '" "') replace(n.expression, wrap(n.expression));
      // Nested JSX still needs translating; exclude children already covered by the replacement.
      return;
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
  let output = source;
  for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) output = output.slice(0, start) + text + output.slice(end);
  if (edits.length) output = "import { tr, useLocale } from '../i18n';\n" + output;
  fs.writeFileSync(file, output);
}
fs.writeFileSync('output/v04/i18n-2026-09-08/messages.json', JSON.stringify([...inventory.values()], null, 2));
console.log(`${inventory.size} distinct source messages inventoried.`);
