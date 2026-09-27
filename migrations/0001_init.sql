-- Users, keyed on the loodingdongs-auth OIDC subject (`sub`). Profile fields are refreshed
-- from UserInfo on every sign-in.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Food entries
CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(name) <= 200),
  date TEXT NOT NULL,
  description TEXT CHECK(description IS NULL OR length(description) <= 1000),
  url TEXT CHECK(url IS NULL OR length(url) <= 500),
  image_url TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- App sessions. id_token is the id_token_hint for RP-initiated logout; roles are this app's
-- roles from loodingdongs-auth, re-read with refresh_token every hour (see src/lib/auth.ts).
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  id_token TEXT,
  refresh_token TEXT,
  roles TEXT NOT NULL DEFAULT '[]',
  roles_checked_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Groups: members can view each other's lists (read-only). The creator owns the group.
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  owner_id TEXT NOT NULL,
  -- Shareable invite link (/join/<token>); NULL when there's no live link.
  invite_token TEXT UNIQUE,
  invite_expires_at INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- The owner is a member too.
CREATE TABLE group_members (
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_items_order ON items(user_id, order_index);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_group_members_user_id ON group_members(user_id);
