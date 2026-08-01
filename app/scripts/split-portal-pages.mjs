import fs from 'fs';
import path from 'path';

function extractTopLevelFns(src) {
  const lines = src.split(/\r?\n/);
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(export )?(async )?function ([A-Za-z0-9_]+)/);
    if (m) {
      items.push({ line: i, name: m[3], exported: !!m[1], kind: 'function' });
    } else if (/^export \{/.test(lines[i])) {
      items.push({ line: i, name: lines[i].trim(), exported: true, kind: 'reexport', text: lines[i] });
    }
  }
  for (const item of items) {
    if (item.kind === 'reexport') {
      item.endLine = item.line;
      continue;
    }
    let depth = 0;
    let started = false;
    for (let j = item.line; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') {
          depth++;
          started = true;
        } else if (ch === '}') depth--;
      }
      if (started && depth === 0) {
        item.endLine = j;
        break;
      }
    }
    if (item.endLine == null) throw new Error(`No end for ${item.name}`);
  }
  return { lines, items };
}

function importBlock(lines, firstFnLine) {
  let end = firstFnLine;
  while (end > 0 && lines[end - 1].trim() === '') end--;
  return lines.slice(0, end).filter((l) => !/^export \{/.test(l));
}

function bumpImportPath(line) {
  const m = line.match(/from ['"](\.\.?\/[^'"]+)['"]/);
  if (!m) return line;
  const p = m[1];
  if (p.startsWith('../')) {
    return line.replace(p, `../${p}`);
  }
  return line;
}

function splitPortal(filePath, outDir) {
  const src = fs.readFileSync(filePath, 'utf8');
  const { lines, items } = extractTopLevelFns(src);
  const firstFn = items.find((i) => i.kind === 'function');
  if (!firstFn) throw new Error(`No functions in ${filePath}`);
  const imports = importBlock(lines, firstFn.line).map(bumpImportPath);
  // Drop ProfileSecurityPage import from per-page files if present — profile is barrel-only
  const pageImports = imports.filter((l) => !l.includes('ProfileSecurityPage'));

  fs.mkdirSync(outDir, { recursive: true });

  const useBizItem = items.find((i) => i.name === 'useBiz');
  if (useBizItem) {
    const body = lines.slice(useBizItem.line, useBizItem.endLine + 1).join('\n');
    fs.writeFileSync(
      path.join(outDir, 'useBiz.ts'),
      `import { useSession } from '../../../store/session';\n\n${body.replace(/^function /, 'export function ')}\n`,
    );
  }

  const helpers = items.filter((i) => i.kind === 'function' && !i.exported && i.name !== 'useBiz');
  const barrel = [];

  for (const item of items) {
    if (item.kind === 'reexport') {
      const asName = item.text.match(/as ([A-Za-z]+)/)?.[1];
      if (asName) {
        barrel.push(
          `export { ProfileSecurityPage as ${asName} } from '../../ui/components/ProfileSecurityPage';`,
        );
      }
      continue;
    }
    if (item.name === 'useBiz') continue;

    const body = lines.slice(item.line, item.endLine + 1).join('\n');
    if (!item.exported) {
      const exportedBody = body.replace(/^function /, 'export function ');
      fs.writeFileSync(
        path.join(outDir, `${item.name}.tsx`),
        [...pageImports, `import { useBiz } from './useBiz';`, '', exportedBody, ''].join('\n'),
      );
      continue;
    }

    const helperImports = helpers
      .filter((h) => new RegExp(`\\b${h.name}\\b`).test(body))
      .map((h) => `import { ${h.name} } from './${h.name}';`);

    fs.writeFileSync(
      path.join(outDir, `${item.name}.tsx`),
      [...pageImports, `import { useBiz } from './useBiz';`, ...helperImports, '', body, ''].join('\n'),
    );
    barrel.push(`export { ${item.name} } from './pages/${item.name}';`);
  }

  fs.writeFileSync(filePath, `${barrel.join('\n')}\n`);
  console.log(
    `Split ${path.basename(filePath)} → ${items.filter((i) => i.exported && i.kind === 'function').length} pages`,
  );
}

const root = path.resolve('src/portals');
splitPortal(path.join(root, 'pharmacy/PharmacyPages.tsx'), path.join(root, 'pharmacy/pages'));
splitPortal(path.join(root, 'stockist/StockistPages.tsx'), path.join(root, 'stockist/pages'));
splitPortal(path.join(root, 'admin/AdminPages.tsx'), path.join(root, 'admin/pages'));
