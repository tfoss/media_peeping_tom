import * as duckdb from "@duckdb/duckdb-wasm";
import type {
  MediaSession,
  TopNResult,
  Dimension,
  TimeRange,
  MediaType,
} from "./types";

// Use local proxy to avoid CORS issues with R2
const PARQUET_URL = "/api/data";

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;

export async function initDB(): Promise<void> {
  if (db) return;

  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], {
      type: "text/javascript",
    }),
  );

  const worker = new Worker(worker_url);
  const logger = new duckdb.ConsoleLogger();
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(worker_url);

  // Fetch parquet file and register it in DuckDB's virtual filesystem
  const response = await fetch(PARQUET_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch parquet: ${response.status}`);
  }
  const parquetBuffer = await response.arrayBuffer();
  await db.registerFileBuffer(
    "sessions.parquet",
    new Uint8Array(parquetBuffer),
  );

  conn = await db.connect();

  // Create view from the registered file
  await conn.query(`
    CREATE VIEW sessions AS
    SELECT * FROM read_parquet('sessions.parquet')
  `);
}

export async function getRecentSessions(
  mediaType: MediaType,
  limit: number = 10,
): Promise<MediaSession[]> {
  if (!conn) throw new Error("Database not initialized");

  const result = await conn.query(`
		SELECT
			title,
			artist,
			series_name,
			device_name,
			session_start,
			session_end,
			watch_time_seconds,
			completion_pct,
			album,
			media_type
		FROM sessions
		WHERE media_type = '${mediaType}'
		ORDER BY session_start DESC
		LIMIT ${limit}
	`);

  return result.toArray().map((row: Record<string, unknown>) => ({
    ...row,
    session_start: new Date(row.session_start as number),
    session_end: new Date(row.session_end as number),
  })) as MediaSession[];
}

export type CountBy = "sessions" | "time";

export async function getTopByDimension(
  dimension: Dimension,
  timeRange: TimeRange,
  limit: number = 10,
  mediaType?: MediaType,
  countBy: CountBy = "sessions",
): Promise<TopNResult[]> {
  if (!conn) throw new Error("Database not initialized");

  // Calculate cutoff date in JavaScript to avoid DuckDB timestamp issues
  const now = new Date();
  const cutoffDate = new Date(now);
  if (timeRange === "day") {
    cutoffDate.setDate(cutoffDate.getDate() - 1);
  } else if (timeRange === "week") {
    cutoffDate.setDate(cutoffDate.getDate() - 7);
  } else {
    cutoffDate.setDate(cutoffDate.getDate() - 30);
  }
  const cutoffStr = cutoffDate.toISOString();

  const mediaTypeFilter = mediaType ? `AND media_type = '${mediaType}'` : "";
  const aggregation =
    countBy === "sessions"
      ? "COUNT(*)"
      : "COALESCE(SUM(watch_time_seconds), 0)";

  const result = await conn.query(`
		SELECT
			${dimension} as label,
			${aggregation} as count
		FROM sessions
		WHERE session_start >= '${cutoffStr}'
		  AND ${dimension} IS NOT NULL
		  AND ${dimension} != ''
		  ${mediaTypeFilter}
		GROUP BY ${dimension}
		ORDER BY count DESC
		LIMIT ${limit}
	`);

  return result.toArray().map((row: Record<string, unknown>) => ({
    label: row.label as string,
    count: Number(row.count),
  }));
}

export async function getTimeRange(): Promise<{ min: Date; max: Date }> {
  if (!conn) throw new Error("Database not initialized");

  const result = await conn.query(`
		SELECT
			MIN(session_start) as min_date,
			MAX(session_start) as max_date
		FROM sessions
	`);

  const row = result.toArray()[0] as Record<string, unknown>;
  return {
    min: new Date(row.min_date as number),
    max: new Date(row.max_date as number),
  };
}

export interface TimelineSession {
  device_name: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  series_name: string | null;
  media_type: string;
  app: string | null;
  session_start: Date;
  session_end: Date;
  watch_time_seconds: number | null;
  completion_pct: number | null;
}

export async function getTimelineSessions(
  startDate: Date,
  endDate: Date,
): Promise<TimelineSession[]> {
  if (!conn) throw new Error("Database not initialized");

  const startStr = startDate.toISOString();
  const endStr = endDate.toISOString();

  const result = await conn.query(`
    SELECT
      device_name,
      title,
      artist,
      album,
      series_name,
      media_type,
      app,
      session_start,
      session_end,
      watch_time_seconds,
      completion_pct
    FROM sessions
    WHERE session_start >= '${startStr}'
      AND session_start <= '${endStr}'
      AND device_name IS NOT NULL
    ORDER BY device_name, session_start
  `);

  return result.toArray().map((row: Record<string, unknown>) => ({
    device_name: row.device_name as string,
    title: row.title as string | null,
    artist: row.artist as string | null,
    album: row.album as string | null,
    series_name: row.series_name as string | null,
    media_type: row.media_type as string,
    app: row.app as string | null,
    session_start: timestampToLocal(row.session_start as number),
    session_end: timestampToLocal(row.session_end as number),
    watch_time_seconds: row.watch_time_seconds as number | null,
    completion_pct: row.completion_pct as number | null,
  }));
}

// The parquet timestamps are in local time (EST) but stored without timezone info.
// DuckDB returns them as microseconds since epoch (UTC interpretation).
// We need to adjust by adding the timezone offset to get correct local time display.
function timestampToLocal(timestamp: number): Date {
  const date = new Date(timestamp);
  // Get the timezone offset in minutes and convert to milliseconds
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  // Add the offset to correct for the double-conversion
  return new Date(date.getTime() + offsetMs);
}
