# Visual regression baselines — local developer artifacts

The `*.png` files in this directory are Playwright pixel baselines. They are
**platform-specific**: Playwright names them with the OS and architecture that
generated them (e.g. `navigation-ring-at-rest-chromium-win32.png`), because
font hinting, anti-aliasing and GPU rasterisation differ enough between
operating systems that a baseline from one OS is not a valid comparison
target on another.

This repository's CI runs on `ubuntu-latest`. A baseline generated on a
developer's machine (Windows or macOS) will never match there — Playwright
would look for a `-linux.png` variant that doesn't exist. For that reason the
visual regression test in `e2e/navigation-console.spec.ts` is skipped under
`CI=true` (see the comment on that test) and only runs locally, where it is
compared against whichever platform-suffixed baseline matches your machine.

If you want the check to run on your machine and don't have a baseline for
your platform yet, generate one with:

```
npx playwright test e2e/navigation-console.spec.ts -g "visual regression" --update-snapshots
```

Generating a Linux baseline so this could gate CI would require running that
same command inside a container matching the CI image — see
`docs/assumptions.md` for why that was judged not worth the complexity for
this demonstrator.
