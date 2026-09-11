import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import {
  CTA_TYPES, MetaError, OBJECTIVES, graphGet, graphGetAll, graphPost,
  listRegions, searchCountries, uploadAdImage,
} from "../lib/metaApi.js";
import {
  deleteProfile, getActiveId, listProfiles, saveProfile, setActiveId,
} from "../lib/tokenProfiles.js";

/* ── shared styling ─────────────────────────────────────────── */
const panel = "rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-xl shadow-[0_18px_60px_-30px_rgba(0,0,0,0.9)]";
const field = "w-full rounded-xl border border-white/10 bg-[#0b0e17]/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20";
const label = "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400";
const primaryBtn = "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-600 px-5 py-2.5 text-sm font-black text-white shadow-[0_10px_30px_-10px_rgba(139,92,246,0.9)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
const ghostBtn = "inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/5 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-white/10 disabled:opacity-50";

const AGES = Array.from({ length: 65 - 13 + 1 }, (_, i) => 13 + i);

function Spinner({ size = 16 }) {
  return <span className="inline-block animate-spin rounded-full border-2 border-white/70 border-t-transparent" style={{ width: size, height: size }} />;
}
Spinner.propTypes = { size: PropTypes.number };

function Pill({ children, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-xs font-semibold text-violet-200">
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} className="text-violet-300/70 transition hover:text-white">×</button>
      )}
    </span>
  );
}
Pill.propTypes = { children: PropTypes.node, onRemove: PropTypes.func };

