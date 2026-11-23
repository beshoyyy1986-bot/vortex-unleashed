const GRAPH_VERSION = "v27.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const MAX_JSON_BYTES = 4_000_000;
const MAX_IMAGE_BYTES = 2_500_000;
const REQUEST_TIMEOUT_MS = 20_000;

interface MetaBody {
  token?: unknown;
  proxy?: unknown;
  page_id?: unknown;
  page_token?: unknown;
  ad_account?: unknown;
  message?: unknown;
  image_base64?: unknown;
  image_name?: unknown;
  budget?: unknown;
  days?: unknown;
  publish_status?: unknown;
  country?: unknown;
  age_min?: unknown;
  age_max?: unknown;
  custom_audience_id?: unknown;
  traffic_url?: unknown;
  gender?: unknown;
  pixel_id?: unknown;
  custom_event_type?: unknown;
  ad_id?: unknown;
  adset_id?: unknown;
  campaign_id?: unknown;
  status?: unknown;
  daily_budget?: unknown;
  end_time?: unknown;
  post_id?: unknown;
  [key: string]: unknown;
}

interface GraphErrorPayload {
  error?: {
    message?: string;
    error_user_msg?: string;
    code?: number;
    error_subcode?: number;
    type?: string;
  };
}

class MetaApiError extends Error {
  code: number | undefined;
  status: number | undefined;

  constructor(message: string, code?: number, status?: number) {
    super(message);
    this.name = "MetaApiError";
    this.code = code;
    this.status = status;
  }
}

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "حدث خطأ غير متوقع";
}

function readString(body: MetaBody, key: string, maxLength = 512): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new MetaApiError(`قيمة ${key} غير صالحة.`, undefined, 400);
  }
  return value.trim();
}

function readToken(body: MetaBody, key = "token"): string {
  const token = readString(body, key, 4096);
  if (/\s/.test(token)) throw new MetaApiError("صيغة التوكن غير صالحة.", undefined, 400);
  return token;
}

function readId(body: MetaBody, key: string): string {
  const value = readString(body, key, 80);
  if (!/^\d+(?:_\d+)?$/.test(value)) {
    throw new MetaApiError(`معرّف ${key} غير صالح.`, undefined, 400);
  }
  return value;
}

function readAccountPath(body: MetaBody, key: string): string {
  const value = readString(body, key, 80);
  const id = value.replace(/^act_/, "");
  if (!/^\d+$/.test(id)) {
    throw new MetaApiError(`معرّف ${key} غير صالح.`, undefined, 400);
  }
  return `act_${id}`;
}

function accountPath(value: string): string {
  return value.startsWith("act_") ? value : `act_${value}`;
}

function ensureUsdCurrency(currency: string | undefined): void {
  if (currency !== "USD") {
    throw new MetaApiError(
      `عملة الحساب ${currency ?? "غير متاحة"} بينما حقل الميزانية بالدولار الأمريكي. لم يتم تغيير الميزانية.`,
      undefined,
      400,
    );
  }
}

function requireNoProxy(body: MetaBody): void {
  if (typeof body.proxy === "string" && body.proxy.trim()) {
    throw new MetaApiError(
      "الاتصال عبر Proxy غير مدعوم في Vercel Functions. أوقف خيار Proxy ثم أعد المحاولة.",
      undefined,
      400,
    );
  }
}

