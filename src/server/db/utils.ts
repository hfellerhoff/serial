import { SQL, getTableColumns, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { SQLiteTable } from "drizzle-orm/sqlite-core";

export const buildConflictUpdateColumns = <
  T extends PgTable | SQLiteTable,
  Q extends keyof T["_"]["columns"],
>(
  table: T,
  columns: Q[],
) => {
  const cls = getTableColumns(table);

  return columns.reduce(
    (acc, column) => {
      const colName = cls[column]!.name;
      acc[column] = sql.raw(`excluded.${colName}`);

      return acc;
    },
    {} as Record<Q, SQL>,
  );
};
