# TSX Path Mapping Support

## Problem
tsx 4.19.4 does not natively support TypeScript path aliases configured in `tsconfig.json`. When running code with `@shared/*` imports, it throws "Cannot find module" errors.

## Solution
This project uses a symlink-based approach to resolve TypeScript path aliases at runtime.

### How It Works
1. **Setup Script** (`scripts/setup-aliases.sh`): Creates symlinks in `node_modules/` that point to the actual directories defined in `tsconfig.json` paths.
2. **Automatic Execution**: The setup script runs automatically before any `tsx` command via npm `pre*` scripts.
3. **Node Resolution**: Node.js's built-in module resolution then finds the modules through the symlinks.

### Symlinks Created
- `node_modules/@` → `src/`
- `node_modules/@shared` → `src/shared/`
- `node_modules/@manager` → `src/manager/`
- `node_modules/@machine` → `src/machine/`

### Usage
Just run the normal development commands:
```bash
pnpm dev           # Automatically sets up aliases and starts dev server
pnpm dev:server    # Starts management server
pnpm dev:machine   # Starts machine service
```

The `predev`, `predev:server`, etc. scripts ensure that symlinks are created before tsx runs.

### Manual Setup
If you need to manually set up the symlinks (e.g., for debugging):
```bash
pnpm setup:aliases
```

### Scripts with Automatic Alias Setup
The following scripts automatically set up path aliases:
- `pnpm dev`
- `pnpm dev:server`
- `pnpm dev:machine`
- `pnpm dev:minimal`
- `pnpm start:server`
- `pnpm start:machine`
- `pnpm create-test-user`
- `pnpm client-demo`
- `pnpm migrate`
- `pnpm migrate:proxy-port`
- `pnpm verify-credits`
- `pnpm test:sdk`
- `pnpm test:sqlite`
- `pnpm test:mysql`

## Alternative Solutions Considered

### 1. tsconfig-paths Package
**Pros**: Standard solution for TypeScript path mapping
**Cons**: Requires additional package installation, lockfile issues encountered

### 2. tsx Upgrade (4.17+)
**Pros**: Native path support in newer versions
**Cons**: Would require updating dependencies, may have compatibility issues

### 3. Custom Module Loader
**Pros**: Flexible, no external dependencies
**Cons**: Complex to implement, may have edge cases

### 4. Symlink Approach (Current Solution)
**Pros**: Simple, no additional dependencies, works with Node's built-in resolution
**Cons**: Requires setup step, symlinks in node_modules

## Maintenance
- Symlinks are recreated each time the setup script runs
- If you add new path aliases in `tsconfig.json`, they will be automatically picked up
- The script is idempotent - it can be run multiple times safely

## Troubleshooting
If you see "Cannot find module" errors for `@shared/*` imports:
1. Run `pnpm setup:aliases` to recreate symlinks
2. Check that the symlinks exist: `ls -la node_modules/@shared`
3. Verify your `tsconfig.json` paths configuration
4. Make sure you're using the `pnpm dev` scripts (not running `tsx` directly)
