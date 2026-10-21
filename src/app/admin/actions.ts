"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStaff, requireSuper } from "@/lib/auth";
import { randomToken, sha256 } from "@/lib/security";
import {
  applyViews,
  fetchAll,
  recordStat,
  refreshVideo,
  resetToLive,
} from "@/lib/views";
import { getAgentBonus } from "@/lib/settings";
import { tgSend } from "@/lib/notify";

const id = z.string().cuid();
const pw = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(100);
const log = (actor: string, action: string, detail?: string) =>
  db.auditLog.create({ data: { actor, action, detail } });
const back = (path: string, msg: string): never =>
  redirect(
    `${path}${path.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`,
  );

/* ───────────── STAFF (admin + super admin): video moderation only ───────────── */

export async function reviewVideo(fd: FormData) {
  const me = await requireStaff();
  const vid = id.parse(fd.get("id"));
  const decision = z.enum(["APPROVED", "REJECTED"]).parse(fd.get("decision"));
  const reason =
    decision === "REJECTED"
      ? z.string().trim().min(2).max(200).parse(fd.get("reason"))
      : null;
  // only pending videos can be reviewed, so counts per admin stay honest
  const u = await db.video.updateMany({
    where: { id: vid, status: "PENDING" },
    data: {
      status: decision,
      rejectReason: reason,
      reviewedById: me.id,
      reviewedAt: new Date(),
    },
  });
  if (u.count === 1) {
    const v = await db.video.findUniqueOrThrow({
      where: { id: vid },
      include: { blogger: true },
    });
    await log(me.email, "VIDEO_" + decision, vid);
    await tgSend(
      process.env.BLOGGER_BOT_TOKEN,
      v.blogger.telegramId,
      decision === "APPROVED"
        ? `✅ Your video was approved:\n${v.url}`
        : `❌ Your video was rejected (${reason}):\n${v.url}`,
    );
    // Right after approval fetch the actual views (YouTube is quick; slower providers finish later or on the nightly cron)
    if (decision === "APPROVED")
      await Promise.race([
        refreshVideo(vid, "AUTO").catch(() => null),
        new Promise((r) => setTimeout(r, 8000)),
      ]);
  }
  revalidatePath("/admin/videos");
}

export async function setViews(fd: FormData) {
  // manual views (+ optional likes / comments): payable views = what the blogger is paid on
  const me = await requireStaff();
  const vid = id.parse(fd.get("id"));
  const count = z.coerce.number().int().min(0).max(2_000_000_000);
  const views = count.parse(fd.get("views"));
  const opt = (k: string) => {
    const raw = fd.get(k);
    return raw === null || raw === "" ? undefined : count.parse(raw);
  };
  const likes = opt("likes"),
    comments = opt("comments");
  await applyViews(vid, views, "MANUAL", me.id);
  const v = await db.video.findUnique({ where: { id: vid } });
  if (v && v.status === "APPROVED") {
    // Platforms without API data (never fetched): the typed numbers are also the live numbers
    await db.video.update({
      where: { id: vid },
      data: {
        ...(likes !== undefined ? { likes } : {}),
        ...(comments !== undefined ? { comments } : {}),
        ...(!v.lastFetchedAt ? { liveViews: views } : {}),
      },
    });
  }
  await recordStat(vid);
  await log(
    me.email,
    "VIEWS_MANUAL",
    `${vid}=${views}${likes !== undefined ? " likes=" + likes : ""}${comments !== undefined ? " comments=" + comments : ""}`,
  );
  revalidatePath("/admin/videos");
}

export async function resetToLiveAction(fd: FormData) {
  // go back to the live (fetched) views
  const me = await requireStaff();
  const vid = id.parse(fd.get("id"));
  await resetToLive(vid, me.id);
  await log(me.email, "VIEWS_USE_LIVE", vid);
  revalidatePath("/admin/videos");
}

