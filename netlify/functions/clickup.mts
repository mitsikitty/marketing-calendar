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

// ── Content Type dropdown (field id: 3cebb834) ──
const CONTENT_TYPE_MAP: Record<string, string> = {
  "67df7085-a7b0-4e46-a111-e17eae6db20f": "Selling Season",
  "7f2f91c1-9241-4083-b9b5-940bd986709e": "Always On",
  "c67069ed-68f6-4b34-b934-0f0cee5fbe2f": "Campaign",
  "1532c87d-7f97-40ee-8566-dadd2bbd212e": "TikTok",
  "99253399-a249-4974-b832-5e36eb8dd9fe": "Reel",
  "14d1f926-5a13-4af1-aab4-33107b0bf8ed": "Carousel",
  "2cbcedf0-a4bd-4550-a0bf-79f188643ac0": "Image",
  "458ff636-4838-444e-a9a0-b5597a2d217d": "Stories",
  "a82a3191-68cf-4f8f-bf62-7fb54498279d": "FB Post",
  "9bd505f6-0879-4f9b-b14f-a8ca9e346c1c": "EDM",
  "531e488d-830f-4811-999e-3b3ec29e8de0": "Blog",
  "c1b6e48e-bf41-45e1-a844-5810c5497d9c": "Pop Up",
  "703f4d40-7330-4468-976e-dcba86000a3f": "Web Banner",
};

// ── Content Type dropdown index → name (API returns orderindex as number) ──
const CONTENT_TYPE_BY_INDEX: Record<number, string> = {
  0: "Selling Season", 1: "Always On", 2: "Campaign", 3: "TikTok",
  4: "Reel", 5: "Carousel", 6: "Image", 7: "Stories",
  8: "FB Post", 9: "EDM", 10: "Blog", 11: "Pop Up", 12: "Web Banner",
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

function resolveContentType(field: any): { name: string; color: string | null } | null {
  if (!field || field.value === null || field.value === undefined) return null;
  const opts: any[] = field.type_config?.options || [];
  let name = "";
  let color: string | null = null;
  if (typeof field.value === "number") {
    const opt = opts.find((o: any) => o.orderindex === field.value);
    name  = opt?.name || CONTENT_TYPE_BY_INDEX[field.value] || String(field.value);
    color = (opt?.color && opt.color !== "none") ? opt.color : null;
  } else if (typeof field.value === "string") {
    const opt = opts.find((o: any) => o.id === field.value);
    name  = opt?.name || CONTENT_TYPE_MAP[field.value] || field.value;
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

// ClickUp stores date-only timestamps as midnight UTC of the *next* day.
// Subtract 1ms so "March 2 00:00:00 UTC" correctly maps back to "2025-03-01".
function tsToDate(ms: number): string {
  const d = new Date(ms);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    d.setTime(d.getTime() - 1);
  }
  return d.toISOString().split("T")[0];
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
    f.name === "Parent Campaign" || f.name === "Campaign" || f.name === "Related Campaign"
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
            `${BASE}/list/${listId}/task?include_closed=false&subtasks=false`,
            { headers: { Authorization: CLICKUP_TOKEN } }
          );
          const data = await res.json() as any;
          return (data.tasks || []).map((t: any) => {
            const cf = t.custom_fields || [];
            const contentTypeField = cf.find((f: any) => f.name === "Content Type" && f.type === "drop_down");
            const publishLocField  = cf.find((f: any) => f.name === "Publish Location");
            const publishDate      = resolvePublishDate(cf);
            const endDate          = resolveEndDate(cf);

            // publishDate is the primary calendar date; t.start_date is a workflow field
            // and must NOT override the publish date for display purposes.
            const startDate = publishDate
              || (t.start_date ? tsToDate(Number(t.start_date)) : null)
              || (t.due_date  ? tsToDate(Number(t.due_date))   : null);

            return {
              id:          t.id,
              title:       t.name,
              layer,
              start:       startDate,
              end:         endDate || publishDate || (t.due_date ? tsToDate(Number(t.due_date)) : startDate),
              publishDate,
              status:      t.status?.status || "",
              url:         t.url,
              assignees:   t.assignees?.map((a: any) => ({ id: a.id, name: a.username })) || [],
              type:        resolveContentType(contentTypeField),
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

    // ── POST update task ──
    if (action === "update" && req.method === "POST") {
      const body = await req.json() as any;
      const { id: taskId, status, name, startDate, dueDate, description, publishDate, publishDateFieldId } = body;
      if (!taskId) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400, headers });
      const payload: any = {};
      if (status      !== undefined) payload.status      = status;
      if (name        !== undefined) payload.name        = name;
      if (description !== undefined) payload.description = description;
      if (startDate !== undefined) payload.start_date = startDate ? new Date(startDate).getTime() : null;
      if (dueDate   !== undefined) payload.due_date   = dueDate   ? new Date(dueDate).getTime()   : null;
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
      if (publishDateFieldId !== undefined) {
        try {
          if (publishDate) {
            await fetch(`${BASE}/task/${taskId}/field/${publishDateFieldId}`, {
              method: "POST",
              headers: { Authorization: CLICKUP_TOKEN, "Content-Type": "application/json" },
              body: JSON.stringify({ value: new Date(publishDate).getTime() }),
            });
          } else {
            await fetch(`${BASE}/task/${taskId}/field/${publishDateFieldId}`, {
              method: "DELETE",
              headers: { Authorization: CLICKUP_TOKEN },
            });
          }
        } catch { /* best-effort */ }
      }
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    // ── POST create task ──
    if (action === "create" && req.method === "POST") {
      const body = await req.json() as any;
      const listId = LISTS[body.layer as keyof typeof LISTS] || LISTS.content;
      const customFields: any[] = [];
      if (body.contentType !== undefined && body.contentType !== "") {
        customFields.push({ id: "3cebb834", value: Number(body.contentType) });
      }
      const payload: any = {
        name:          body.title,
        status:        "planning",
        start_date:    body.start ? new Date(body.start).getTime() : undefined,
        due_date:      body.end   ? new Date(body.end).getTime() : (body.start ? new Date(body.start).getTime() : undefined),
        custom_fields: customFields.length ? customFields : undefined,
      };
      const res = await fetch(`${BASE}/list/${listId}/task`, {
        method: "POST",
        headers: { Authorization: CLICKUP_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const task = await res.json() as any;
      // Set hemisphere via field endpoint (dynamic field ID lookup)
      if (body.hemisphere !== undefined && body.hemisphere !== "" && task.id) {
        try {
          const fr = await fetch(`${BASE}/list/${listId}/field`, { headers: { Authorization: CLICKUP_TOKEN } });
          const fd = await fr.json() as any;
          const hf = (fd.fields || []).find((f: any) => f.name?.toLowerCase().includes("hemisphere"));
          if (hf?.id) {
            await fetch(`${BASE}/task/${task.id}/field/${hf.id}`, {
              method: "POST",
              headers: { Authorization: CLICKUP_TOKEN, "Content-Type": "application/json" },
              body: JSON.stringify({ value: Number(body.hemisphere) }),
            });
          }
        } catch { /* best-effort */ }
      }
      return new Response(JSON.stringify({ id: task.id, url: task.url }), { headers });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = { path: "/api/clickup" };
