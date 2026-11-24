import { useEffect as e, useState as t } from "react";
import { useAppApi as n } from "@kirocrew/app-sdk";
import { Card as r, CardTitle as i, EmptyState as a, MarkdownRenderer as o, PageHeader as s } from "@kirocrew/app-sdk/ui";
import { jsx as c, jsxs as l } from "react/jsx-runtime";
// src/ghosts.ts
var u = [
	"listener",
	"phantom",
	"bebe"
], d = {
	listener: "The Listener",
	phantom: "The Phantom",
	bebe: "Bebe"
};
// src/record.ts
function f(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) t.set(n.type, (t.get(n.type) ?? 0) + 1);
	return Object.fromEntries(t);
}
var p = [
	"succeeded",
	"gave_up",
	"error",
	"no_run"
];
function m(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function h(e, t) {
	let n = Object.keys(e), r = Object.keys(t);
	return n.length === r.length && n.every((n) => Object.hasOwn(t, n) && e[n] === t[n]);
}
function g(e) {
	let t = (e) => ({
		ok: !1,
		error: e
	});
	if (!m(e)) return t("The record is not an object.");
	if (e.version !== 1) return t("The record version must be 1.");
	if (typeof e.date != "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return t("The record date must look like YYYY-MM-DD.");
	if (typeof e.seed != "number" || !Number.isSafeInteger(e.seed)) return t("The record seed must be a safe integer.");
	if (typeof e.interrupted != "boolean") return t("The record \"interrupted\" must be true or false.");
	if (!Array.isArray(e.ghosts) || e.ghosts.length !== u.length) return t("The record must have exactly three ghost entries.");
	let n = /* @__PURE__ */ new Set(), r = [];
	for (let [i, a] of e.ghosts.entries()) {
		if (!m(a)) return t(`Ghost entry ${i + 1} is not an object.`);
		let e = a.ghost;
		if (typeof e != "string" || !u.includes(e)) return t(`Ghost entry ${i + 1} has an unknown ghost.`);
		if (n.has(e)) return t(`The ghost "${e}" appears more than once.`);
		if (n.add(e), typeof a.result != "string" || !p.includes(a.result)) return t(`The result for "${e}" is not valid.`);
		if (a.exitCode !== null && (typeof a.exitCode != "number" || !Number.isInteger(a.exitCode))) return t(`The exit code for "${e}" is not valid.`);
		if (a.runId !== null && typeof a.runId != "string") return t(`The run id for "${e}" is not valid.`);
		if (a.error !== null && typeof a.error != "string") return t(`The error text for "${e}" is not valid.`);
		if (!Array.isArray(a.findings)) return t(`The findings for "${e}" are not a list.`);
		let o = [];
		for (let n of a.findings) {
			if (!m(n) || typeof n.type != "string" || typeof n.title != "string" || typeof n.step != "number" || !Number.isInteger(n.step)) return t(`A finding for "${e}" needs a type, a step number and a title.`);
			o.push({
				type: n.type,
				step: n.step,
				title: n.title
			});
		}
		if (!m(a.findingCounts) || !Object.values(a.findingCounts).every((e) => typeof e == "number")) return t(`The finding counts for "${e}" are not valid.`);
		if (!Array.isArray(a.findingTitles) || !a.findingTitles.every((e) => typeof e == "string")) return t(`The finding titles for "${e}" are not valid.`);
		if (a.result === "no_run" && (a.runId !== null || o.length > 0)) return t(`"${e}" has no saved run, so it must have no run id and no findings.`);
		if (!h(a.findingCounts, f(o))) return t(`The finding counts for "${e}" do not match its findings.`);
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
var _ = "/apps/haunt-patrol/api", v = "https://xan-antx.github.io/haunt/";
function y(e) {
	switch (e) {
		case "succeeded": return "Succeeded";
		case "gave_up": return "Gave up";
		case "error": return "Error";
		case "no_run": return "No run";
	}
}
function b(e) {
	switch (e) {
		case "succeeded": return "✓";
		case "gave_up": return "⚠";
		case "error": return "✕";
		case "no_run": return "–";
	}
}
function x(e) {
	let t = Object.entries(e).map(([e, t]) => `${e} ${t}`);
	return t.length === 0 ? "No findings" : t.join(", ");
}
function S(e) {
	if (typeof e == "object" && e) {
		let t = e;
		if (typeof t.status == "number") return t.status;
		if (typeof t.response?.status == "number") return t.response.status;
	}
	return null;
}
function C(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
async function w(e, t, n) {
	let r;
	try {
		r = await e(t);
	} catch (e) {
		return S(e) === 404 ? { kind: "empty" } : { kind: "failed" };
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
function T(e, t) {
	if (!C(e) || typeof e.dashboardBaseUrl != "string") return {
		kind: "error",
		message: "The file latest.json could not be read as a patrol."
	};
	let n = g(e.record);
	if (!n.ok) return {
		kind: "error",
		message: `The file latest.json is not a valid patrol record. ${n.error}`
	};
	let r = C(t) && typeof t.summary == "string" ? t.summary : "";
	return {
		kind: "ready",
		record: n.record,
		summary: r,
		dashboardBaseUrl: e.dashboardBaseUrl
	};
}
async function E(e, t) {
	let n = await w(e, `${_}/latest`, `${_}/summary`);
	if (n.kind === "ok") return T(n.latest, n.summary);
	if (n.kind === "empty") return { kind: "empty" };
	let r = await w(t, "data/latest.json", "data/summary.json");
	return r.kind === "ok" ? T(r.latest, r.summary) : r.kind === "empty" ? { kind: "empty" } : {
		kind: "error",
		message: "The latest patrol could not be loaded."
	};
}
// ui/src/App.tsx
var D = async (e) => {
	let t = await fetch(new URL(e, import.meta.url).href);
	if (!t.ok) throw { status: t.status };
	return t.json();
};
function O() {
	let u = n(), [f, p] = t(null);
	if (e(() => {
		let e = !1;
		return E((e) => u.get(e), D).then((t) => {
			e || p(t);
		}).catch(() => {
			e || p({
				kind: "error",
				message: "The latest patrol could not be loaded."
			});
		}), () => {
			e = !0;
		};
	}, []), f === null) return /* @__PURE__ */ l("div", { children: [/* @__PURE__ */ c(s, { title: "Haunt Patrol" }), /* @__PURE__ */ c("p", {
		role: "status",
		children: "Loading the latest patrol."
	})] });
	if (f.kind === "empty") return /* @__PURE__ */ l("div", { children: [/* @__PURE__ */ c(s, { title: "Haunt Patrol" }), /* @__PURE__ */ c(a, {
		title: "No patrol has run yet.",
		description: "The first patrol runs at midnight IST."
	})] });
	if (f.kind === "error") return /* @__PURE__ */ l("div", { children: [/* @__PURE__ */ c(s, { title: "Haunt Patrol" }), /* @__PURE__ */ c(a, {
		title: "The latest patrol could not be shown.",
		description: f.message
	})] });
	let { record: m, summary: h } = f;
	return /* @__PURE__ */ l("div", { children: [
		/* @__PURE__ */ c(s, {
			title: "Haunt Patrol",
			subtitle: `Latest patrol: ${m.date} (IST)`
		}),
		/* @__PURE__ */ l(r, { children: [/* @__PURE__ */ c(i, { children: "Summary" }), /* @__PURE__ */ c(o, { content: h })] }),
		/* @__PURE__ */ l(r, { children: [/* @__PURE__ */ c(i, { children: "Ghosts" }), /* @__PURE__ */ c("ul", { children: m.ghosts.map((e) => /* @__PURE__ */ l("li", { children: [
			/* @__PURE__ */ c("strong", { children: d[e.ghost] }),
			" ",
			/* @__PURE__ */ l("span", { children: [
				/* @__PURE__ */ c("span", {
					"aria-hidden": "true",
					children: b(e.result)
				}),
				" ",
				/* @__PURE__ */ c("span", { children: y(e.result) })
			] }),
			". ",
			/* @__PURE__ */ c("span", { children: x(e.findingCounts) }),
			e.findings.length > 0 ? /* @__PURE__ */ l("details", { children: [/* @__PURE__ */ c("summary", {
				"aria-label": `Show findings for ${d[e.ghost]}`,
				children: "Show findings"
			}), /* @__PURE__ */ c("ul", { children: e.findings.map((e, t) => /* @__PURE__ */ l("li", { children: [
				/* @__PURE__ */ c("span", { children: e.type }),
				", ",
				/* @__PURE__ */ l("span", { children: ["step ", e.step] }),
				", ",
				/* @__PURE__ */ c("span", { children: e.title })
			] }, t)) })] }) : null
		] }, e.ghost)) })] }),
		/* @__PURE__ */ l("p", { children: [
			"The recorded demo runs are in the",
			" ",
			/* @__PURE__ */ c("a", {
				href: v,
				target: "_blank",
				rel: "noopener noreferrer",
				children: "live Haunt dashboard"
			}),
			". Patrol runs are kept in Haunt Patrol's own data folder, so the dashboard does not list them."
		] })
	] });
}
export { O as default };
