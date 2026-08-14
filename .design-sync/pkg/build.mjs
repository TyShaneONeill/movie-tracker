// Builds the PocketStubs design-system web package for design-sync.
// 1. esbuild: index.ts -> dist/index.es.js (react-native aliased to react-native-web,
//    infra modules stubbed — never component code)
// 2. tsc: declaration-only emit mirrored under dist/
// 3. tokens + @font-face -> dist/styles.css, font ttfs copied to dist/fonts/
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PKG = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(PKG, '../..');
const DIST = join(PKG, 'dist');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, 'fonts'), { recursive: true });

const alias = {
  '@react-native-async-storage/async-storage': join(PKG, 'stubs/async-storage.ts'),
  'react-native': 'react-native-web',
  '@': ROOT,
};

// Stub infra modules by RESOLVED path so both '@/lib/supabase' and relative
// './supabase' imports hit the stub (never component code).
const STUBBED = {
  [join(ROOT, 'lib/supabase')]: join(PKG, 'stubs/supabase.ts'),
  [join(ROOT, 'lib/sentry')]: join(PKG, 'stubs/sentry.ts'),
  [join(ROOT, 'hooks/use-auth')]: join(PKG, 'stubs/use-auth.ts'),
  [join(ROOT, 'lib/auth-context')]: join(PKG, 'stubs/use-auth.ts'),
};
const stubPlugin = {
  name: 'ds-stubs',
  setup(b) {
    b.onResolve({ filter: /(^|\/)(supabase|sentry|use-auth|auth-context)$/ }, (args) => {
      const abs = args.path.startsWith('.')
        ? resolve(args.resolveDir, args.path)
        : args.path.startsWith('@/') ? join(ROOT, args.path.slice(2)) : null;
      return abs && STUBBED[abs] ? { path: STUBBED[abs] } : undefined;
    });
  },
};

const common = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  alias,
  plugins: [stubPlugin],
  mainFields: ['browser', 'module', 'main'],
  conditions: ['browser'],
  resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
  banner: { js: [
    "import * as __ds_react from 'react';",
    "import * as __ds_react_dom from 'react-dom';",
    "import * as __ds_jsx_runtime from 'react/jsx-runtime';",
    "var process = globalThis.process || { env: { NODE_ENV: 'production', EXPO_OS: 'web' } };",
    "var require = function (m) {",
    "  if (m === 'react') return __ds_react;",
    "  if (m === 'react-dom') return __ds_react_dom;",
    "  if (m === 'react/jsx-runtime') return __ds_jsx_runtime;",
    "  throw new Error('require not supported in ds bundle: ' + m);",
    "};",
  ].join('\n') },
  define: {
    global: 'globalThis',
    __DEV__: 'false',
    'process.env.NODE_ENV': '"production"',
    'process.env.EXPO_OS': '"web"',
  },
  loader: {
    '.js': 'jsx',
    '.png': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl',
    '.svg': 'dataurl', '.ttf': 'dataurl', '.otf': 'dataurl',
  },
  logLevel: 'warning',
};

// 1. main bundle (react externalized — the converter supplies its vendor copy)
await build({
  ...common,
  entryPoints: [join(PKG, 'index.ts')],
  outfile: join(DIST, 'index.es.js'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
});
// react-native-web's injected <style id="react-native-stylesheet"> matches the
// design-sync validator's [id^="r"] root selector and reads as an empty root.
// Rename it (consistently — the id is only used for the bundle's own dedup lookup).
{
  const outfile = join(DIST, 'index.es.js');
  const src = (await import('node:fs')).readFileSync(outfile, 'utf8');
  (await import('node:fs')).writeFileSync(outfile, src.replaceAll('react-native-stylesheet', 'ds-rnw-stylesheet'));
}
console.error('  [pkg] dist/index.es.js written');

// 2. declarations (mirror lands under dist/.design-sync/pkg/index.d.ts)
const tsconfig = {
  extends: resolve(ROOT, 'tsconfig.json'),
  compilerOptions: {
    noEmit: false, declaration: true, emitDeclarationOnly: true,
    declarationDir: './dist', rootDir: '../..',
    skipLibCheck: true, noUnusedLocals: false, noUnusedParameters: false,
  },
  include: ['./index.ts'],
};
writeFileSync(join(PKG, 'tsconfig.dts.json'), JSON.stringify(tsconfig, null, 2));
execFileSync('npx', ['tsc', '-p', join(PKG, 'tsconfig.dts.json')], { cwd: ROOT, stdio: 'inherit' });
console.error('  [pkg] declarations emitted');

// 3. tokens + fonts CSS. Evaluate theme constants via a tiny node-side bundle.
const themeProbe = join(DIST, '.theme-probe.mjs');
await build({
  ...common,
  platform: 'neutral',
  entryPoints: [join(PKG, 'theme-probe.ts')],
  outfile: themeProbe,
  external: [],
});
const { Colors, Spacing, BorderRadius, FontSizes, FontsFlat } = await import(pathToFileURL(themeProbe).href);
rmSync(themeProbe, { force: true });

// copy every expo-google-fonts ttf whose family name theme.ts references
const fontFaces = [];
for (const family of FontsFlat) {
  const scope = family.startsWith('Outfit') ? 'outfit' : family.startsWith('Inter') ? 'inter' : 'jetbrains-mono';
  const pkgDir = join(ROOT, 'node_modules', '@expo-google-fonts', scope);
  let found = null;
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f === `${family}.ttf`) found = p;
    }
  };
  if (existsSync(pkgDir)) walk(pkgDir);
  if (found) {
    cpSync(found, join(DIST, 'fonts', `${family}.ttf`));
    const weight = (family.match(/_(\d{3})/) || [])[1] || '400';
    fontFaces.push(`@font-face {\n  font-family: '${family}';\n  src: url('./fonts/${family}.ttf') format('truetype');\n  font-weight: ${weight};\n  font-style: normal;\n  font-display: swap;\n}`);
  } else {
    console.error(`  [pkg] ! font file not found for family ${family}`);
  }
}

const vars = (obj, prefix) => Object.entries(obj)
  .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
  .map(([k, v]) => `  --ps-${prefix}-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}: ${typeof v === 'number' ? `${v}px` : v};`)
  .join('\n');

const css = `/* PocketStubs design tokens — generated from constants/theme.ts (dark = default) */
:root {
${vars(Colors.dark, 'color')}
${vars(Spacing, 'space')}
${vars(BorderRadius, 'radius')}
${vars(FontSizes, 'text')}
}
@media (prefers-color-scheme: light) {
  :root {
${vars(Colors.light, 'color')}
  }
}

${fontFaces.join('\n\n')}
`;
writeFileSync(join(DIST, 'styles.css'), css);
console.error(`  [pkg] dist/styles.css written (${fontFaces.length} font faces)`);
