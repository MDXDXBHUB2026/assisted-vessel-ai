// Package-boundary enforcement for the npm-workspaces monorepo (Phase 1A/1B).
//
// The dependency graph itself is declared exactly once, in each packages/*/package.json
// "dependencies" (production) and "devDependencies" (test-only fixtures). This file does not
// restate that graph — it reads it, at config-load time, and turns it into enforceable
// dependency-cruiser rules. If a package's real dependency set changes, update its package.json;
// the rules below recompute themselves from it. A rule here that duplicated the graph by hand
// would be exactly the drift risk this whole work package exists to prevent.
//
// Resolution note: cross-package '@ave/*' imports are resolved via each package's own tsconfig
// "paths" (pointing straight at a sibling package's src, not through real npm/node_modules
// resolution — see docs/assumptions.md and packages/*/tsconfig.json). dependency-cruiser's
// tsconfig-paths resolution only reads ONE tsconfig file, so tsconfig.depcruise.json exists
// purely to give it the union of every package's paths for resolution purposes; it is never part
// of the real build. Because resolution is alias-based rather than real npm resolution, these
// internal edges show up as 'aliased'/'local' dependencyTypes, not 'npm'/'npm-dev' — so the
// built-in no-non-package-json/not-to-dev-dep rules (kept below) only ever fire for genuine npm
// packages (react, zustand, ...), and the package-boundary rules below are custom, path-based,
// but still derived from package.json rather than hand-encoded.

const fs = require('node:fs')
const path = require('node:path')

const REPO_ROOT = __dirname
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages')
const PACKAGE_FOLDERS = fs
  .readdirSync(PACKAGES_DIR)
  .filter((name) => fs.statSync(path.join(PACKAGES_DIR, name)).isDirectory())

function readPackageJson(folder) {
  return JSON.parse(fs.readFileSync(path.join(PACKAGES_DIR, folder, 'package.json'), 'utf-8'))
}

const PACKAGE_JSON_BY_FOLDER = Object.fromEntries(PACKAGE_FOLDERS.map((folder) => [folder, readPackageJson(folder)]))
/** '@ave/core-domain' -> 'core-domain' */
const FOLDER_BY_NAME = Object.fromEntries(PACKAGE_FOLDERS.map((folder) => [PACKAGE_JSON_BY_FOLDER[folder].name, folder]))

/** The @ave/* package names listed in packages/<folder>/package.json's given field. */
function aveDeps(folder, field) {
  return Object.keys(PACKAGE_JSON_BY_FOLDER[folder][field] ?? {}).filter((name) => name.startsWith('@ave/'))
}

/** `packages/<folder>/src` path-match prefixes for a list of @ave/* package names. */
function srcPrefixes(aveNames) {
  return aveNames.map((name) => `^packages/${FOLDER_BY_NAME[name]}/src`)
}

/**
 * One rule per package: production code under packages/<folder>/src may resolve only to itself
 * or to the @ave/* packages listed in its own "dependencies" — never to a package that is only a
 * devDependency (a test-fixture-only relationship) and never to an undeclared package. Test files
 * are exempt when `testExempt` is true, because their devDependencies are legitimate fixtures.
 */
function prodDepsMatchPackageJson(folder, { testExempt = false, scope = 'workspace-only' } = {}) {
  const allowed = aveDeps(folder, 'dependencies')
  const devOnly = aveDeps(folder, 'devDependencies')
  const allowList = `${allowed.length ? allowed.join(', ') : '(none)'}`
  const devFixtureNote = devOnly.length ? `, and "devDependencies" declares ${devOnly.join(', ')} for test fixtures only.` : '.'

  const to =
    scope === 'workspace-only'
      ? // Only checks the internal @ave/* workspace graph; real npm packages (react, zustand, ...)
        // are left to no-non-package-json/not-to-dev-dep, which check them against the SAME
        // package.json by their own, npm-aware mechanism.
        { path: '^packages/[^/]+/src', pathNot: [`^packages/${folder}/src`, ...srcPrefixes(allowed)] }
      : // 'allow-list': production code may resolve to NOTHING beyond @ave/core-domain and its own
        // directory — no React, no Node core modules, no other npm package either. This is the
        // literal "MAY IMPORT ONLY @ave/core-domain" requirement for safety-engine/decision-engine.
        { pathNot: [`^packages/${folder}/src`, ...srcPrefixes(allowed)] }

  return {
    name: `${folder}-prod-deps-match-package-json`,
    severity: 'error',
    comment:
      `Derived from packages/${folder}/package.json: "dependencies" declares ${allowList}${devFixtureNote} ` +
      (scope === 'workspace-only'
        ? 'Production code may resolve to those workspace packages (or its own directory) — never to a ' +
          "devDependency-only package or one undeclared entirely. Real npm packages are checked separately."
        : 'Production code may resolve to NOTHING beyond that (or its own directory) — no other workspace ' +
          'package, no framework, no Node core module. If this package genuinely needs a new dependency, ' +
          'add it to package.json "dependencies" first; this rule recomputes itself from that.') +
      ' See docs/production-architecture-assessment.md §4.5.',
    from: {
      path: `^packages/${folder}/src`,
      ...(testExempt ? { pathNot: '\\.test\\.' } : {}),
    },
    to,
  }
}

