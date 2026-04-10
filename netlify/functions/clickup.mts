import type { Context } from "@netlify/functions";

const CLICKUP_TOKEN = Netlify.env.get("CLICKUP_API_TOKEN");
const BASE = "https://api.clickup.com/api/v2";

const LISTS = {
  campaigns: "901605021480",
  content:   "901613760281",
  alwayson:  "901613760528",
  paid:      "901613760525",
  holidays:  "901605021479",
};

// ── Campaign Type dropdown (field id: 3cebb834, renamed from "Content Type") ──
const CAMPAIGN_TYPE_MAP: Record<string, string> = {
  "6b26d75c-5288-442a-981c-ed4c5b5c4293": "Paid Ads Campaign",
  "c67069ed-68f6-4b34-b934-0f0cee5fbe2f": "Organic Campaign",
  "7b30af30-3175-4500-84b6-6ecb2e633466": "Campaign Task",
  "67df7085-a7b0-4e46-a111-e17eae6db20f": "Selling Season",
};

// ── Content Type dropdown (field id: 748aec8a, new field on content/alwayson) ──
const CONTENT_TYPE_MAP: Record<string, string> = {
  "bbdb63be-a535-4d44-988f-c0c39df4667f": "Tiktok & Reel",
  "89a66db0-6731-4fde-9fc1-76f3f3f94667": "Tiktok",
  "fbf1920b-673b-49f4-a854-17180d30c02c": "Reel",
  "9ada0e43-5c99-4e7a-82ea-f579cddaf31c": "Carousel",
  "ca320dc7-7e5e-44f0-84db-8de07a64b037": "Image",
  "49d4a869-3ab8-4410-9e09-62f20d6f4634": "Stories",
  "2bb5d4ff-b702-4cfc-a798-60fd1b491563": "FB Post",
  "7ba4c11d-77d2-4f30-a1d9-6bff84a3b63a": "EDM",
  "4f9866ec-b427-44b5-ae7d-190bb7028e1e": "Blog",
  "e952f867-cb05-4110-81fe-eb4005aea069": "Pop Up",
  "d301eaeb-21a7-48e2-ad37-aa496e674e9c": "Web Banner",
  "110e76d2-2d27-4662-99c2-08a051932dba": "Landing Page",
};

// ── Content Type dropdown index → name (API returns orderindex as number) ──
const CONTENT_TYPE_BY_INDEX: Record<number, string> = {
  0: "Tiktok & Reel", 1: "Tiktok", 2: "Reel", 3: "Carousel",
  4: "Image", 5: "Stories", 6: "FB Post", 7: "EDM",
  8: "Blog", 9: "Pop Up", 10: "Web Banner", 11: "Landing Page",
};

// ── Publish Location labels (field id: d6772935) ──
const PUBLISH_LOCATION_MAP: Record<string, string> = {
  "bd98450a-4924-4f88-9cba-5328f53185b4": "TikTok",
  "c018ba0f-8b8c-4401-8a11-d948a80597a0": "YouTube",
  "3b1303cf-c6c2-4b1a-aeab-3fb9621dd2a8": "IG/FB",
  "7b91e229-1748-455b-b853-842c0848c719": "Paid Ad",
  "eea4773f-dc3b-40d8-ad86-6e44691e3a80": "IG Trial",
  "1215d30f-7e7e-49eb-8147-33d2b5421a86": "Website",
  "b7f5ec79-cada-4ad7-8860-8928205d5638": "Email",
};

// ── Hemisphere dropdown ──
const HEMISPHERE_MAP: Record<number, string> = { 0: "Both", 1: "Southern", 2: "Northern" };

function resolveDropdown(field: any, fallbackMap: Record<string, string>, fallbackByIndex?: Record<number, string>): { name: string; color: string | null } | null {
  if (!field || field.value === null || field.value === undefined) return null;
  const opts: any[] = field.type_config?.options || [];
  let name = "";
  let color: string | null = null;
  if (typeof field.value === "number") {
    const opt = opts.find((o: any) => o.orderindex === field.value);
    name  = opt?.name || (fallbackByIndex ? fallbackByIndex[field.value] : "") || String(field.value);
    color = (opt?.color && opt.color !== "none") ? opt.color : null;
  } else if (typeof field.value === "string") {
    const opt = opts.find((o: any) => o.id === field.value);
    name  = opt?.name || fallbackMap[field.value] || field.value;
    color = (opt?.color && opt.color !== "none") ? opt.color : null;
  }
  return name ? { name, color } : null;
}