function encodeValue(value: unknown): string {
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

async function graphRequest<T = Record<string, unknown>>(
  path: string,
  token: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    params?: Record<string, unknown>;
    form?: FormData;
  } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\/+/, "")}`);
  const form = options.form;
  let body: URLSearchParams | FormData | undefined;

  if (method === "GET" || method === "DELETE") {
    url.searchParams.set("access_token", token);
    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, encodeValue(value));
      }
    }
  } else if (form) {
    form.set("access_token", token);
    body = form;
  } else {
    const fields = new URLSearchParams();
    fields.set("access_token", token);
    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value !== undefined && value !== null && value !== "") {
        fields.set(key, encodeValue(value));
      }
    }
    body = fields;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new MetaApiError("انتهت مهلة الاتصال بخدمة Meta. حاول مجدداً.", undefined, 504);
    }
    throw new MetaApiError(
      "تعذر الاتصال بخدمة Meta. تحقق من اتصال الخادم ثم حاول مجدداً.",
      undefined,
      502,
    );
  }

  const payload = (await response.json().catch(() => ({}))) as T & GraphErrorPayload;
  const graphError = payload && typeof payload === "object" ? payload.error : undefined;
  if (!response.ok || graphError) {
    const message =
      graphError?.error_user_msg ||
      graphError?.message ||
      `فشل طلب Meta (HTTP ${response.status}).`;
    throw new MetaApiError(message, graphError?.code, response.status);
  }
  return payload;
}

async function graphGetAll<T>(path: string, token: string, fields: string): Promise<T[]> {
  let page = await graphRequest<{ data?: T[]; paging?: { next?: string } }>(path, token, {
    params: { fields, limit: 100 },
  });
  const results = [...(page.data ?? [])];

  for (let pageNumber = 1; page.paging?.next && pageNumber < 5; pageNumber += 1) {
    const nextUrl = new URL(page.paging.next);
    if (nextUrl.origin !== new URL(GRAPH_BASE).origin) break;
    const response = await fetch(nextUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const nextPage = (await response.json().catch(() => ({}))) as {
      data?: T[];
      paging?: { next?: string };
      error?: GraphErrorPayload["error"];
    };
    if (!response.ok || nextPage.error) break;
    results.push(...(nextPage.data ?? []));
    page = nextPage;
  }
  return results;
}

function safeNumber(value: unknown, label: string, min: number, max: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new MetaApiError(`${label} خارج النطاق المسموح.`, undefined, 400);
  }
  return number;
}

function imageBytes(
  value: unknown,
  fileNameValue: unknown,
): { bytes: Uint8Array; mime: string; name: string } {
  if (typeof value !== "string" || value.length > 3_400_000) {
    throw new MetaApiError("حجم الصورة أكبر من الحد المسموح (2.5 MB).", undefined, 413);
  }

  const match = value.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,/i);
  const mime = match?.[1]?.toLowerCase() ?? "image/jpeg";
  const base64 = value.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
  if (!/^[a-z0-9+/]*={0,2}$/i.test(base64)) {
    throw new MetaApiError("صيغة الصورة غير صالحة.", undefined, 400);
  }

  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new MetaApiError("تعذر قراءة الصورة المرفقة.", undefined, 400);
  }
  if (binary.length > MAX_IMAGE_BYTES) {
    throw new MetaApiError("حجم الصورة أكبر من الحد المسموح (2.5 MB).", undefined, 413);
  }

  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const rawName = typeof fileNameValue === "string" ? fileNameValue : "image.jpg";
  const name =
    rawName
      .split(/[\\/]/)
      .pop()
      ?.replace(/[^\w.-]/g, "_")
      .slice(0, 100) || "image.jpg";
  return { bytes, mime, name };
}

async function connect(token: string): Promise<Record<string, unknown>> {
  const [me, accounts, pages] = await Promise.all([
    graphRequest<{ id?: string; name?: string }>("me", token, { params: { fields: "id,name" } }),
    graphGetAll<Record<string, unknown>>(
      "me/adaccounts",
      token,
      "id,name,account_status,currency,timezone_name,amount_spent,balance",
    ),
    graphGetAll<Record<string, unknown>>(
      "me/accounts",
      token,
      "id,name,access_token,category,fan_count",
    ),
  ]);
  return { ok: true, user: me, accounts, pages };
}

async function tokenInfo(token: string): Promise<Record<string, unknown>> {
  const me = await graphRequest<{ id?: string; name?: string }>("me", token, {
    params: { fields: "id,name" },
  });
  try {
    const result = await graphRequest<{
      data?: {
        is_valid?: boolean;
        application?: string;
        expires_at?: number;
        scopes?: string[];
      };
    }>("debug_token", token, {
      params: { input_token: token },
    });
    const details = result.data ?? {};
    return {
      ok: true,
      valid: details.is_valid === true,
      name: me.name,
      app_name: typeof details.application === "string" ? details.application : undefined,
      expires_at: details.expires_at,
      scopes: Array.isArray(details.scopes) ? details.scopes : [],
      details_available: Array.isArray(details.scopes),
      reason: details.is_valid === false ? "التوكن غير صالح أو انتهت صلاحيته." : undefined,
    };
  } catch {
    return {
      ok: true,
      valid: true,
      name: me.name,
      details_available: false,
      scopes: [],
      reason: "تعذر قراءة تفاصيل الصلاحيات؛ تم التحقق من التوكن عبر الحساب.",
    };
  }
}

async function pagePosts(body: MetaBody): Promise<Record<string, unknown>> {
  const pageId = readId(body, "page_id");
  const token = readToken(body, "page_token");
  const posts = await graphGetAll<Record<string, unknown>>(
    `${pageId}/posts`,
    token,
    "id,message,created_time,permalink_url,attachments{media,type,url,title}",
  );
  return { ok: true, posts };
}

async function pixels(body: MetaBody): Promise<Record<string, unknown>> {
  const token = readToken(body);
  const adAccount = readAccountPath(body, "ad_account");
  const data = await graphRequest<{ data?: Record<string, unknown>[] }>(
    `${adAccount}/adspixels`,
    token,
    {
      params: { fields: "id,name", limit: 100 },
    },
  );
  return { ok: true, pixels: data.data ?? [] };
}

async function darkPost(body: MetaBody): Promise<Record<string, unknown>> {
  const pageId = readId(body, "page_id");
  const token = readToken(body, "page_token");
  const message = readString(body, "message", 5000);
  const image = body.image_base64;

  if (typeof image === "string" && image) {
    const { bytes, mime, name } = imageBytes(image, body.image_name);
    const form = new FormData();
    form.set("published", "false");
    form.set("message", message);
    const imageBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(imageBuffer).set(bytes);
    form.set("source", new Blob([imageBuffer], { type: mime }), name);
    const photo = await graphRequest<{ id?: string; post_id?: string }>(`${pageId}/photos`, token, {
      method: "POST",
      form,
    });
    if (photo.post_id) return { ok: true, post_id: photo.post_id };
    if (!photo.id) throw new MetaApiError("Meta لم تُرجع معرّف الصورة.");

    const post = await graphRequest<{ id?: string }>(`${pageId}/feed`, token, {
      method: "POST",
      params: {
        message,
        published: false,
        attached_media: [{ media_fbid: photo.id }],
      },
    });
    return { ok: true, post_id: post.id };
  }

  const post = await graphRequest<{ id?: string }>(`${pageId}/feed`, token, {
    method: "POST",
    params: { message, published: false },
  });
  return { ok: true, post_id: post.id };
}

async function deletePost(body: MetaBody): Promise<Record<string, unknown>> {
  const postId = readId(body, "post_id");
  const token = readToken(body, "page_token");
  const result = await graphRequest<{ success?: boolean }>(postId, token, { method: "DELETE" });
  return { ok: result.success !== false, success: result.success !== false };
}

const OBJECTIVES: Record<string, { objective: string; optimizationGoal: string }> = {
  OUTCOME_TRAFFIC: { objective: "OUTCOME_TRAFFIC", optimizationGoal: "LINK_CLICKS" },
  OUTCOME_ENGAGEMENT: { objective: "OUTCOME_ENGAGEMENT", optimizationGoal: "CONVERSATIONS" },
  OUTCOME_ENGAGEMENT_POST: { objective: "OUTCOME_ENGAGEMENT", optimizationGoal: "POST_ENGAGEMENT" },
  OUTCOME_AWARENESS: { objective: "OUTCOME_AWARENESS", optimizationGoal: "REACH" },
  OUTCOME_SALES: { objective: "OUTCOME_SALES", optimizationGoal: "LINK_CLICKS" },
  OUTCOME_LEADS: { objective: "OUTCOME_LEADS", optimizationGoal: "LEAD_GENERATION" },
};

async function createAd(body: MetaBody): Promise<Record<string, unknown>> {
  const token = readToken(body);
  const adAccount = readAccountPath(body, "ad_account");
  const pageId = readId(body, "page_id");
  const postId = readId(body, "post_id");
  const objectiveKey = readString(body, "objective", 60);
  const objective = OBJECTIVES[objectiveKey];
  if (!objective) throw new MetaApiError("هدف الحملة غير مدعوم.", undefined, 400);

  const budget = safeNumber(body.budget, "الميزانية", 1, 100_000);
  const days = safeNumber(body.days ?? 0, "عدد الأيام", 0, 365);
  const publishStatus = body.publish_status === "ACTIVE" ? "ACTIVE" : "PAUSED";
  const country = typeof body.country === "string" ? body.country.toUpperCase() : "";
  const ageMin =
    body.age_min == null ? undefined : safeNumber(body.age_min, "العمر الأدنى", 13, 65);
  const ageMax =
    body.age_max == null ? undefined : safeNumber(body.age_max, "العمر الأقصى", 13, 65);
  if (ageMin !== undefined && ageMax !== undefined && ageMin > ageMax) {
    throw new MetaApiError("العمر الأدنى يجب ألا يتجاوز العمر الأقصى.", undefined, 400);
  }
  const customAudienceId =
    typeof body.custom_audience_id === "string" && body.custom_audience_id
      ? body.custom_audience_id
      : null;
  if (customAudienceId && !/^\d+$/.test(customAudienceId)) {
    throw new MetaApiError("معرّف الجمهور المخصص غير صالح.", undefined, 400);
  }

  const trafficUrl =
    typeof body.traffic_url === "string" && body.traffic_url ? body.traffic_url : null;
  if (trafficUrl) {
    let destination: URL;
    try {
      destination = new URL(trafficUrl);
    } catch {
      throw new MetaApiError("رابط الزيارات غير صالح.", undefined, 400);
    }
    if (destination.protocol !== "https:") {
      throw new MetaApiError("يجب استخدام رابط HTTPS للإعلان.", undefined, 400);
    }
  }

  const account = await graphRequest<{ currency?: string }>(adAccount, token, {
    params: { fields: "currency" },
  });
  ensureUsdCurrency(account.currency);

  const geoLocations =
    country && country !== "WW" && /^[A-Z]{2}$/.test(country)
      ? { countries: [country] }
      : undefined;
  if (!geoLocations && !customAudienceId) {
    throw new MetaApiError("اختر دولة محددة أو جمهوراً مخصصاً قبل إنشاء الحملة.", undefined, 400);
  }

  const targeting: Record<string, unknown> = {};
  if (geoLocations) targeting["geo_locations"] = geoLocations;
  if (ageMin !== undefined) targeting["age_min"] = ageMin;
  if (ageMax !== undefined) targeting["age_max"] = ageMax;
  const gender = Number(body.gender);
  if (gender === 1 || gender === 2) targeting["genders"] = [gender];
  if (customAudienceId) targeting["custom_audiences"] = [{ id: customAudienceId }];

  const promotedObject: Record<string, unknown> = {};
  if (objectiveKey === "OUTCOME_SALES") {
    const pixelId = readId(body, "pixel_id");
    promotedObject["pixel_id"] = pixelId;
    promotedObject["custom_event_type"] =
      typeof body.custom_event_type === "string" ? body.custom_event_type : "PURCHASE";
  } else if (
    objectiveKey === "OUTCOME_ENGAGEMENT" ||
    objectiveKey === "OUTCOME_ENGAGEMENT_POST" ||
    objectiveKey === "OUTCOME_LEADS"
  ) {
    promotedObject["page_id"] = pageId;
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  let campaignId: string | undefined;
  let adsetId: string | undefined;
  let adId: string | undefined;

  try {
    const campaign = await graphRequest<{ id?: string }>(`${adAccount}/campaigns`, token, {
      method: "POST",
      params: {
        name: `Vortex ${objectiveKey} ${stamp}`,
        objective: objective.objective,
        status: "PAUSED",
        special_ad_categories: [],
      },
    });
    campaignId = campaign.id;
    if (!campaignId) throw new MetaApiError("Meta لم تُرجع معرّف الحملة.");

    const adsetPayload: Record<string, unknown> = {
      name: `Vortex ad set ${stamp}`,
      campaign_id: campaignId,
      daily_budget: String(Math.round(budget * 100)),
      billing_event: "IMPRESSIONS",
      optimization_goal: objective.optimizationGoal,
      status: "PAUSED",
      targeting,
      ...(Object.keys(promotedObject).length ? { promoted_object: promotedObject } : {}),
      ...(days > 0 ? { end_time: new Date(Date.now() + days * 86_400_000).toISOString() } : {}),
    };
    if (objectiveKey === "OUTCOME_TRAFFIC" || objectiveKey === "OUTCOME_SALES") {
      adsetPayload["destination_type"] = "WEBSITE";
    } else if (objectiveKey === "OUTCOME_ENGAGEMENT") {
      adsetPayload["destination_type"] = "MESSENGER";
    }

    const adset = await graphRequest<{ id?: string }>(`${adAccount}/adsets`, token, {
      method: "POST",
      params: adsetPayload,
    });
    adsetId = adset.id;
    if (!adsetId) throw new MetaApiError("Meta لم تُرجع معرّف مجموعة الإعلانات.");

    let creativePayload: Record<string, unknown>;
    if (trafficUrl) {
      const post = await graphRequest<{
        message?: string;
        attachments?: { data?: Array<{ media?: { image?: { src?: string } } }> };
      }>(postId, token, { params: { fields: "message,attachments{media}" } });
      const picture = post.attachments?.data?.[0]?.media?.image?.src;
      creativePayload = {
        name: `Vortex creative ${stamp}`,
        object_story_spec: {
          page_id: pageId,
          link_data: {
            link: trafficUrl,
            message: post.message ?? "",
            ...(picture ? { picture } : {}),
            call_to_action: { type: "LEARN_MORE", value: { link: trafficUrl } },
          },
        },
      };
    } else {
      creativePayload = { name: `Vortex creative ${stamp}`, object_story_id: postId };
    }

    const creative = await graphRequest<{ id?: string }>(`${adAccount}/adcreatives`, token, {
      method: "POST",
      params: creativePayload,
    });
    if (!creative.id) throw new MetaApiError("Meta لم تُرجع معرّف مادة الإعلان.");

    const ad = await graphRequest<{ id?: string }>(`${adAccount}/ads`, token, {
      method: "POST",
      params: {
        name: `Vortex ad ${stamp}`,
        adset_id: adsetId,
        creative: { creative_id: creative.id },
        status: "PAUSED",
      },
    });
    adId = ad.id;
    if (!adId) throw new MetaApiError("Meta لم تُرجع معرّف الإعلان.");

    if (publishStatus === "ACTIVE") {
      await graphRequest(campaignId, token, { method: "POST", params: { status: "ACTIVE" } });
      await graphRequest(adsetId, token, { method: "POST", params: { status: "ACTIVE" } });
      await graphRequest(adId, token, { method: "POST", params: { status: "ACTIVE" } });
    }

    return {
      ok: true,
      campaign_id: campaignId,
      adset_id: adsetId,
      ad_id: adId,
      message:
        publishStatus === "ACTIVE"
          ? "تم إنشاء الإعلان وتفعيله."
          : "تم إنشاء الإعلان بحالة متوقفة مؤقتاً.",
    };
  } catch (error) {
    throw new MetaApiError(
      `${errorMessage(error)}${campaignId ? ` (Campaign: ${campaignId}${adsetId ? `, Ad set: ${adsetId}` : ""}${adId ? `, Ad: ${adId}` : ""})` : ""}`,
      error instanceof MetaApiError ? error.code : undefined,
      error instanceof MetaApiError ? error.status : undefined,
    );
  }
}

async function adStatus(body: MetaBody): Promise<Record<string, unknown>> {
  const token = readToken(body);
  const adId = readId(body, "ad_id");
  const ad = await graphRequest<Record<string, unknown>>(adId, token, {
    params: {
      fields:
        "id,name,status,effective_status,daily_budget,lifetime_budget,adset_id,campaign_id,creative{object_story_id}",
    },
  });
  return {
    ok: true,
    ...ad,
    ad_id: ad["id"],
    adset_id: ad["adset_id"],
    campaign_id: ad["campaign_id"],
  };
}

async function updateAd(body: MetaBody): Promise<Record<string, unknown>> {
  const token = readToken(body);
  const adId = readId(body, "ad_id");
  const adsetId =
    typeof body.adset_id === "string" && body.adset_id ? readId(body, "adset_id") : null;
  const campaignId =
    typeof body.campaign_id === "string" && body.campaign_id ? readId(body, "campaign_id") : null;
  const status = body.status === "ACTIVE" || body.status === "PAUSED" ? body.status : null;
  const postId = typeof body.post_id === "string" && body.post_id ? readId(body, "post_id") : null;
  const adsetChanges: Record<string, unknown> = {};

  if (body.daily_budget != null && body.daily_budget !== "") {
    if (!adsetId)
      throw new MetaApiError("معرّف مجموعة الإعلانات مطلوب لتعديل الميزانية.", undefined, 400);
    const budget = safeNumber(body.daily_budget, "الميزانية اليومية", 1, 100_000_000);
    adsetChanges["daily_budget"] = String(Math.round(budget * 100));
  }
  if (body.end_time != null && body.end_time !== "") {
    if (!adsetId)
      throw new MetaApiError("معرّف مجموعة الإعلانات مطلوب لتعديل تاريخ الانتهاء.", undefined, 400);
    const end = new Date(String(body.end_time));
    if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) {
      throw new MetaApiError("تاريخ الانتهاء يجب أن يكون في المستقبل.", undefined, 400);
    }
    adsetChanges["end_time"] = end.toISOString();
  }

  if (!status && !Object.keys(adsetChanges).length && !postId) {
    throw new MetaApiError("لا توجد تغييرات صالحة لحفظها.", undefined, 400);
  }

  if (adsetChanges["daily_budget"] !== undefined) {
    const currentAd = await graphRequest<{ account_id?: string }>(adId, token, {
      params: { fields: "account_id" },
    });
    if (!currentAd.account_id) throw new MetaApiError("تعذر تحديد عملة حساب الإعلان.");
    const account = await graphRequest<{ currency?: string }>(
      accountPath(currentAd.account_id),
      token,
      {
        params: { fields: "currency" },
      },
    );
    ensureUsdCurrency(account.currency);
  }

  if (status === "ACTIVE") {
    if (campaignId) await graphRequest(campaignId, token, { method: "POST", params: { status } });
    if (adsetId) await graphRequest(adsetId, token, { method: "POST", params: { status } });
  }
  if (status) {
    await graphRequest(adId, token, { method: "POST", params: { status } });
  }
  if (Object.keys(adsetChanges).length && adsetId) {
    await graphRequest(adsetId, token, { method: "POST", params: adsetChanges });
  }

  if (postId) {
    const currentAd = await graphRequest<{ account_id?: string }>(adId, token, {
      params: { fields: "account_id" },
    });
    if (!currentAd.account_id) throw new MetaApiError("تعذر تحديد حساب الإعلان لتحديث المنشور.");
    const creative = await graphRequest<{ id?: string }>(
      `${accountPath(currentAd.account_id)}/adcreatives`,
      token,
      {
        method: "POST",
        params: { name: `Vortex updated creative ${Date.now()}`, object_story_id: postId },
      },
    );
    if (!creative.id) throw new MetaApiError("Meta لم تُرجع معرّف المادة الجديدة.");
    await graphRequest(adId, token, {
      method: "POST",
      params: { creative: { creative_id: creative.id } },
    });
  }

  return { ok: true, message: "تم تحديث الإعلان." };
}

async function activateAd(body: MetaBody): Promise<Record<string, unknown>> {
  const token = readToken(body);
  const adId = readId(body, "ad_id");
  const adsetId =
    typeof body.adset_id === "string" && body.adset_id ? readId(body, "adset_id") : null;
  const campaignId =
    typeof body.campaign_id === "string" && body.campaign_id ? readId(body, "campaign_id") : null;
  if (campaignId)
    await graphRequest(campaignId, token, { method: "POST", params: { status: "ACTIVE" } });
  if (adsetId) await graphRequest(adsetId, token, { method: "POST", params: { status: "ACTIVE" } });
  await graphRequest(adId, token, { method: "POST", params: { status: "ACTIVE" } });
  return { ok: true, message: "تم تفعيل الإعلان." };
}

export async function handleMetaApiRequest(request: Request, endpoint: string): Promise<Response> {
  if (request.method !== "POST") {
    return json({ ok: false, reason: "الطريقة غير مدعومة." }, 405);
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return json({ ok: false, reason: "يجب إرسال الطلب بصيغة JSON." }, 415);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_JSON_BYTES) {
    return json({ ok: false, reason: "حجم الطلب أكبر من الحد المسموح." }, 413);
  }

  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_JSON_BYTES) {
      return json({ ok: false, reason: "حجم الطلب أكبر من الحد المسموح." }, 413);
    }
    const body = JSON.parse(rawBody) as MetaBody;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ ok: false, reason: "بيانات الطلب غير صالحة." }, 400);
    }

    requireNoProxy(body);
    let result: Record<string, unknown>;
    switch (endpoint) {
      case "connect":
        result = await connect(readToken(body));
        break;
      case "token-info":
        result = await tokenInfo(readToken(body));
        break;
      case "page-posts":
        result = await pagePosts(body);
        break;
      case "pixels":
        result = await pixels(body);
        break;
      case "dark-post":
        result = await darkPost(body);
        break;
      case "delete-post":
        result = await deletePost(body);
        break;
      case "create-ad":
        result = await createAd(body);
        break;
      case "get-ad-status":
        result = await adStatus(body);
        break;
      case "update-ad":
        result = await updateAd(body);
        break;
      case "activate-ad":
        result = await activateAd(body);
        break;
      default:
        return json({ ok: false, reason: "مسار Meta API غير معروف." }, 404);
    }
    return json(result);
  } catch (error) {
    const status = error instanceof MetaApiError ? (error.status ?? 400) : 500;
    return json(
      {
        ok: false,
        reason: errorMessage(error),
        ...(error instanceof MetaApiError && error.code ? { code: error.code } : {}),
      },
      status,
    );
  }
}
