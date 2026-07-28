import { getTableColumns, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

export const buildConflictUpdateColumns = <
  TTable extends PgTable | SQLiteTable,
  TColumn extends keyof TTable["_"]["columns"],
>(
  table: TTable,
  columns: TColumn[],
) => {
  const cls = getTableColumns(table);

  return columns.reduce(
    (acc, column) => {
      const colName = cls[column]!.name;
      // The column name comes from Drizzle table metadata and a typed key.
      // react-doctor-disable-next-line react-doctor/raw-sql-injection-risk
      acc[column] = sql.raw(`excluded.${colName}`);

      return acc;
    },
    {} as Record<TColumn, SQL>,
  );
};