/** Path pattern matching today's generative/copilot module, written to also catch a future
 * packages/generative/** so Phase 4 inherits this constraint instead of having to remember it. */
const GENERATIVE_PATH_PATTERN = '(^packages/generative/|[Cc]opilot[Aa]dapter)'

module.exports = {
  forbidden: [
    // --- structural correctness, whole graph -------------------------------------------------
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'A circular dependency defeats the whole point of splitting this codebase into packages with a ' +
        'declared, one-directional dependency graph — if A can reach B and B can reach A, there is no real ' +
        'boundary between them regardless of what package.json claims.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment:
        "This module depends on a module that cannot be found ('resolved to disk'). If it's a workspace " +
        "package, check the path and that package's exposed subpath; if it's an npm package, add it to " +
        'the right package.json.',
      from: {},
      to: { couldNotResolve: true },
    },

    // --- "no-missing-deps / equivalent" for genuine npm packages ------------------------------
    // These are the stock dependency-cruiser rules; kept because real npm dependencies (react,
    // zustand, vitest, ...) resolve through real node_modules and so are classified 'npm'/'npm-dev'
    // — the internal @ave/* workspace edges are not (see file header), which is why the
    // package-boundary rules below exist as a separate, path-based mechanism for those.
    {
      name: 'no-non-package-json',
      severity: 'error',
      comment:
        "This module depends on an npm package that isn't declared in the relevant package.json. That's " +
        "problematic: the package either won't be available on a clean install, or will be available with " +
        'a non-guaranteed version. Add it to the correct package.json.',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment:
        "This (production) module depends on an npm package that is only a devDependency. Either it " +
        "ships to production and belongs in \"dependencies\", or this file is test-only and should be " +
        'named *.test.ts.',
      from: { path: '^()', pathNot: '\\.test\\.' },
      to: {
        dependencyTypes: ['npm-dev'],
        dependencyTypesNot: ['type-only'],
        pathNot: ['node_modules/@types/'],
      },
    },

    // --- rule 1: nothing depends on the UI layer ----------------------------------------------
    {
      name: 'no-package-imports-app',
      severity: 'error',
      comment:
        '@ave/app is the UI/composition layer — every other package must work standalone, including in a ' +
        'headless test run or a future non-browser host. Nothing outside @ave/app, in production code or ' +
        'tests, may import it.',
      from: { pathNot: '^packages/app/' },
      to: { path: '^packages/app/src' },
    },

    // --- rules 2-5: per-package production dependencies, derived from package.json -----------
    // safety-engine and decision-engine use the strict 'allow-list' scope: their production code
    // may resolve to literally nothing beyond @ave/core-domain, which is what "MAY IMPORT ONLY
    // @ave/core-domain" means taken literally — no React, no Node core module either.
    prodDepsMatchPackageJson('safety-engine', { testExempt: true, scope: 'allow-list' }),
    prodDepsMatchPackageJson('decision-engine', { testExempt: true, scope: 'allow-list' }),
    prodDepsMatchPackageJson('simulator'),
    prodDepsMatchPackageJson('assurance'),
    // Not individually requested by name, but the same derivation applied to the two remaining
    // packages for consistency: core-domain declares no dependencies at all (so this simply
    // forbids it depending on any sibling package), and app's own list already names every
    // sibling package that exists today — this only bites if a 7th package appears and app
    // imports it before declaring it.
    prodDepsMatchPackageJson('core-domain'),
    prodDepsMatchPackageJson('app'),

    // --- rule 6: generative containment (Tier 3, §4.5) ----------------------------------------
    {
      name: 'generative-never-imports-safety-engine',
      severity: 'error',
      comment:
        'Per docs/production-architecture-assessment.md §4.5: Tier 3 (assistive/generative) components ' +
        'are strictly read-only with respect to verdicts and must have NO import path to the safety ' +
        'engine. Written against a path pattern (not just today\'s copilotAdapter.ts) so a future ' +
        'packages/generative/** inherits this constraint automatically.',
      from: { path: GENERATIVE_PATH_PATTERN },
      to: { path: '^packages/safety-engine/src' },
    },
    {
      name: 'safety-and-decision-engine-never-import-generative',
      severity: 'error',
      comment:
        'The inverse of generative-never-imports-safety-engine: no module under safety-engine or ' +
        'decision-engine may import a generative/copilot module either — a verdict must never even be ' +
        "able to *read* generative output as an input, let alone be produced by it. HMI-303.",
      from: { path: '^packages/(?:safety-engine|decision-engine)/src' },
      to: { path: GENERATIVE_PATH_PATTERN },
    },
  ],
  options: {
    doNotFollow: {
      path: ['node_modules'],
    },
    exclude: {
      path: ['(^|/)dist/', '(^|/)test-results/', '(^|/)playwright-report/', '\\.d\\.ts$'],
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.depcruise.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
      extensions: ['.ts', '.tsx', '.js'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/(?:@[^/]+/[^/]+|[^/]+)',
      },
      archi: {
        collapsePattern: '^packages/[^/]+',
      },
      text: {
        highlightFocused: true,
      },
    },
  },
}
