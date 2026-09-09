// Thin browser-side wrapper around the official Meta Marketing API.
// No automation, no headless browser — plain Graph API calls with the
// user's own access token. Tokens live in localStorage only.

export const GRAPH_VERSION = "v21.0";
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class MetaError extends Error {
  constructor(payload, status) {
    const e = payload?.error || {};
    super(e.error_user_msg || e.message || `Meta API error (${status})`);
    this.name = "MetaError";
    this.code = e.code;
    this.subcode = e.error_subcode;
    this.type = e.type;
    this.trace = e.fbtrace_id;
    this.status = status;
  }
}

function qs(params) {
  const sp = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  });
  return sp.toString();
}

export async function graphGet(path, params = {}, token) {
  const url = `${BASE}/${path.replace(/^\//, "")}?${qs({ ...params, access_token: token })}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new MetaError(json, res.status);
  return json;
}

export async function graphPost(path, body = {}, token) {
  const form = new URLSearchParams();
  Object.entries(body).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    form.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  });
  form.append("access_token", token);
  const res = await fetch(`${BASE}/${path.replace(/^\//, "")}`, { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new MetaError(json, res.status);
  return json;
}

// Walk paging.next until exhausted (bounded, so a huge account can't hang the UI).
export async function graphGetAll(path, params, token, maxPages = 10) {
  let out = [];
  let page = await graphGet(path, { limit: 100, ...params }, token);
  out = out.concat(page.data || []);
  let i = 1;
  while (page?.paging?.next && i < maxPages) {
    const res = await fetch(page.paging.next);
    page = await res.json().catch(() => ({}));
    if (page.error) break;
    out = out.concat(page.data || []);
    i += 1;
  }
  return out;
}

export async function uploadAdImage(actId, file, token) {
  const form = new FormData();
  form.append("filename", file);
  form.append("access_token", token);
  const res = await fetch(`${BASE}/${actId}/adimages`, { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new MetaError(json, res.status);
  const images = json.images || {};
  const first = Object.values(images)[0] || {};
  return { hash: first.hash, url: first.url || first.permalink_url };
}

export async function debugToken(token) {
  return graphGet("debug_token", { input_token: token }, token);
}

// ── Targeting helpers ────────────────────────────────────────────
export function searchCountries(q, token) {
  return graphGet("search", {
    type: "adgeolocation",
    location_types: ["country"],
    q: q || "a",
    limit: 50,
  }, token).then(r => r.data || []);
}

export function listRegions(countryCode, token) {
  return graphGet("search", {
    type: "adgeolocation",
    location_types: ["region"],
    country_code: countryCode,
    q: "",
    limit: 500,
  }, token).then(r => r.data || []);
}

export function searchCities(q, countryCode, token) {
  return graphGet("search", {
    type: "adgeolocation",
    location_types: ["city"],
    country_code: countryCode,
    q: q || "a",
    limit: 100,
  }, token).then(r => r.data || []);
}

// ── Objective mapping (ODAX) ─────────────────────────────────────
export const OBJECTIVES = [
  { id: "OUTCOME_TRAFFIC",    label: "زيارات / Traffic",        needsLink: true,  goal: "LINK_CLICKS",   billing: "IMPRESSIONS" },
  { id: "OUTCOME_ENGAGEMENT", label: "رسائل / Messages",        needsLink: false, goal: "CONVERSATIONS", billing: "IMPRESSIONS", messenger: true },
  { id: "OUTCOME_ENGAGEMENT_POST", label: "تفاعل مع المنشور",   needsLink: false, goal: "POST_ENGAGEMENT", billing: "IMPRESSIONS", real: "OUTCOME_ENGAGEMENT" },
  { id: "OUTCOME_AWARENESS",  label: "وعي بالعلامة / Awareness", needsLink: false, goal: "REACH",        billing: "IMPRESSIONS" },
  { id: "OUTCOME_SALES",      label: "مبيعات / Sales",          needsLink: true,  goal: "LINK_CLICKS",   billing: "IMPRESSIONS" },
  { id: "OUTCOME_LEADS",      label: "عملاء محتملون / Leads",   needsLink: true,  goal: "LINK_CLICKS",   billing: "IMPRESSIONS" },
];

export const CTA_TYPES = [
  "LEARN_MORE", "SHOP_NOW", "SIGN_UP", "BOOK_TRAVEL", "CONTACT_US",
  "GET_OFFER", "SEND_MESSAGE", "WHATSAPP_MESSAGE", "CALL_NOW", "DOWNLOAD", "SUBSCRIBE",
];