function Section({ title, hint, children, right }) {
  return (
    <section className={`${panel} p-5`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black tracking-tight text-white">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
Section.propTypes = { title: PropTypes.string, hint: PropTypes.string, children: PropTypes.node, right: PropTypes.node };

function errText(e) {
  if (e instanceof MetaError) return `${e.message}${e.code ? ` (code ${e.code})` : ""}`;
  return e?.message || "حدث خطأ غير متوقع";
}

/* ══════════════════════════════════════════════════════════════ */
export default function DarkPostStudio({ onClose }) {
  const [tab, setTab] = useState("connect");     // connect | create | manage
  const [profiles, setProfiles] = useState([]);
  const [activeId, setActive] = useState(null);
  const [toast, setToast] = useState(null);      // {type, text}

  const active = useMemo(() => profiles.find(p => p.id === activeId) || null, [profiles, activeId]);
  const token = active?.token || "";

  useEffect(() => {
    setProfiles(listProfiles());
    setActive(getActiveId());
  }, []);

  const notify = useCallback((text, type = "info") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 5000);
  }, []);

  /* ── profile form ── */
  const [pName, setPName] = useState("");
  const [pToken, setPToken] = useState("");
  const [pBusy, setPBusy] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const addProfile = async (e) => {
    e.preventDefault();
    setPBusy(true);
    try {
      const me = await graphGet("me", { fields: "id,name" }, pToken.trim());
      const saved = saveProfile({ name: pName || me.name, token: pToken.trim(), meta: { fbId: me.id, fbName: me.name } });
      setProfiles(listProfiles());
      setActive(saved.id);
      setPName(""); setPToken("");
      notify(`تم حفظ البروفايل: ${saved.name}`, "success");
    } catch (err) {
      notify(errText(err), "error");
    } finally { setPBusy(false); }
  };

  const switchProfile = (id) => {
    setActiveId(id); setActive(id);
    setAccounts([]); setPages([]); setActId(""); setPage(null);
    notify("تم تبديل البروفايل", "success");
  };

  const removeProfile = (id) => {
    const list = deleteProfile(id);
    setProfiles(list); setActive(getActiveId());
  };

  /* ── assets ── */
  const [accounts, setAccounts] = useState([]);
  const [pages, setPages] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [actId, setActId] = useState("");
  const [page, setPage] = useState(null);

  const loadAssets = useCallback(async () => {
    if (!token) return;
    setLoadingAssets(true);
    try {
      const [acc, pg] = await Promise.all([
        graphGetAll("me/adaccounts", { fields: "id,account_id,name,account_status,currency,timezone_name,amount_spent,balance" }, token),
        graphGetAll("me/accounts", { fields: "id,name,access_token,category,picture{url},tasks" }, token),
      ]);
      setAccounts(acc);
      setPages(pg);
      const live = acc.find(a => a.account_status === 1);
      if (live) setActId(live.id);
      if (pg[0]) setPage(pg[0]);
      notify(`تم جلب ${acc.length} حساب إعلاني و ${pg.length} صفحة`, "success");
    } catch (err) { notify(errText(err), "error"); }
    finally { setLoadingAssets(false); }
  }, [token, notify]);

  useEffect(() => { if (token && accounts.length === 0) loadAssets(); /* eslint-disable-next-line */ }, [token]);

  const account = accounts.find(a => a.id === actId) || null;
  const currency = account?.currency || "USD";

  /* ── creative form ── */
  const [form, setForm] = useState({
    name: "Dark Post", message: "", headline: "",
    link: "", cta: "LEARN_MORE", objective: "OUTCOME_TRAFFIC",
    budget: "10", days: "3", status: "PAUSED",
    gender: "all", ageMin: 18, ageMax: 65,
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const objective = OBJECTIVES.find(o => o.id === form.objective) || OBJECTIVES[0];

  const [images, setImages] = useState([]);          // {file, preview, hash, uploading}
  const fileRef = useRef(null);

  const addFiles = (files) => {
    const next = Array.from(files).slice(0, 10 - images.length).map(f => ({
      file: f, preview: URL.createObjectURL(f), hash: null, uploading: false,
    }));
    setImages(p => [...p, ...next]);
  };

  /* ── geo targeting ── */
  const [geoMode, setGeoMode] = useState("country");  // country | region
  const [countryQ, setCountryQ] = useState("");
  const [countryOpts, setCountryOpts] = useState([]);
  const [country, setCountry] = useState(null);
  const [regions, setRegions] = useState([]);
  const [pickedRegions, setPickedRegions] = useState([]);
  const [geoBusy, setGeoBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    const id = setTimeout(async () => {
      try { setCountryOpts(await searchCountries(countryQ, token)); } catch { /* ignore */ }
    }, 350);
    return () => clearTimeout(id);
  }, [countryQ, token]);

  const chooseCountry = async (c) => {
    setCountry(c); setPickedRegions([]); setRegions([]);
    if (geoMode !== "country") {
      setGeoBusy(true);
      try { setRegions(await listRegions(c.country_code, token)); }
      catch (err) { notify(errText(err), "error"); }
      finally { setGeoBusy(false); }
    }
  };

  useEffect(() => {
    if (geoMode === "region" && country && regions.length === 0) {
      (async () => {
        setGeoBusy(true);
        try { setRegions(await listRegions(country.country_code, token)); }
        catch (err) { notify(errText(err), "error"); }
        finally { setGeoBusy(false); }
      })();
    }
  }, [geoMode, country, regions.length, token, notify]);

  const geoSpec = () => {
    if (!country) return null;
    if (geoMode === "country") return { countries: [country.country_code] };
    if (geoMode === "region") {
      const list = pickedRegions.length ? pickedRegions : regions;
      if (!list.length) return { countries: [country.country_code] };
      return { regions: list.map(r => ({ key: r.key })) };
    }
    return { countries: [country.country_code] };
  };

  /* ── publish ── */
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState([]);
  const [result, setResult] = useState(null);

  const step = (text, state = "ok") => setSteps(p => [...p, { text, state }]);

  const publish = async () => {
    if (!token) return notify("أضف بروفايل بتوكن أولاً", "error");
    if (!actId) return notify("اختر الحساب الإعلاني", "error");
    if (!page) return notify("اختر الصفحة", "error");
    if (!form.message.trim()) return notify("اكتب محتوى الإعلان", "error");
    if (!images.length) return notify("ارفع صورة واحدة على الأقل", "error");
    if (objective.needsLink && !form.link.trim()) return notify("أدخل رابط الوجهة", "error");
    if (!country) return notify("اختر الدولة", "error");

    setBusy(true); setSteps([]); setResult(null);
    try {
      /* 1 — images */
      const hashes = [];
      for (let i = 0; i < images.length; i += 1) {
        const img = images[i];
        if (img.hash) { hashes.push(img.hash); continue; }
        const up = await uploadAdImage(actId, img.file, token);
        hashes.push(up.hash);
        setImages(p => p.map((x, idx) => (idx === i ? { ...x, hash: up.hash } : x)));
      }
      step(`تم رفع ${hashes.length} صورة`);

      /* 2 — campaign */
      const realObjective = objective.real || objective.id;
      const campaign = await graphPost(`${actId}/campaigns`, {
        name: `${form.name} — Campaign`,
        objective: realObjective,
        status: form.status,
        special_ad_categories: [],
        buying_type: "AUCTION",
        is_adset_budget_sharing_enabled: false,
      }, token);
      step(`تم إنشاء الحملة ${campaign.id}`);

      /* 3 — ad set */
      const targeting = {
        geo_locations: geoSpec(),
        age_min: Number(form.ageMin),
        age_max: Number(form.ageMax),
        ...(form.gender === "all" ? {} : { genders: [form.gender === "male" ? 1 : 2] }),
        publisher_platforms: ["facebook", "instagram"],
        targeting_automation: { advantage_audience: 0 },
      };
      // العرض يبدأ تلقائياً بعد 15 دقيقة من لحظة النشر
      const start = new Date(Date.now() + 15 * 60 * 1000);
      const end = new Date(start.getTime() + Number(form.days || 1) * 86400000);
      const adsetBody = {
        name: `${form.name} — Ad Set`,
        campaign_id: campaign.id,
        daily_budget: Math.round(Number(form.budget) * 100),
        billing_event: objective.billing,
        optimization_goal: objective.goal,
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        is_adset_budget_sharing_enabled: false,
        targeting,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: form.status,
      };
      if (objective.messenger) {
        adsetBody.destination_type = "MESSENGER";
        adsetBody.promoted_object = { page_id: page.id };
      }
      const adset = await graphPost(`${actId}/adsets`, adsetBody, token);
      step(`تم إنشاء المجموعة الإعلانية ${adset.id}`);

      /* 4 — dark post creative (unpublished) */
      const cta = objective.messenger
        ? { type: "MESSAGE_PAGE", value: { app_destination: "MESSENGER" } }
        : { type: form.cta, value: { link: form.link } };
      const linkUrl = objective.messenger
        ? `https://www.facebook.com/${page.id}`
        : form.link;

      let storySpec;
      if (hashes.length > 1) {
        storySpec = {
          page_id: page.id,
          link_data: {
            message: form.message,
            link: linkUrl,
            multi_share_optimized: true,
            child_attachments: hashes.map(h => ({
              link: linkUrl,
              image_hash: h,
              name: form.headline || form.name,
              call_to_action: cta,
            })),
          },
        };
      } else {
        storySpec = {
          page_id: page.id,
          link_data: {
            message: form.message,
            link: linkUrl,
            image_hash: hashes[0],
            name: form.headline || undefined,
            call_to_action: cta,
          },
        };
      }

      const creative = await graphPost(`${actId}/adcreatives`, {
        name: `${form.name} — Creative`,
        object_story_spec: storySpec,
        degrees_of_freedom_spec: { creative_features_spec: { standard_enhancements: { enroll_status: "OPT_OUT" } } },
      }, token);
      step(`تم إنشاء الدارك بوست ${creative.id}`);

      /* 5 — ad */
      const ad = await graphPost(`${actId}/ads`, {
        name: form.name,
        adset_id: adset.id,
        creative: { creative_id: creative.id },
        status: form.status,
      }, token);
      step(`تم نشر الإعلان ${ad.id}`);

      const payload = { campaignId: campaign.id, adsetId: adset.id, creativeId: creative.id, adId: ad.id };
      setResult(payload);
      setManageId(ad.id);
      notify(form.status === "ACTIVE" ? "تم نشر الإعلان نشطاً ✅" : "تم نشر الإعلان متوقفاً ⏸", "success");
    } catch (err) {
      step(errText(err), "err");
      notify(errText(err), "error");
    } finally { setBusy(false); }
  };

  /* ── manage / edit tab ── */
  const [manageId, setManageId] = useState("");
  const [detail, setDetail] = useState(null);
  const [mBusy, setMBusy] = useState(false);
  const [edit, setEdit] = useState(null);

  const loadAd = async (id = manageId) => {
    if (!id || !token) return;
    setMBusy(true); setDetail(null);
    try {
      const ad = await graphGet(id, {
        fields: [
          "id,name,status,effective_status,created_time,preview_shareable_link",
          "creative{id,name,object_story_spec,thumbnail_url,effective_object_story_id}",
          "adset{id,name,status,daily_budget,lifetime_budget,billing_event,optimization_goal,start_time,end_time,targeting}",
          "campaign{id,name,status,objective,daily_budget}",
          "insights.date_preset(maximum){impressions,clicks,spend,reach,ctr,cpc}",
        ].join(","),
      }, token);
      setDetail(ad);
      setEdit({
        adName: ad.name || "",
        adStatus: ad.status || "PAUSED",
        adsetName: ad.adset?.name || "",
        adsetStatus: ad.adset?.status || "PAUSED",
        budget: ad.adset?.daily_budget ? String(Number(ad.adset.daily_budget) / 100) : "",
        endTime: ad.adset?.end_time ? ad.adset.end_time.slice(0, 16) : "",
        ageMin: ad.adset?.targeting?.age_min || 18,
        ageMax: ad.adset?.targeting?.age_max || 65,
        gender: ad.adset?.targeting?.genders?.[0] === 1 ? "male" : ad.adset?.targeting?.genders?.[0] === 2 ? "female" : "all",
        campaignName: ad.campaign?.name || "",
        campaignStatus: ad.campaign?.status || "PAUSED",
      });
    } catch (err) { notify(errText(err), "error"); }
    finally { setMBusy(false); }
  };

  const saveEdits = async () => {
    if (!detail || !edit) return;
    setMBusy(true);
    try {
      await graphPost(detail.id, { name: edit.adName, status: edit.adStatus }, token);
      if (detail.adset?.id) {
        const t = { ...(detail.adset.targeting || {}) };
        t.age_min = Number(edit.ageMin);
        t.age_max = Number(edit.ageMax);
        if (edit.gender === "all") delete t.genders;
        else t.genders = [edit.gender === "male" ? 1 : 2];
        await graphPost(detail.adset.id, {
          name: edit.adsetName,
          status: edit.adsetStatus,
          ...(edit.budget ? { daily_budget: Math.round(Number(edit.budget) * 100) } : {}),
          ...(edit.endTime ? { end_time: new Date(edit.endTime).toISOString() } : {}),
          targeting: t,
        }, token);
      }
      if (detail.campaign?.id) {
        await graphPost(detail.campaign.id, { name: edit.campaignName, status: edit.campaignStatus }, token);
      }
      notify("تم حفظ التعديلات ✅", "success");
      loadAd(detail.id);
    } catch (err) { notify(errText(err), "error"); }
    finally { setMBusy(false); }
  };

  /* ── render ─────────────────────────────────────────────── */
  const tabs = [
    { id: "connect", label: "الاتصال", icon: "🔑" },
    { id: "create",  label: "إنشاء دارك بوست", icon: "🌑" },
    { id: "manage",  label: "التعديل والمتابعة", icon: "🛠" },
  ];

  return (
    <div dir="rtl" className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#070a12] text-white">
      {/* aurora backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 start-1/4 h-[420px] w-[420px] rounded-full bg-violet-600/20 blur-[130px]" />
        <div className="absolute -bottom-40 end-1/4 h-[420px] w-[420px] rounded-full bg-indigo-500/15 blur-[130px]" />
      </div>

      {/* header */}
      <header className="relative z-10 flex flex-wrap items-center gap-3 border-b border-white/8 bg-[#0b0f19]/80 px-5 py-3.5 backdrop-blur-xl">
        <button onClick={onClose} className={ghostBtn + " !px-3 !py-1.5 !text-xs"}>→ رجوع</button>
        <div className="h-5 w-px bg-white/10" />
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-base shadow-lg">🌑</span>
          <div>
            <h1 className="text-sm font-black leading-none tracking-tight">DARK POST STUDIO</h1>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300/70">Meta Marketing API</p>
          </div>
        </div>

        <div className="ms-auto flex items-center gap-2">
          {profiles.length > 0 && (
            <select value={activeId || ""} onChange={e => switchProfile(e.target.value)}
              className="rounded-xl border border-white/10 bg-[#0b0e17] px-3 py-2 text-xs font-bold text-white outline-none">
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${token ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
            {token ? "متصل" : "غير متصل"}
          </span>
        </div>
      </header>

      {/* tabs */}
      <nav className="relative z-10 flex gap-1.5 border-b border-white/8 bg-[#0a0d16]/60 px-5 py-2 backdrop-blur">
        {tabs.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`rounded-xl px-4 py-2 text-xs font-black transition ${
              tab === tb.id ? "bg-gradient-to-r from-violet-600/90 to-indigo-600/90 text-white shadow-lg" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}>
            <span className="me-1.5">{tb.icon}</span>{tb.label}
          </button>
        ))}
      </nav>

      <div className="relative z-10 flex-1 overflow-y-auto p-5">
        {/* ── CONNECT ── */}
        {tab === "connect" && (
          <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-2">
            <Section title="إضافة بروفايل جديد" hint="التوكن يُحفظ على جهازك فقط — لا يُرسل لأي خادم.">
              <form onSubmit={addProfile} className="space-y-3">
                <div>
                  <label className={label}>اسم البروفايل</label>
                  <input className={field} value={pName} onChange={e => setPName(e.target.value)} placeholder="حساب العمل الرئيسي" />
                </div>
                <div>
                  <label className={label}>User Access Token</label>
                  <div className="relative">
                    <input className={field + " pe-16"} type={showToken ? "text" : "password"} value={pToken}
                      onChange={e => setPToken(e.target.value)} placeholder="EAAB..." required />
                    <button type="button" onClick={() => setShowToken(s => !s)}
                      className="absolute inset-y-0 end-2 my-auto h-7 rounded-lg bg-white/10 px-2 text-[10px] font-bold text-slate-300">
                      {showToken ? "إخفاء" : "إظهار"}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">يحتاج صلاحيات: ads_management، pages_show_list، pages_manage_ads، business_management</p>
                </div>
                <button className={primaryBtn} disabled={pBusy}>{pBusy ? <Spinner /> : "＋"} حفظ وتفعيل</button>
              </form>
            </Section>

            <Section title="البروفايلات المحفوظة" hint="بدّل بين الحسابات بضغطة واحدة."
              right={<button onClick={loadAssets} disabled={!token || loadingAssets} className={ghostBtn + " !px-3 !py-1.5 !text-xs"}>
                {loadingAssets ? <Spinner /> : "⟳"} تحديث
              </button>}>
              {profiles.length === 0 && <p className="text-sm text-slate-500">لا يوجد بروفايلات بعد.</p>}
              <div className="space-y-2">
                {profiles.map(p => (
                  <div key={p.id} className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition ${
                    p.id === activeId ? "border-violet-400/40 bg-violet-500/10" : "border-white/8 bg-white/[0.02]"
                  }`}>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/40 to-indigo-500/40 text-sm font-black">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">{p.name}</p>
                      <p className="truncate text-[11px] text-slate-500">{p.meta?.fbName || "—"} · {p.token.slice(0, 10)}…</p>
                    </div>
                    {p.id !== activeId && <button onClick={() => switchProfile(p.id)} className={ghostBtn + " !px-3 !py-1.5 !text-[11px]"}>تفعيل</button>}
                    <button onClick={() => removeProfile(p.id)} className="rounded-lg px-2 py-1 text-xs text-red-400/80 transition hover:bg-red-500/10 hover:text-red-300">حذف</button>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="الحسابات الإعلانية" hint={`${accounts.length} حساب`}>
              <div className="max-h-64 space-y-2 overflow-y-auto pe-1">
                {accounts.map(a => (
                  <button key={a.id} onClick={() => setActId(a.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-start transition ${
                      actId === a.id ? "border-violet-400/40 bg-violet-500/10" : "border-white/8 bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{a.name}</p>
                      <p className="text-[11px] text-slate-500">{a.id} · {a.currency}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                      a.account_status === 1 ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
                      {a.account_status === 1 ? "نشط" : "معطّل"}
                    </span>
                  </button>
                ))}
                {!accounts.length && <p className="text-sm text-slate-500">اضغط تحديث بعد إضافة التوكن.</p>}
              </div>
            </Section>

            <Section title="الصفحات وتوكناتها" hint={`${pages.length} صفحة — توكن الصفحة يُجلب تلقائياً`}>
              <div className="max-h-64 space-y-2 overflow-y-auto pe-1">
                {pages.map(p => (
                  <div key={p.id} className={`rounded-xl border px-3.5 py-2.5 transition ${
                    page?.id === p.id ? "border-violet-400/40 bg-violet-500/10" : "border-white/8 bg-white/[0.02]"
                  }`}>
                    <button onClick={() => setPage(p)} className="flex w-full items-center gap-3 text-start">
                      {p.picture?.data?.url
                        ? <img src={p.picture.data.url} alt="" className="h-9 w-9 rounded-full object-cover" />
                        : <span className="h-9 w-9 rounded-full bg-white/10" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{p.name}</p>
                        <p className="text-[11px] text-slate-500">{p.id} · {p.category}</p>
                      </div>
                    </button>
                    {page?.id === p.id && p.access_token && (
                      <div className="mt-2 flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-2 py-1 text-[10px] text-violet-200">{p.access_token.slice(0, 28)}…</code>
                        <button onClick={() => { navigator.clipboard?.writeText(p.access_token); notify("تم نسخ توكن الصفحة", "success"); }}
                          className={ghostBtn + " !px-2.5 !py-1 !text-[10px]"}>نسخ</button>
                      </div>
                    )}
                  </div>
                ))}
                {!pages.length && <p className="text-sm text-slate-500">لا توجد صفحات بعد.</p>}
              </div>
            </Section>
          </div>
        )}

        {/* ── CREATE ── */}
        {tab === "create" && (
          <div className="mx-auto grid max-w-[1700px] items-start gap-5 md:grid-cols-2 xl:grid-cols-3">

            {/* عمود 1 — الوجهة والمحتوى */}
            <div className="space-y-5">
              <Section title="الوجهة" hint="الحساب الإعلاني والصفحة اللي هيتنشر عليها الدارك بوست">
                <div className="space-y-3">
                  <div>
                    <label className={label}>الحساب الإعلاني</label>
                    <select className={field} value={actId} onChange={e => setActId(e.target.value)}>
                      <option value="">— اختر —</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={label}>الصفحة</label>
                    <select className={field} value={page?.id || ""} onChange={e => setPage(pages.find(p => p.id === e.target.value) || null)}>
                      <option value="">— اختر —</option>
                      {pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
              </Section>

              <Section title="المحتوى الإبداعي" hint="ارفع صورة أو أكتر (أكتر من صورة = كاروسيل تلقائي)">
                <div className="mb-3 flex flex-wrap gap-3">
                  {images.map((img, i) => (
                    <div key={i} className="group relative h-24 w-24 overflow-hidden rounded-xl border border-white/10">
                      <img src={img.preview} alt="" className="h-full w-full object-cover" />
                      <button onClick={() => setImages(p => p.filter((_, x) => x !== i))}
                        className="absolute inset-x-0 bottom-0 bg-black/70 py-1 text-[10px] font-bold text-red-300 opacity-0 transition group-hover:opacity-100">حذف</button>
                      {img.hash && <span className="absolute top-1 end-1 rounded bg-emerald-500/80 px-1 text-[9px] font-black">✓</span>}
                    </div>
                  ))}
                  <button onClick={() => fileRef.current?.click()}
                    className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-white/15 text-slate-400 transition hover:border-violet-400/50 hover:text-violet-300">
                    <span className="text-2xl">＋</span><span className="text-[10px] font-bold">صورة</span>
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => addFiles(e.target.files)} />
                </div>
                <div className="space-y-3">
                  <div>
                    <label className={label}>نص الإعلان</label>
                    <textarea rows={4} className={field} value={form.message} onChange={e => set("message", e.target.value)} placeholder="اكتب محتوى الإعلان هنا…" />
                  </div>
                  <div>
                    <label className={label}>العنوان الرئيسي</label>
                    <input className={field} value={form.headline} onChange={e => set("headline", e.target.value)} placeholder="اختياري" />
                  </div>
                </div>
              </Section>
            </div>

            {/* عمود 2 — الهدف والاستهداف */}
            <div className="space-y-5">
              <Section title="الهدف والوجهة">
                <div className="space-y-3">
                  <div>
                    <label className={label}>هدف الإعلان</label>
                    <select className={field} value={form.objective} onChange={e => set("objective", e.target.value)}>
                      {OBJECTIVES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                  {objective.needsLink ? (
                    <>
                      <div>
                        <label className={label}>رابط الوجهة</label>
                        <input className={field} type="url" value={form.link} onChange={e => set("link", e.target.value)} placeholder="https://…" />
                      </div>
                      <div>
                        <label className={label}>زر الحث (CTA)</label>
                        <select className={field} value={form.cta} onChange={e => set("cta", e.target.value)}>
                          {CTA_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </>
                  ) : (
                    <p className="rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2.5 text-xs text-violet-200">
                      {objective.messenger ? "الوجهة: رسائل Messenger على الصفحة المختارة" : "لا يحتاج رابط"}
                    </p>
                  )}
                </div>
              </Section>

              <Section title="الاستهداف">
                <div className="mb-3 flex gap-1.5">
                  {[["country", "دولة كاملة"], ["region", "محافظات"]].map(([id, lb]) => (
                    <button key={id} onClick={() => setGeoMode(id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                        geoMode === id ? "bg-violet-600 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}>{lb}</button>
                  ))}
                </div>

                <label className={label}>الدولة</label>
                <input className={field} value={country ? `${country.name} (${country.country_code})` : countryQ}
                  onChange={e => { setCountry(null); setCountryQ(e.target.value); }} placeholder="اكتب اسم الدولة بالإنجليزية…" />
                {!country && countryQ && (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-[#0b0e17]">
                    {countryOpts.map(c => (
                      <button key={c.key || c.country_code} onClick={() => chooseCountry(c)}
                        className="block w-full px-3 py-2 text-start text-sm text-slate-300 transition hover:bg-violet-500/15">{c.name}</button>
                    ))}
                  </div>
                )}

                {geoMode === "region" && country && (
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <label className={label + " !mb-0"}>المحافظات {geoBusy && <Spinner size={12} />}</label>
                      <div className="flex gap-2">
                        <button onClick={() => setPickedRegions(regions)} className={ghostBtn + " !px-2.5 !py-1 !text-[10px]"}>تحديد الكل</button>
                        <button onClick={() => setPickedRegions([])} className={ghostBtn + " !px-2.5 !py-1 !text-[10px]"}>مسح</button>
                      </div>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {pickedRegions.map(r => <Pill key={r.key} onRemove={() => setPickedRegions(p => p.filter(x => x.key !== r.key))}>{r.name}</Pill>)}
                      {!pickedRegions.length && <span className="text-[11px] text-slate-500">لم تحدد شيئاً — سيتم استهداف كل محافظات الدولة.</span>}
                    </div>
                    <div className="max-h-44 overflow-y-auto rounded-xl border border-white/10 bg-[#0b0e17] p-1">
                      {regions.map(r => {
                        const on = pickedRegions.some(x => x.key === r.key);
                        return (
                          <button key={r.key} onClick={() => setPickedRegions(p => on ? p.filter(x => x.key !== r.key) : [...p, r])}
                            className={`m-0.5 inline-block rounded-lg px-2.5 py-1 text-xs transition ${on ? "bg-violet-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>
                            {r.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className={label}>الجنس</label>
                    <select className={field} value={form.gender} onChange={e => set("gender", e.target.value)}>
                      <option value="all">الجميع</option>
                      <option value="male">ذكور</option>
                      <option value="female">إناث</option>
                    </select>
                  </div>
                  <div>
                    <label className={label}>أصغر عمر</label>
                    <select className={field} value={form.ageMin} onChange={e => set("ageMin", e.target.value)}>
                      {AGES.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={label}>أكبر عمر</label>
                    <select className={field} value={form.ageMax} onChange={e => set("ageMax", e.target.value)}>
                      {AGES.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
              </Section>
            </div>

            {/* عمود 3 — الميزانية والنشر والمعاينة */}
            <div className="space-y-5">
              <Section title="الميزانية والنشر" hint="كل إعلان يبدأ العرض تلقائياً بعد 15 دقيقة من لحظة النشر">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={label}>اسم الإعلان</label>
                    <input className={field} value={form.name} onChange={e => set("name", e.target.value)} />
                  </div>
                  <div>
                    <label className={label}>الميزانية اليومية ({currency})</label>
                    <input className={field} type="number" min="1" step="0.01" value={form.budget} onChange={e => set("budget", e.target.value)} />
                  </div>
                  <div>
                    <label className={label}>المدة (أيام)</label>
                    <input className={field} type="number" min="1" value={form.days} onChange={e => set("days", e.target.value)} />
                  </div>
                  <div>
                    <label className={label}>حالة النشر</label>
                    <div className="flex gap-2">
                      {[["ACTIVE", "نشط ▶"], ["PAUSED", "متوقف ⏸"]].map(([id, lb]) => (
                        <button key={id} onClick={() => set("status", id)}
                          className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                            form.status === id
                              ? id === "ACTIVE" ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"
                              : "border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"}`}>{lb}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-3 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-[11px] text-violet-200">
                  ⏱ موعد بدء العرض: بعد 15 دقيقة من النشر (تلقائي)
                </p>
                <button onClick={publish} disabled={busy} className={primaryBtn + " mt-4 w-full !py-3"}>
                  {busy ? <><Spinner /> جاري النشر…</> : "🌑 نشر الدارك بوست"}
                </button>
              </Section>

              <Section title="معاينة مباشرة">
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#111827]">
                  <div className="flex items-center gap-2.5 p-3">
                    {page?.picture?.data?.url
                      ? <img src={page.picture.data.url} alt="" className="h-10 w-10 rounded-full object-cover" />
                      : <span className="h-10 w-10 rounded-full bg-white/10" />}
                    <div>
                      <p className="text-sm font-bold">{page?.name || "اسم الصفحة"}</p>
                      <p className="text-[10px] text-slate-500">Sponsored · 🌐</p>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap px-3 pb-3 text-sm text-slate-200">{form.message || "نص الإعلان يظهر هنا…"}</p>
                  {images[0]
                    ? <img src={images[0].preview} alt="" className="max-h-72 w-full object-cover" />
                    : <div className="flex h-44 items-center justify-center bg-black/40 text-xs text-slate-600">لا توجد صورة</div>}
                  <div className="flex items-center justify-between gap-3 bg-[#0d1420] px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[10px] uppercase text-slate-500">{form.link || (objective.messenger ? "MESSENGER" : "example.com")}</p>
                      <p className="truncate text-sm font-bold">{form.headline || form.name}</p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-bold">
                      {objective.messenger ? "Send Message" : form.cta.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              </Section>

              {(steps.length > 0 || result) && (
                <Section title="سجل النشر">
                  <ol className="space-y-1.5 text-xs">
                    {steps.map((s, i) => (
                      <li key={i} className={s.state === "err" ? "text-red-300" : "text-emerald-300"}>
                        {s.state === "err" ? "✖" : "✔"} {s.text}
                      </li>
                    ))}
                  </ol>
                  {result && (
                    <button onClick={() => { setTab("manage"); loadAd(result.adId); }} className={primaryBtn + " mt-4 w-full"}>
                      فتح في تاب التعديل ↗
                    </button>
                  )}
                </Section>
              )}
            </div>
          </div>
        )}

        {/* ── MANAGE ── */}
        {tab === "manage" && (
          <div className="mx-auto max-w-5xl space-y-5">
            <Section title="جلب إعلان" hint="يتم نقل الإعلان تلقائياً هنا بعد النشر — أو الصق أي Ad ID">
              <div className="flex flex-wrap gap-2">
                <input className={field + " flex-1"} value={manageId} onChange={e => setManageId(e.target.value)} placeholder="Ad ID" />
                <button onClick={() => loadAd()} disabled={mBusy || !manageId} className={primaryBtn}>
                  {mBusy ? <Spinner /> : "⟳"} جلب الحالة
                </button>
              </div>
            </Section>

            {detail && edit && (
              <>
                <Section title="الحالة التفصيلية">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ["حالة الإعلان", detail.effective_status],
                      ["الهدف", detail.campaign?.objective],
                      ["الميزانية اليومية", detail.adset?.daily_budget ? `${Number(detail.adset.daily_budget) / 100} ${currency}` : "—"],
                      ["تحسين", detail.adset?.optimization_goal],
                      ["الظهور", detail.insights?.data?.[0]?.impressions || "0"],
                      ["النقرات", detail.insights?.data?.[0]?.clicks || "0"],
                      ["الإنفاق", detail.insights?.data?.[0]?.spend || "0"],
                      ["CTR", detail.insights?.data?.[0]?.ctr || "0"],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">{k}</p>
                        <p className="mt-1 truncate text-sm font-bold text-white">{v || "—"}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-3">
                    <p>Ad: {detail.id}</p>
                    <p>Ad Set: {detail.adset?.id}</p>
                    <p>Campaign: {detail.campaign?.id}</p>
                  </div>
                  {detail.preview_shareable_link && (
                    <a href={detail.preview_shareable_link} target="_blank" rel="noreferrer" className={ghostBtn + " mt-3"}>معاينة الإعلان ↗</a>
                  )}
                </Section>

                <Section title="تعديل" hint="عدّل ما تشاء ثم احفظ — التعديل يذهب مباشرة إلى Meta">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="space-y-3">
                      <p className="text-xs font-black text-violet-300">الحملة</p>
                      <input className={field} value={edit.campaignName} onChange={e => setEdit(p => ({ ...p, campaignName: e.target.value }))} />
                      <select className={field} value={edit.campaignStatus} onChange={e => setEdit(p => ({ ...p, campaignStatus: e.target.value }))}>
                        <option value="ACTIVE">نشط</option><option value="PAUSED">متوقف</option>
                      </select>
                    </div>
                    <div className="space-y-3">
                      <p className="text-xs font-black text-violet-300">المجموعة الإعلانية</p>
                      <input className={field} value={edit.adsetName} onChange={e => setEdit(p => ({ ...p, adsetName: e.target.value }))} />
                      <select className={field} value={edit.adsetStatus} onChange={e => setEdit(p => ({ ...p, adsetStatus: e.target.value }))}>
                        <option value="ACTIVE">نشط</option><option value="PAUSED">متوقف</option>
                      </select>
                      <input className={field} type="number" min="1" step="0.01" value={edit.budget}
                        onChange={e => setEdit(p => ({ ...p, budget: e.target.value }))} placeholder={`الميزانية اليومية (${currency})`} />
                      <input className={field} type="datetime-local" value={edit.endTime}
                        onChange={e => setEdit(p => ({ ...p, endTime: e.target.value }))} />
                      <div className="grid grid-cols-3 gap-2">
                        <select className={field} value={edit.gender} onChange={e => setEdit(p => ({ ...p, gender: e.target.value }))}>
                          <option value="all">الجميع</option><option value="male">ذكور</option><option value="female">إناث</option>
                        </select>
                        <select className={field} value={edit.ageMin} onChange={e => setEdit(p => ({ ...p, ageMin: e.target.value }))}>
                          {AGES.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <select className={field} value={edit.ageMax} onChange={e => setEdit(p => ({ ...p, ageMax: e.target.value }))}>
                          {AGES.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <p className="text-xs font-black text-violet-300">الإعلان</p>
                      <input className={field} value={edit.adName} onChange={e => setEdit(p => ({ ...p, adName: e.target.value }))} />
                      <select className={field} value={edit.adStatus} onChange={e => setEdit(p => ({ ...p, adStatus: e.target.value }))}>
                        <option value="ACTIVE">نشط</option><option value="PAUSED">متوقف</option>
                      </select>
                      {detail.creative?.thumbnail_url && (
                        <img src={detail.creative.thumbnail_url} alt="" className="w-full rounded-xl border border-white/10 object-cover" />
                      )}
                    </div>
                  </div>
                  <button onClick={saveEdits} disabled={mBusy} className={primaryBtn + " mt-4"}>
                    {mBusy ? <Spinner /> : "💾"} حفظ التعديلات
                  </button>
                </Section>
              </>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-5 start-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm font-bold shadow-2xl backdrop-blur ${
          toast.type === "error" ? "border-red-500/40 bg-red-500/15 text-red-200"
            : toast.type === "success" ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
            : "border-white/15 bg-white/10 text-slate-100"}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

DarkPostStudio.propTypes = { onClose: PropTypes.func.isRequired };
