// Local-only token profile vault for Dark Post Studio.
// Nothing leaves the browser: profiles (name + user access token) are kept in
// localStorage so the user can keep several accounts and switch between them.

const KEY = "vortex_dp_profiles_v1";
const ACTIVE_KEY = "vortex_dp_active_profile_v1";

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function listProfiles() {
  return read();
}

export function getActiveId() {
  return localStorage.getItem(ACTIVE_KEY) || read()[0]?.id || null;
}

export function setActiveId(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

export function saveProfile({ id, name, token, meta }) {
  const list = read();
  const pid = id || `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const idx = list.findIndex(p => p.id === pid);
  const entry = {
    id: pid,
    name: name?.trim() || "Profile",
    token: token?.trim() || "",
    meta: meta || list[idx]?.meta || null,
    updatedAt: Date.now(),
  };
  if (idx >= 0) list[idx] = { ...list[idx], ...entry };
  else list.push(entry);
  write(list);
  setActiveId(pid);
  return entry;
}

export function deleteProfile(id) {
  const list = read().filter(p => p.id !== id);
  write(list);
  if (getActiveId() === id) setActiveId(list[0]?.id || null);
  return list;
}