function resolveLocations(field: any): { name: string; color: string | null }[] {
  if (!field || !field.value) return [];
  const vals = Array.isArray(field.value) ? field.value : [field.value];
  const opts: any[] = field.type_config?.options || [];
  return vals.map((v: any) => {
    const id = typeof v === "string" ? v : (v?.id || "");
    const opt = opts.find((o: any) => o.id === id);
    const name  = opt?.label || opt?.name || PUBLISH_LOCATION_MAP[id] || String(id);
    const color = (opt?.color && opt.color !== "none") ? opt.color : null;
    return { name, color };
  }).filter((x: any) => x.name);
}

// ClickUp stores date-only fields as midnight in the user's local timezone.
// For AEDT (UTC+11) that's 13:00 UTC the *previous* calendar day.
// Adding 12 hours before extracting the UTC date correctly maps any timezone
// from UTC-12 to UTC+12 back to the intended calendar date.
function tsToDate(ms: number): string {
  return new Date(ms + 12 * 60 * 60 * 1000).toISOString().split("T")[0];
}

// Write a YYYY-MM-DD string as midnight UTC. ClickUp will display the correct
// local date because local-midnight timestamps all fall within the same calendar
// day after the +12h read correction above.
function dateStrToClickUpMs(dateStr: string): number {
  return new Date(dateStr + "T00:00:00.000Z").getTime();
}

function resolvePublishDate(fields: any[]): string | null {
  const f = fields?.find((f: any) => f.name === "Publish Date");
  if (!f || !f.value) return null;
  return tsToDate(Number(f.value));
}

function resolveEndDate(fields: any[]): string | null {
  const f = fields?.find((f: any) => f.name === "End date");
  if (!f || !f.value) return null;
  return tsToDate(Number(f.value));
}

