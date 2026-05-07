import { auth } from '../auth/auth';

interface MigrationsApi {
  runMigrations: () => Promise<void>;
  toBeCreated: { table: string }[];
  toBeAdded: { table: string }[];
}

async function main() {
  // `getMigrations` lives in better-auth's `dist/db/get-migration.mjs` but is
  // not part of the package's public exports map. We dynamic-import it so the
  // ESM module loads cleanly from our CJS build, mirroring what the
  // @better-auth/cli does internally.
  const importPath = 'better-auth/dist/db/get-migration.mjs';
  const mod = (await (Function('p', 'return import(p)') as (
    p: string,
  ) => Promise<unknown>)(importPath)) as {
    getMigrations: (
      options: typeof auth.options,
    ) => Promise<MigrationsApi>;
  };

  const { runMigrations, toBeCreated, toBeAdded } = await mod.getMigrations(
    auth.options,
  );

  if (toBeCreated.length === 0 && toBeAdded.length === 0) {
    console.log('[better-auth migrate] schema up to date — nothing to do');
    return;
  }

  if (toBeCreated.length) {
    console.log(
      `[better-auth migrate] creating tables: ${toBeCreated.map((t) => t.table).join(', ')}`,
    );
  }
  if (toBeAdded.length) {
    console.log(
      `[better-auth migrate] adding columns to: ${toBeAdded.map((t) => t.table).join(', ')}`,
    );
  }

  await runMigrations();
  console.log('[better-auth migrate] done');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[better-auth migrate] failed:', err);
    process.exit(1);
  });
