-- Tables for the stats worker: npx wrangler d1 execute yourlinki --remote --file stats/schema.sql
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS views (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, country TEXT, referrer TEXT, device TEXT, visitor TEXT);
CREATE TABLE IF NOT EXISTS clicks (id INTEGER PRIMARY KEY AUTOINCREMENT, link_id TEXT NOT NULL, ts INTEGER NOT NULL, country TEXT, referrer TEXT, device TEXT, visitor TEXT);
CREATE INDEX IF NOT EXISTS idx_views_ts ON views(ts);
CREATE INDEX IF NOT EXISTS idx_views_visitor ON views(visitor, ts);
CREATE INDEX IF NOT EXISTS idx_clicks_link ON clicks(link_id, ts);
CREATE INDEX IF NOT EXISTS idx_clicks_visitor ON clicks(visitor, ts, link_id);