function resolveParentCampaign(fields: any[]): string | null {
  const f = fields?.find((f: any) =>
    f.name === "Parent Campaign" || f.name === "Campaign" || f.name === "Related Campaign" || f.name === "Paid Ads Campaign"
  );
  if (!f || f.value === null || f.value === undefined) return null;
  switch (f.type) {
    case "drop_down": {
      const opts: any[] = f.type_config?.options || [];
      const opt = typeof f.value === "number"
        ? opts.find((o: any) => o.orderindex === f.value)
        : opts.find((o: any) => o.id === f.value);
      return opt?.name || null;
    }
    case "short_text": case "text":
      return typeof f.value === "string" ? f.value : null;
    case "list_relationship": {
      const vals = Array.isArray(f.value) ? f.value : [f.value];
      const names = vals.map((v: any) => v?.name || v?.title || "").filter(Boolean);
      return names.length ? names.join(", ") : null;
    }
    default:
      return typeof f.value === "string" ? f.value : null;
  }
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (!CLICKUP_TOKEN) return new Response(JSON.stringify({ error: "Missing CLICKUP_API_TOKEN" }), { status: 500, headers });

  try {
    // ── GET tasks ──
    if (action === "tasks") {
      const results = await Promise.all(
        Object.entries(LISTS).map(async ([layer, listId]) => {
          const res = await fetch(
            `${BASE}/list/${listId}/task?include_closed=true&subtasks=false`,
            { headers: { Authorization: CLICKUP_TOKEN } }
          );
          const data = await res.json() as any;
          return (data.tasks || []).map((t: any) => {
            const cf = t.custom_fields || [];
            // "Content Type" (748aec8a) for pill display; "Campaign Type" (3cebb834) for sublayer
            const contentTypeField  = cf.find((f: any) => f.name === "Content Type" && f.type === "drop_down");
            const campaignTypeField = cf.find((f: any) => f.name === "Campaign Type" && f.type === "drop_down");
            const publishLocField   = cf.find((f: any) => f.name === "Publish Location");
            const publishDateField  = cf.find((f: any) => f.name === "Publish Date");
            const publishDate       = publishDateField?.value ? tsToDate(Number(publishDateField.value)) : null;
            const publishDateFieldId = publishDateField?.id || null;
            const endDate           = resolveEndDate(cf);

            // publishDate is the primary calendar date; t.start_date is a workflow field
            // and must NOT override the publish date for display purposes.
            const startDate = publishDate
              || (t.start_date ? tsToDate(Number(t.start_date)) : null)
              || (t.due_date  ? tsToDate(Number(t.due_date))   : null);

            // For campaigns, due_date is the genuine campaign end.
            // For content/alwayson/paid, only use explicit "End date" field; never fall
            // back to due_date (which would turn a single-publish-day task into a span).
            const computedEnd = layer === "campaigns"
              ? (endDate || publishDate || (t.due_date ? tsToDate(Number(t.due_date)) : startDate))
              : (endDate || startDate);

            return {
              id:               t.id,
              title:            t.name,
              layer,
              start:            startDate,
              end:              computedEnd,
              publishDate,
              publishDateFieldId,
              status:           t.status?.status || "",
              statusColor:      t.status?.color  || "#6b7280",
              url:         t.url,
              assignees:   t.assignees?.map((a: any) => ({ id: a.id, name: a.username })) || [],
              type:        resolveDropdown(contentTypeField, CONTENT_TYPE_MAP, CONTENT_TYPE_BY_INDEX),
              campaignType: resolveDropdown(campaignTypeField, CAMPAIGN_TYPE_MAP),
              locations:   resolveLocations(publishLocField),
              campaign:    resolveParentCampaign(cf),
            };
          });
        })
      );
      return new Response(JSON.stringify(results.flat()), { headers });
    }

    // ── GET single task detail ──
    if (action === "task") {
      const taskId = url.searchParams.get("id");
      if (!taskId) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400, headers });
      const res = await fetch(`${BASE}/task/${taskId}`, {
        headers: { Authorization: CLICKUP_TOKEN }
      });
      const t = await res.json() as any;

      // Fetch available statuses for this task's list so the frontend can show an inline status picker
      let statuses: { status: string; color: string; type: string }[] = [];
      if (t.list?.id) {
        try {
          const lr = await fetch(`${BASE}/list/${t.list.id}`, { headers: { Authorization: CLICKUP_TOKEN } });
          const ld = await lr.json() as any;
          statuses = (ld.statuses || []).map((s: any) => ({
            status: s.status,
            color:  s.color || "#6b7280",
            type:   s.type,
          }));
        } catch {}
      }

      return new Response(JSON.stringify({
        id:           t.id,
        name:         t.name,
        description:  t.description || "",
        status:       t.status?.status || "",
        statusColor:  t.status?.color || "#6b7280",
        url:          t.url,
        startDate:    t.start_date ? tsToDate(Number(t.start_date)) : null,
        dueDate:      t.due_date   ? tsToDate(Number(t.due_date))   : null,
        assignees:    (t.assignees || []).map((a: any) => ({ id: a.id, name: a.username, avatar: a.profilePicture })),
        customFields: (t.custom_fields || []).filter((f: any) => f.value !== null && f.value !== undefined && f.value !== ""),
        listName:     t.list?.name || "",
        statuses,
      }), { headers });
    }

    // ── GET list field definitions ──
    if (action === "listfields") {
      const list = url.searchParams.get("list") || "";
      const listId = LISTS[list as keyof typeof LISTS];
      if (!listId) return new Response(JSON.stringify([]), { headers });
      const res = await fetch(`${BASE}/list/${listId}/field`, { headers: { Authorization: CLICKUP_TOKEN } });
      const data = await res.json() as any;
      return new Response(JSON.stringify(data.fields || []), { headers });
    }

    // ── POST update task ──
    if (action === "update" && req.method === "POST") {
      const body = await req.json() as any;
      const { id: taskId, status, name, startDate, dueDate, description, publishDate, publishDateFieldId } = body;
      if (!taskId) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400, headers });
      const payload: any = {};
      if (status      !== undefined) payload.status      = status;
      if (name        !== undefined) payload.name        = name;
      if (description !== undefined) payload.description = description;
      if (startDate !== undefined) payload.start_date = startDate ? dateStrToClickUpMs(startDate) : null;
      if (dueDate   !== undefined) payload.due_date   = dueDate   ? dateStrToClickUpMs(dueDate)   : null;
      const res = await fetch(`${BASE}/task/${taskId}`, {
        method: "PUT",
        headers: { Authorization: CLICKUP_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json() as any;
        return new Response(JSON.stringify({ error: err.err || "Update failed" }), { status: res.status, headers });
      }
      // Update Publish Date custom field if provided
      if (publishDateFieldId) {
        const fieldRes = publishDate
          ? await fetch(`${BASE}/task/${taskId}/field/${publishDateFieldId}`, {
              method: "POST",
              headers: { Authorization: CLICKUP_TOKEN, "Content-Type": "application/json" },
              body: JSON.stringify({ value: dateStrToClickUpMs(publishDate) }),
            })
          : await fetch(`${BASE}/task/${taskId}/field/${publishDateFieldId}`, {
              method: "DELETE",
              headers: { Authorization: CLICKUP_TOKEN },
            });
        if (!fieldRes.ok) {
          const errText = await fieldRes.text();
          console.error(`Publish Date field update failed for task ${taskId}:`, errText);
          return new Response(JSON.stringify({ error: "Publish Date field update failed", detail: errText }), { status: 500, headers });
        }
      }
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    // ── POST create task ──
    if (action === "create" && req.method === "POST") {
      const body = await req.json() as any;
      const listId = LISTS[body.layer as keyof typeof LISTS] || LISTS.content;
      const customFields: any[] = [];
      if (body.contentType !== undefined && body.contentType !== "") {
        // Campaigns list uses "Campaign Type" (3cebb834); content/alwayson use "Content Type" (748aec8a)
        const typeFieldId = (body.layer === "campaigns") ? "3cebb834" : "748aec8a";
        customFields.push({ id: typeFieldId, value: Number(body.contentType) });
      }
      const payload: any = {
        name:          body.title,
        status:        "planning",
        start_date:    body.start ? dateStrToClickUpMs(body.start) : undefined,
        due_date:      body.end   ? dateStrToClickUpMs(body.end)   : (body.start ? dateStrToClickUpMs(body.start) : undefined),
        custom_fields: customFields.length ? customFields : undefined,
      };
      const res = await fetch(`${BASE}/list/${listId}/task`, {
        method: "POST",
        headers: { Authorization: CLICKUP_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const task = await res.json() as any;
      if (!task.id) return new Response(JSON.stringify({ error: task.err || "Create failed" }), { status: 500, headers });

      // Lookup list custom fields once (used for both hemisphere and Publish Date)
      let listFields: any[] = [];
      try {
        const fr = await fetch(`${BASE}/list/${listId}/field`, { headers: { Authorization: CLICKUP_TOKEN } });
        const fd = await fr.json() as any;
        listFields = fd.fields || [];
      } catch { /* best-effort */ }

      // Set Publish Date custom field when a publishDate is provided
      if (body.publishDate && listFields.length) {
        const pdf = listFields.find((f: any) => f.name === "Publish Date");
        if (pdf?.id) {
          try {
            await fetch(`${BASE}/task/${task.id}/field/${pdf.id}`, {
              method: "POST",
              headers: { Authorization: CLICKUP_TOKEN, "Content-Type": "application/json" },
              body: JSON.stringify({ value: dateStrToClickUpMs(body.publishDate) }),
            });
          } catch { /* best-effort */ }
        }
      }

      // Set hemisphere via field endpoint
      if (body.hemisphere !== undefined && body.hemisphere !== "" && body.hemisphere !== null) {
        const hf = listFields.find((f: any) => f.name?.toLowerCase().includes("hemisphere"));
        if (hf?.id) {
          try {
            await fetch(`${BASE}/task/${task.id}/field/${hf.id}`, {
              method: "POST",
              headers: { Authorization: CLICKUP_TOKEN, "Content-Type": "application/json" },
              body: JSON.stringify({ value: Number(body.hemisphere) }),
            });
          } catch { /* best-effort */ }
        }
      }

      // Set Region Specific field for holidays
      if (body.regionSpecific) {
        const rsf = listFields.find((f: any) => f.name === "Region Specific?");
        if (rsf?.id) {
          try {
            await fetch(`${BASE}/task/${task.id}/field/${rsf.id}`, {
              method: "POST",
              headers: { Authorization: CLICKUP_TOKEN, "Content-Type": "application/json" },
              body: JSON.stringify({ value: body.regionSpecific }),
            });
          } catch { /* best-effort */ }
        }
      }

      return new Response(JSON.stringify({ id: task.id, url: task.url }), { headers });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = { path: "/api/clickup" };
