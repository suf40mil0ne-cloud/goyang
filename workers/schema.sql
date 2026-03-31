CREATE TABLE IF NOT EXISTS users (
  kakao_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  profile_image TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notice_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  profile_image TEXT,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_comments_notice_id ON comments(notice_id);

CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  visited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT,
  referrer TEXT
);

CREATE TABLE IF NOT EXISTS daily_stats (
  date TEXT PRIMARY KEY,
  total_views INTEGER DEFAULT 0,
  unique_ips INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_page_views_visited_at ON page_views(visited_at);
CREATE INDEX IF NOT EXISTS idx_page_views_path ON page_views(path);

