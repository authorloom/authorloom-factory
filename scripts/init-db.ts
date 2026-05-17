import { closeDatabase, getDatabase, initializeDatabase } from "../src/lib/db";
import { paths } from "../src/lib/paths";

try {
  const db = getDatabase();
  initializeDatabase(db);

  const tables = db
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `,
    )
    .all()
    .map((row) => (row as { name: string }).name);

  console.log(`Initialized SQLite database at ${paths.sqliteDatabaseFile}`);
  console.log(`Tables: ${tables.join(", ")}`);
} catch (error) {
  console.error("Failed to initialize SQLite database.");
  console.error(error);
  process.exitCode = 1;
} finally {
  closeDatabase();
}
