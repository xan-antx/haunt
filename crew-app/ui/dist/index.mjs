import { useEffect as e, useState as t } from "react";
import { useAppApi as n } from "@kirocrew/app-sdk";
import { Card as r, CardTitle as i, EmptyState as a, MarkdownRenderer as o, PageHeader as s } from "@kirocrew/app-sdk/ui";
import { Fragment as c, jsx as l, jsxs as u } from "react/jsx-runtime";
// src/dashboardLink.ts
function d(e, t) {
	return `${e.replace(/\/+$/, "")}/#/run/${encodeURIComponent(t)}`;
}
// src/ghosts.ts
var f = [
	"listener",
	"phantom",
	"bebe"
], p = {
	listener: "The Listener",
	phantom: "The Phantom",
	bebe: "Bebe"
};
// src/record.ts
function m(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) t.set(n.type, (t.get(n.type) ?? 0) + 1);
	return Object.fromEntries(t);
}
var h = [
	"succeeded",
	"gave_up",
	"error",
	"no_run"
];
function g(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function _(e, t) {
	let n = Object.keys(e), r = Object.keys(t);
	return n.length === r.length && n.every((n) => Object.hasOwn(t, n) && e[n] === t[n]);
}
function v(e) {
	let t = (e) => ({
		ok: !1,
		error: e
	});
	if (!g(e)) return t("The record is not an object.");
	if (e.version !== 1) return t("The record version must be 1.");
	if (typeof e.date != "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return t("The record date must look like YYYY-MM-DD.");
	if (typeof e.seed != "number" || !Number.isSafeInteger(e.seed)) return t("The record seed must be a safe integer.");
	if (typeof e.interrupted != "boolean") return t("The record \"interrupted\" must be true or false.");
	if (!Array.isArray(e.ghosts) || e.ghosts.length !== f.length) return t("The record must have exactly three ghost entries.");
	let n = /* @__PURE__ */ new Set(), r = [];
	for (let [i, a] of e.ghosts.entries()) {
		if (!g(a)) return t(`Ghost entry ${i + 1} is not an object.`);
		let e = a.ghost;
		if (typeof e != "string" || !f.includes(e)) return t(`Ghost entry ${i + 1} has an unknown ghost.`);
		if (n.has(e)) return t(`The ghost "${e}" appears more than once.`);
		if (n.add(e), typeof a.result != "string" || !h.includes(a.result)) return t(`The result for "${e}" is not valid.`);
		if (a.exitCode !== null && (typeof a.exitCode != "number" || !Number.isInteger(a.exitCode))) return t(`The exit code for "${e}" is not valid.`);
		if (a.runId !== null && typeof a.runId != "string") return t(`The run id for "${e}" is not valid.`);
		if (a.error !== null && typeof a.error != "string") return t(`The error text for "${e}" is not valid.`);
		if (!Array.isArray(a.findings)) return t(`The findings for "${e}" are not a list.`);
		let o = [];
		for (let n of a.findings) {
			if (!g(n) || typeof n.type != "string" || typeof n.title != "string" || typeof n.step != "number" || !Number.isInteger(n.step)) return t(`A finding for "${e}" needs a type, a step number and a title.`);
			o.push({
				type: n.type,
				step: n.step,
				title: n.title
			});
		}
		if (!g(a.findingCounts) || !Object.values(a.findingCounts).every((e) => typeof e == "number")) return t(`The finding counts for "${e}" are not valid.`);
		if (!Array.isArray(a.findingTitles) || !a.findingTitles.every((e) => typeof e == "string")) return t(`The finding titles for "${e}" are not valid.`);
		if (a.result === "no_run" && (a.runId !== null || o.length > 0)) return t(`"${e}" has no saved run, so it must have no run id and no findings.`);
		if (!_(a.findingCounts, m(o))) return t(`The finding counts for "${e}" do not match its findings.`);
		let s = a.findingTitles;
		if (s.length !== o.length || s.some((e, t) => e !== o[t]?.title)) return t(`The finding titles for "${e}" do not match its findings.`);
		r.push({
			ghost: e,
			result: a.result,
			exitCode: a.exitCode,
			runId: a.runId,
			findingCounts: a.findingCounts,
			findingTitles: s,
			findings: o,
			error: a.error
		});
	}
	return {
		ok: !0,
		record: {
			version: 1,
			date: e.date,
			seed: e.seed,
			interrupted: e.interrupted,
			ghosts: r
		}
	};
}
// ui/src/model.ts
var y = "/apps/haunt-patrol/api";
function b(e) {
	switch (e) {
		case "succeeded": return "Succeeded";
		case "gave_up": return "Gave up";
		case "error": return "Error";
		case "no_run": return "No run";
	}
}
function x(e) {
	switch (e) {
		case "succeeded": return "✓";
		case "gave_up": return "⚠";
		case "error": return "✕";
		case "no_run": return "–";
	}
}
function S(e) {
	let t = Object.entries(e).map(([e, t]) => `${e} ${t}`);
	return t.length === 0 ? "No findings" : t.join(", ");
}
function C(e) {
	if (typeof e == "object" && e) {
		let t = e;
		if (typeof t.status == "number") return t.status;
		if (typeof t.response?.status == "number") return t.response.status;
	}
	return null;
}
function w(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
async function T(e, t, n) {
	let r;
	try {
		r = await e(t);
	} catch (e) {
		return C(e) === 404 ? { kind: "empty" } : { kind: "failed" };
	}
	try {
		return {
			kind: "ok",
			latest: r,
			summary: await e(n)
		};
	} catch {
		return { kind: "failed" };
	}
}
function E(e, t) {
	if (!w(e) || typeof e.dashboardBaseUrl != "string") return {
		kind: "error",
		message: "The file latest.json could not be read as a patrol."
	};
	let n = v(e.record);
	if (!n.ok) return {
		kind: "error",
		message: `The file latest.json is not a valid patrol record. ${n.error}`
	};
	let r = w(t) && typeof t.summary == "string" ? t.summary : "";
	return {
		kind: "ready",
		record: n.record,
		summary: r,
		dashboardBaseUrl: e.dashboardBaseUrl
	};
}
async function D(e, t) {
	let n = await T(e, `${y}/latest`, `${y}/summary`);
	if (n.kind === "ok") return E(n.latest, n.summary);
	if (n.kind === "empty") return { kind: "empty" };
	let r = await T(t, "data/latest.json", "data/summary.json");
	return r.kind === "ok" ? E(r.latest, r.summary) : r.kind === "empty" ? { kind: "empty" } : {
		kind: "error",
		message: "The latest patrol could not be loaded."
	};
}
// ui/src/App.tsx
var O = async (e) => {
	let t = await fetch(new URL(e, import.meta.url).href);
	if (!t.ok) throw { status: t.status };
	return t.json();
};
function k() {
	let f = n(), [m, h] = t(null);
	if (e(() => {
		let e = !1;
		return D((e) => f.get(e), O).then((t) => {
			e || h(t);
		}).catch(() => {
			e || h({
				kind: "error",
				message: "The latest patrol could not be loaded."
			});
		}), () => {
			e = !0;
		};
	}, []), m === null) return /* @__PURE__ */ u("div", { children: [/* @__PURE__ */ l(s, { title: "Haunt Patrol" }), /* @__PURE__ */ l("p", {
		role: "status",
		children: "Loading the latest patrol."
	})] });
	if (m.kind === "empty") return /* @__PURE__ */ u("div", { children: [/* @__PURE__ */ l(s, { title: "Haunt Patrol" }), /* @__PURE__ */ l(a, {
		title: "No patrol has run yet.",
		description: "The first patrol runs at midnight IST."
	})] });
	if (m.kind === "error") return /* @__PURE__ */ u("div", { children: [/* @__PURE__ */ l(s, { title: "Haunt Patrol" }), /* @__PURE__ */ l(a, {
		title: "The latest patrol could not be shown.",
		description: m.message
	})] });
	let { record: g, summary: _, dashboardBaseUrl: v } = m;
	return /* @__PURE__ */ u("div", { children: [
		/* @__PURE__ */ l(s, {
			title: "Haunt Patrol",
			subtitle: `Latest patrol: ${g.date} (IST)`
		}),
		/* @__PURE__ */ u(r, { children: [/* @__PURE__ */ l(i, { children: "Summary" }), /* @__PURE__ */ l(o, { content: _ })] }),
		/* @__PURE__ */ u(r, { children: [/* @__PURE__ */ l(i, { children: "Ghosts" }), /* @__PURE__ */ l("ul", { children: g.ghosts.map((e) => /* @__PURE__ */ u("li", { children: [
			/* @__PURE__ */ l("strong", { children: p[e.ghost] }),
			" ",
			/* @__PURE__ */ u("span", { children: [
				/* @__PURE__ */ l("span", {
					"aria-hidden": "true",
					children: x(e.result)
				}),
				" ",
				/* @__PURE__ */ l("span", { children: b(e.result) })
			] }),
			". ",
			/* @__PURE__ */ l("span", { children: S(e.findingCounts) }),
			e.runId === null ? null : /* @__PURE__ */ u(c, { children: [" ", /* @__PURE__ */ l("a", {
				href: d(v, e.runId),
				target: "_blank",
				rel: "noopener noreferrer",
				"aria-label": `Open ${p[e.ghost]}'s run in dashboard`,
				children: `Open ${p[e.ghost]}'s run in dashboard`
			})] })
		] }, e.ghost)) })] }),
		/* @__PURE__ */ u("p", { children: [
			"A run that does not appear in the dashboard needs its run list refreshed. Run ",
			/* @__PURE__ */ l("code", { children: "npm run collect-runs" }),
			" in",
			" ",
			/* @__PURE__ */ l("code", { children: "dashboard/" }),
			"."
		] })
	] });
}
export { k as default };
