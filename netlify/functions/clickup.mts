import type { Context } from "@netlify/functions";

const CLICKUP_TOKEN = Netlify.env.get("CLICKUP_API_TOKEN");
const BASE = "https://api.clickup.com/api/v2";

// List IDs from Campaigns & Events folder
const LISTS = {
  campaigns:   "901605021480",
  content:     "901613760281",
  alwayson:    "901613760528",
  paid:        "901613760525",
  holidays:    "901605021479",
};

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (!CLICKUP_TOKEN) {
    return new Response(JSON.stringify({ error: "Missing CLICKUP_API_TOKEN env var" }), { status: 500, headers });
  }

  try {
    // ── GET: fetch tasks from all lists ──
    if (action === "tasks") {
      const results = await Promise.all(
        Object.entries(LISTS).map(async ([layer, listId]) => {
          const res = await fetch(
            `${BASE}/list/${listId}/task?include_closed=false&subtasks=false&date_updated_gt=0`,
            { headers: { Authorization: CLICKUP_TOKEN } }
          );
          const data = await res.json() as any;
          return (data.tasks || []).map((t: any) => ({
            id:        t.id,
            title:     t.name,
            layer,
            start:     t.start_date ? new Date(Number(t.start_date)).toISOString().split("T")[0] : (t.due_date ? new Date(Number(t.due_date)).toISOString().split("T")[0] : null),
            end:       t.due_date   ? new Date(Number(t.due_date)).toISOString().split("T")[0]   : null,
            status:    t.status?.status || "",
            url:       t.url,
            assignees: t.assignees?.map((a: any) => ({ id: a.id, name: a.username, avatar: a.profilePicture })) || [],
            type:      t.custom_fields?.find((f: any) => f.name === "Content Type")?.value || "",
            locations: (() => {
              const f = t.custom_fields?.find((f: any) => f.name === "Publish Location");
              if (!f) return [];
              if (Array.isArray(f.value)) return f.value.map((v: any) => v.name || v);
              if (typeof f.value === "string") return [f.value];
              return [];
            })(),
          }));
        })
      );
      return new Response(JSON.stringify(results.flat()), { headers });
    }

    // ── GET: fetch members for assignee dropdown ──
    if (action === "members") {
      const res = await fetch(`${BASE}/list/${LISTS.content}/member`, {
        headers: { Authorization: CLICKUP_TOKEN }
      });
      const data = await res.json() as any;
      return new Response(JSON.stringify(data.members || []), { headers });
    }

    // ── POST: create a task ──
    if (action === "create" && req.method === "POST") {
      const body = await req.json() as any;
      const listId = LISTS[body.layer as keyof typeof LISTS] || LISTS.content;

      const payload: any = {
        name:       body.title,
        status:     "PLANNING",
        start_date: body.start ? new Date(body.start).getTime() : undefined,
        due_date:   body.end   ? new Date(body.end).getTime()   : (body.start ? new Date(body.start).getTime() : undefined),
        assignees:  body.assignees || [],
      };

      const res = await fetch(`${BASE}/list/${listId}/task`, {
        method:  "POST",
        headers: { Authorization: CLICKUP_TOKEN, "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const task = await res.json() as any;
      return new Response(JSON.stringify({ id: task.id, url: task.url }), { headers });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = { path: "/api/clickup" };
