// Groups let members view each other's lists read-only. The creator owns the group: only they
// can rename it, remove members, revoke the invite link or delete it. Any member can share the
// invite link.

export const MAX_GROUP_NAME = 100;
const INVITE_TTL = 60 * 60 * 24 * 7; // seconds

export interface Group {
  id: string;
  name: string;
  owner_id: string;
  invite_token: string | null;
  invite_expires_at: number | null;
}

export interface GroupSummary {
  id: string;
  name: string;
  owner_id: string;
  member_count: number;
}

export interface Member {
  id: string;
  name: string | null;
  email: string;
  picture: string | null;
  item_count: number;
}

function randomToken(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCodePoint(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const now = () => Math.floor(Date.now() / 1000);

export function normalizeGroupName(value: unknown): string | null {
  const name = typeof value === 'string' ? value.trim() : '';
  return name && name.length <= MAX_GROUP_NAME ? name : null;
}

export function hasLiveInvite(group: Group): group is Group & { invite_token: string } {
  return !!group.invite_token && (group.invite_expires_at ?? 0) > now();
}

export async function listGroups(db: D1Database, userId: string): Promise<GroupSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT g.id, g.name, g.owner_id,
              (SELECT COUNT(*) FROM group_members c WHERE c.group_id = g.id) AS member_count
       FROM groups g
       JOIN group_members m ON m.group_id = g.id
       WHERE m.user_id = ?
       ORDER BY g.name COLLATE NOCASE`,
    )
    .bind(userId)
    .all<GroupSummary>();
  return results;
}

// The group, if userId is a member of it; null otherwise (including when it doesn't exist).
export async function getGroupForMember(db: D1Database, groupId: string, userId: string): Promise<Group | null> {
  return db
    .prepare(
      `SELECT g.id, g.name, g.owner_id, g.invite_token, g.invite_expires_at
       FROM groups g
       JOIN group_members m ON m.group_id = g.id
       WHERE g.id = ? AND m.user_id = ?`,
    )
    .bind(groupId, userId)
    .first<Group>();
}

export async function listMembers(db: D1Database, groupId: string): Promise<Member[]> {
  const { results } = await db
    .prepare(
      `SELECT u.id, u.name, u.email, u.picture,
              (SELECT COUNT(*) FROM items i WHERE i.user_id = u.id) AS item_count
       FROM group_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ?
       ORDER BY COALESCE(u.name, u.email) COLLATE NOCASE`,
    )
    .bind(groupId)
    .all<Member>();
  return results;
}

export async function isMember(db: D1Database, groupId: string, userId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?')
    .bind(groupId, userId)
    .first();
  return row !== null;
}

export async function createGroup(db: D1Database, ownerId: string, name: string): Promise<string> {
  const id = randomToken(12);
  await db.batch([
    db.prepare('INSERT INTO groups (id, name, owner_id) VALUES (?, ?, ?)').bind(id, name, ownerId),
    db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').bind(id, ownerId),
  ]);
  return id;
}

export async function renameGroup(db: D1Database, groupId: string, name: string) {
  await db.prepare('UPDATE groups SET name = ? WHERE id = ?').bind(name, groupId).run();
}

export async function deleteGroup(db: D1Database, groupId: string) {
  // group_members rows go with it (ON DELETE CASCADE).
  await db.prepare('DELETE FROM groups WHERE id = ?').bind(groupId).run();
}

// Removes a member (or lets one leave). The owner can't be removed; they delete the group instead.
export async function removeMember(db: D1Database, group: Group, userId: string) {
  if (userId === group.owner_id) return;
  await db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').bind(group.id, userId).run();
}

// Returns the live invite token, creating one if there isn't. Never replaces a live link, so a
// member sharing it can't invalidate a link someone else already sent.
export async function ensureInvite(db: D1Database, group: Group): Promise<string> {
  if (hasLiveInvite(group)) return group.invite_token;
  const token = randomToken(24);
  await db
    .prepare('UPDATE groups SET invite_token = ?, invite_expires_at = ? WHERE id = ?')
    .bind(token, now() + INVITE_TTL, group.id)
    .run();
  return token;
}

export async function revokeInvite(db: D1Database, groupId: string) {
  await db.prepare('UPDATE groups SET invite_token = NULL, invite_expires_at = NULL WHERE id = ?').bind(groupId).run();
}

export async function findGroupByInvite(db: D1Database, token: string) {
  return db
    .prepare(
      `SELECT g.id, g.name, u.name AS owner_name, u.email AS owner_email,
              (SELECT COUNT(*) FROM group_members c WHERE c.group_id = g.id) AS member_count
       FROM groups g
       JOIN users u ON u.id = g.owner_id
       WHERE g.invite_token = ? AND g.invite_expires_at > ?`,
    )
    .bind(token, now())
    .first<{ id: string; name: string; owner_name: string | null; owner_email: string; member_count: number }>();
}

export async function joinGroup(db: D1Database, groupId: string, userId: string) {
  await db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').bind(groupId, userId).run();
}