export async function fetchOneAction(fd: FormData) {
  // automatic fetch for one video
  const me = await requireStaff();
  const r = await refreshVideo(id.parse(fd.get("id")), "FETCH", me.id);
  await log(me.email, "VIEWS_FETCH_ONE", r);
  back(
    "/admin/videos?status=APPROVED",
    {
      ok: "Views fetched.",
      closed:
        "Tracking is closed for this video (its week ended Saturday 11:59 PM).",
      nodata:
        "Could not fetch views (API not set up for this platform, or the video is private). Enter views manually.",
      notapproved: "This video is not approved.",
    }[r],
  );
}

export async function fetchAllAction() {
  // automatic fetch for all approved videos of the running weeks
  const me = await requireStaff();
  const r = await fetchAll(me.id, 45_000);
  await log(me.email, "VIEWS_FETCH_ALL", `${r.updated}/${r.tried}`);
  back(
    "/admin/videos?status=APPROVED",
    `Fetched ${r.updated} of ${r.tried} videos.${r.remaining ? ` ${r.remaining} more are left, press again.` : ""} Videos without auto data need manual views.`,
  );
}

export async function changeOwnPassword(fd: FormData) {
  const me = await requireStaff();
  const cur = z.string().max(100).parse(fd.get("current"));
  const next = pw.safeParse(fd.get("next"));
  if (!next.success) back("/admin/account", next.error.issues[0].message);
  const a = await db.admin.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await bcrypt.compare(cur, a.passwordHash)))
    back("/admin/account", "Current password is wrong.");
  await db.admin.update({
    where: { id: me.id },
    data: { passwordHash: await bcrypt.hash(String(fd.get("next")), 12) },
  });
  await log(me.email, "PASSWORD_CHANGED");
  back("/admin/account", "Password changed.");
}

/* ───────────── SUPER ADMIN ONLY ───────────── */

// Team management
export async function createAdmin(fd: FormData) {
  const me = await requireSuper();
  const name = z.string().trim().min(2).max(60).parse(fd.get("name"));
  const email = z
    .string()
    .email()
    .max(120)
    .parse(fd.get("email"))
    .toLowerCase();
  const password = pw.safeParse(fd.get("password"));
  if (!password.success) back("/admin/team", password.error.issues[0].message);
  if (await db.admin.findUnique({ where: { email } }))
    back("/admin/team", "That email already exists.");
  await db.admin.create({
    data: {
      name,
      email,
      role: "ADMIN",
      passwordHash: await bcrypt.hash(String(fd.get("password")), 12),
    },
  });
  await log(me.email, "ADMIN_CREATED", email);
  back("/admin/team", `Admin ${email} created.`);
}

async function otherActiveSupers(excludeId: string) {
  return db.admin.count({
    where: { role: "SUPER", active: true, id: { not: excludeId } },
  });
}

export async function setAdminRole(fd: FormData) {
  // give / take super admin access
  const me = await requireSuper();
  const target = id.parse(fd.get("id"));
  const role = z.enum(["SUPER", "ADMIN"]).parse(fd.get("role"));
  if (role === "ADMIN" && (await otherActiveSupers(target)) === 0)
    back(
      "/admin/team",
      "There must always be at least one active super admin.",
    );
  const t = await db.admin.update({ where: { id: target }, data: { role } });
  await log(me.email, "ADMIN_ROLE_" + role, t.email);
  back(
    "/admin/team",
    `${t.email} is now ${role === "SUPER" ? "Super admin" : "Admin"}.`,
  );
}

export async function setAdminActive(fd: FormData) {
  const me = await requireSuper();
  const target = id.parse(fd.get("id"));
  const active = fd.get("active") === "true";
  if (!active && (await otherActiveSupers(target)) === 0) {
    const t = await db.admin.findUnique({ where: { id: target } });
    if (t?.role === "SUPER")
      back(
        "/admin/team",
        "There must always be at least one active super admin.",
      );
  }
  const t = await db.admin.update({ where: { id: target }, data: { active } });
  await log(
    me.email,
    active ? "ADMIN_ACTIVATED" : "ADMIN_DEACTIVATED",
    t.email,
  );
  back("/admin/team", `${t.email} ${active ? "activated" : "deactivated"}.`);
}

