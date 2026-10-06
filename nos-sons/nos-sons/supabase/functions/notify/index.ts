// =========================================================
//  Nos sons : fonction "notify" (Supabase Edge Function)
//  Envoie les notifications :
//   - quand l'un de vous poste son son du jour (type "new_song")
//   - le rappel du soir si quelqu'un n'a pas encore posté (type "reminder")
//   - une notif de test depuis le menu de l'appli (type "test")
// =========================================================
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";
const REMINDER_HOUR = Number(Deno.env.get("REMINDER_HOUR") ?? "20"); // heure de Paris
const TZ = "Europe/Paris";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:contact@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
  Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
);

// Fourni automatiquement par Supabase, rien à configurer
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-notify-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Payload = { title: string; body: string; tag?: string };

function parisNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

async function sendTo(userId: string, payload: Payload) {
  const { data: subs } = await sb.from("push_subscriptions").select("*").eq("user_id", userId);
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 6 },
      );
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // Abonnement expiré (appli désinstallée, notifs coupées…) : on le supprime
      if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("Échec d'envoi", code, e);
    }
  }));
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const body = await req.json().catch(() => ({}));
  const fromDatabase = SECRET !== "" && req.headers.get("x-notify-secret") === SECRET;

  // Notif de test : demandée depuis l'appli par une personne connectée
  if (body.type === "test") {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data } = await sb.auth.getUser(token);
    if (!data?.user) return json({ error: "Non connecté" }, 401);
    const sent = await sendTo(data.user.id, {
      title: "Ça marche !",
      body: "Tu recevras une notif quand un son arrive, et un rappel le soir.",
      tag: "test",
    });
    return json({ sent });
  }

  if (!fromDatabase) return json({ error: "Accès refusé" }, 403);

  const { data: people } = await sb.from("profiles").select("id, name");
  const list = people ?? [];
  const nameOf = (id: string) => list.find((p) => p.id === id)?.name ?? "Ta moitié";

  // Quelqu'un vient de poster
  if (body.type === "new_song") {
    const { data: song } = await sb.from("songs").select("*").eq("id", body.song_id).maybeSingle();
    if (!song) return json({ skipped: "son introuvable" });
    const who = nameOf(song.user_id);
    let sent = 0;
    for (const p of list.filter((p) => p.id !== song.user_id)) {
      const { data: mine } = await sb.from("songs").select("id")
        .eq("user_id", p.id).eq("day", song.day).maybeSingle();
      sent += await sendTo(p.id, mine
        ? { title: `${who} a posté son son du jour`, body: song.title ? `🎧 ${song.title}` : "Viens l'écouter !", tag: `son-${song.day}` }
        : { title: `${who} a posté son son du jour`, body: "Poste le tien pour le découvrir 👀", tag: `son-${song.day}` });
    }
    return json({ sent });
  }

  // Rappel du soir (appelé toutes les heures, n'agit qu'à REMINDER_HOUR)
  if (body.type === "reminder") {
    const { day, hour } = parisNow();
    if (!body.force && hour !== REMINDER_HOUR) return json({ skipped: `il est ${hour}h à Paris` });
    const { data: today } = await sb.from("songs").select("user_id").eq("day", day);
    const posted = new Set((today ?? []).map((s) => s.user_id));
    let sent = 0;
    for (const p of list.filter((p) => !posted.has(p.id))) {
      const other = list.find((o) => o.id !== p.id);
      const waiting = other && posted.has(other.id);
      sent += await sendTo(p.id, {
        title: "Ton son du jour t'attend",
        body: waiting ? `${other!.name} a déjà posté le sien 👀` : "Il reste encore un peu de temps pour en choisir un 🎶",
        tag: `rappel-${day}`,
      });
    }
    return json({ sent });
  }

  return json({ error: "Type inconnu" }, 400);
});