export async function resetAdminPassword(fd: FormData) {
  const me = await requireSuper();
  const target = id.parse(fd.get("id"));
  const password = pw.safeParse(fd.get("password"));
  if (!password.success) back("/admin/team", password.error.issues[0].message);
  const t = await db.admin.update({
    where: { id: target },
    data: { passwordHash: await bcrypt.hash(String(fd.get("password")), 12) },
  });
  await log(me.email, "ADMIN_PASSWORD_RESET", t.email);
  back("/admin/team", `Password reset for ${t.email}.`);
}

// Agents, bloggers, accounts
type CreateAgentState = {
  token: string | null;
  error?: string;
  linked?: boolean;
};

// Telegram ID is optional. With an ID the agent only needs /start in the agent bot; the token still works too.
export async function createAgent(
  _prev: CreateAgentState,
  fd: FormData,
): Promise<CreateAgentState> {
  const me = await requireSuper();
  const name = z.string().trim().min(2).max(60).parse(fd.get("name"));
  const rawId = String(fd.get("telegramId") ?? "").trim();
  if (rawId && !/^\d{5,15}$/.test(rawId))
    return {
      token: null,
      error: "Telegram ID must be a number (5 to 15 digits).",
    };
  if (
    rawId &&
    (await db.agent.findUnique({ where: { telegramId: BigInt(rawId) } }))
  )
    return {
      token: null,
      error: "Another agent already uses this Telegram ID.",
    };
  const token = "AGT-" + randomToken(18); // shown ONCE, only hash stored
  const a = await db.agent.create({
    data: {
      name,
      tokenHash: sha256(token),
      telegramId: rawId ? BigInt(rawId) : null,
    },
  });
  await log(me.email, "AGENT_CREATED", `${a.id}${rawId ? " tg=" + rawId : ""}`);
  revalidatePath("/admin/agents");
  return { token, linked: !!rawId };
}

export async function setAgentTelegramId(fd: FormData) {
  // set, change or clear (empty) an agent's Telegram ID
  const me = await requireSuper();
  const agentId = id.parse(fd.get("id"));
  const rawId = String(fd.get("telegramId") ?? "").trim();
  if (rawId && !/^\d{5,15}$/.test(rawId))
    back("/admin/agents", "Telegram ID must be a number (5 to 15 digits).");
  if (rawId) {
    const other = await db.agent.findUnique({
      where: { telegramId: BigInt(rawId) },
    });
    if (other && other.id !== agentId)
      back("/admin/agents", "Another agent already uses this Telegram ID.");
  }
  await db.agent.update({
    where: { id: agentId },
    data: { telegramId: rawId ? BigInt(rawId) : null },
  });
  await log(
    me.email,
    "AGENT_TELEGRAM_ID",
    `${agentId} -> ${rawId || "cleared"}`,
  );
  back(
    "/admin/agents",
    rawId
      ? "Telegram ID saved."
      : "Telegram ID cleared. Agent must log in with token again.",
  );
}

export async function setAgentStatus(fd: FormData) {
  const me = await requireSuper();
  const agentId = id.parse(fd.get("id"));
  const status = z
    .enum(["ACTIVE", "SUSPENDED", "DELETED"])
    .parse(fd.get("status"));
  await db.agent.update({ where: { id: agentId }, data: { status } });
  await log(me.email, "AGENT_" + status, agentId);
  revalidatePath("/admin/agents");
}

export async function setBloggerStatus(fd: FormData) {
  const me = await requireSuper();
  const bid = id.parse(fd.get("id"));
  const status = z
    .enum(["ACTIVE", "SUSPENDED", "DELETED"])
    .parse(fd.get("status"));
  await db.blogger.update({ where: { id: bid }, data: { status } });
  await log(me.email, "BLOGGER_" + status, bid);
  revalidatePath("/admin/bloggers");
}

export async function reviewAccount(fd: FormData) {
  const me = await requireSuper();
  const aid = id.parse(fd.get("id"));
  const status = z.enum(["APPROVED", "REJECTED"]).parse(fd.get("decision"));
  await db.socialAccount.update({ where: { id: aid }, data: { status } });
  await log(me.email, "ACCOUNT_" + status, aid);
  revalidatePath("/admin/accounts");
}

// Money
export async function setPayment(fd: FormData) {
  const me = await requireSuper();
  const wid = id.parse(fd.get("id"));
  const status = z
    .enum(["PENDING", "PROCESSING", "PAID", "REJECTED"])
    .parse(fd.get("status"));
  const note =
    status === "REJECTED"
      ? z.string().trim().min(2).max(200).parse(fd.get("note"))
      : null;
  const w = await db.withdrawal.update({
    where: { id: wid },
    data: { status, note },
    include: { blogger: true, agent: true },
  });
  await log(me.email, "PAYMENT_" + status, wid);
  const to = w.blogger ?? w.agent; // rejected payments return the money to the balance automatically
  const label = {
    PENDING: "Pending",
    PROCESSING: "In progress",
    PAID: "Complete",
    REJECTED: "Rejected",
  }[status];
  if (to?.telegramId)
    await tgSend(
      w.blogger ? process.env.BLOGGER_BOT_TOKEN : process.env.AGENT_BOT_TOKEN,
      to.telegramId,
      `💸 Payment ₹${w.amount}: ${label}${note ? " (" + note + ")" : ""}`,
    );
  revalidatePath("/admin/payments");
}

export async function adjust(fd: FormData) {
  const me = await requireSuper();
  const kind = z.enum(["agent", "blogger"]).parse(fd.get("kind"));
  const target = id.parse(fd.get("id"));
  const amount = z.coerce
    .number()
    .min(-10_000_000)
    .max(10_000_000)
    .refine((n) => n !== 0, "zero")
    .parse(fd.get("amount"));
  const reason = z.string().trim().min(2).max(120).parse(fd.get("reason"));
  await db.adjustment.create({
    data: {
      amount,
      reason,
      ...(kind === "agent" ? { agentId: target } : { bloggerId: target }),
    },
  });
  await log(
    me.email,
    "ADJUST_" + kind.toUpperCase(),
    `${target} ${amount} ${reason}`,
  );
  revalidatePath("/admin/agents");
  revalidatePath("/admin/bloggers");
}

export async function assignAgent(fd: FormData) {
  const me = await requireSuper();
  const bid = id.parse(fd.get("id"));
  const raw = String(fd.get("agentId") ?? "");
  const agentId = raw ? id.parse(raw) : null;
  await db.blogger.update({
    where: { id: bid },
    data: { agentId, agentBonus: agentId ? await getAgentBonus() : 0 },
  });
  await log(me.email, "BLOGGER_AGENT_SET", `${bid} -> ${agentId ?? "none"}`);
  revalidatePath("/admin/bloggers");
}

export async function setBloggerBonus(fd: FormData) {
  const me = await requireSuper();
  const bid = id.parse(fd.get("id"));
  const bonus = z.coerce.number().min(0).max(100000).parse(fd.get("bonus"));
  await db.blogger.update({ where: { id: bid }, data: { agentBonus: bonus } });
  await log(me.email, "AGENT_BONUS_EDIT", `${bid}=${bonus}`);
  revalidatePath("/admin/bloggers");
}

export async function setRate(fd: FormData) {
  const me = await requireSuper();
  const platform = z
    .enum([
      "INSTAGRAM",
      "YOUTUBE",
      "FACEBOOK",
      "SHARECHAT",
      "MOJ",
      "TIKTOK",
      "OTHER",
    ])
    .parse(fd.get("platform"));
  const perMillion = z.coerce
    .number()
    .min(0)
    .max(10_000_000)
    .parse(fd.get("rate"));
  await db.rate.upsert({
    where: { platform },
    update: { perMillion },
    create: { platform, perMillion },
  });
  await log(me.email, "RATE_SET", `${platform}=${perMillion}/million`);
  revalidatePath("/admin/rates");
}

export async function setAgentBonusDefault(fd: FormData) {
  const me = await requireSuper();
  const v = z.coerce.number().min(0).max(100000).parse(fd.get("bonus"));
  await db.setting.upsert({
    where: { key: "AGENT_PER_BLOGGER" },
    update: { value: String(v) },
    create: { key: "AGENT_PER_BLOGGER", value: String(v) },
  });
  await log(me.email, "AGENT_BONUS_DEFAULT", String(v)); // applies to bloggers who join from now on
  revalidatePath("/admin/rates");
}
