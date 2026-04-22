---
name: codebase-feature-audit
description: >
  Scan a codebase using Gemini inside jules.google.com. Understands
  architecture, logic, and flow, then names every feature and categorizes each as
  Implemented, Incomplete, or Unplanned. Use whenever the user wants to audit a codebase,
  map what's built vs missing, find stubs and TODOs, or get a feature status report before
  a release or handoff. Trigger on: "scan codebase", "feature audit", "what's implemented",
  "what's incomplete", "code audit", "feature status", or any request to understand what a
  repo does across multiple files.
---

# Codebase Feature Audit

Runs inside **jules.google.com**. Jules reads the GitHub repo natively — Gemini is already
authenticated, no setup needed. Just paste the prompts below.

---

## Step 1 — Inventory the Repo

Paste this into Jules first to orient before the deep scan:

```
List every file and folder in this repo (exclude node_modules, .git, dist, build,
__pycache__, .next). Show the full tree. Then tell me:
- What kind of app this is
- The main language and framework
- Where entry points and features live (routes, components, services, etc.)
```

---

## Step 2 — Run the Feature Audit

Paste this into Jules as a single task:

```
You are a senior software engineer auditing this codebase for feature completeness.

Read every file carefully. Then:

1. Write a one-paragraph summary of what this app is and does.
2. Note the architecture: stack, patterns, folder structure, key dependencies.
3. Identify every distinct feature — both major capabilities and smaller subsystems.
   Be specific. Don't group unrelated things together.

For each feature, classify its status as one of:

  implemented  — fully coded, wired end-to-end, appears functional
  incomplete   — started but unfinished: stubs, TODOs, missing wiring, partial UI,
                 unhandled errors, or exists in one layer but not another
  unplanned    — referenced (in a route, config, menu, README, or comment) but
                 has no real implementation code at all

Return ONLY a JSON object — no markdown fences, no explanation — in this shape:

{
  "app_summary": "...",
  "architecture_notes": "...",
  "features": [
    {
      "name": "Feature name",
      "description": "What it does or should do.",
      "status": "implemented | incomplete | unplanned",
      "evidence": "Files, functions, or line references.",
      "notes": "Gaps, TODOs, or issues found."
    }
  ],
  "summary": {
    "implemented": 0,
    "incomplete": 0,
    "unplanned": 0,
    "total": 0
  }
}
```

---

## Step 3 — Generate the Report

Once Jules returns the JSON, paste this as the next task:

```
Using the feature audit JSON above, create a file called FEATURE_AUDIT.md in the
root of the repo with this structure:

# Feature Audit — <App Name>

## What This App Does
<app_summary>

## Architecture
<architecture_notes>

---

## ✅ Implemented (<count>)
| Feature | Description | Evidence |
|---------|-------------|----------|

## 🔧 Incomplete (<count>)
| Feature | Description | What's Missing |
|---------|-------------|----------------|

## 🗂️ Unplanned / Missing (<count>)
| Feature | Description | Referenced In |
|---------|-------------|---------------|

---

## Summary
- Total features: <total>
- ✅ Implemented: <n> (<pct>%)
- 🔧 Incomplete: <n> (<pct>%)
- 🗂️ Unplanned: <n> (<pct>%)
```

---

## Optional Follow-up Prompts

Use these after the audit for deeper dives.

**Find all stubs and TODOs**
```
Search every file for TODO, FIXME, HACK, XXX, "not implemented", and empty function
bodies. List them by file with surrounding context, grouped by feature.
```

**Rank incomplete features by effort**
```
For each incomplete feature in the audit, estimate effort to finish: small / medium / large.
Rank from quickest win to most work. Explain your reasoning for each.
```

**Generate task list**
```
For every incomplete and unplanned feature, write a GitHub issue: title, what needs to
be built or fixed, and 2–3 acceptance criteria.
```

**Trace a feature's full flow**
```
Trace [Feature Name] end-to-end — from the user action through every file, function,
and data transformation to the response. List them in order.
```

**Audit routes vs implementations**
```
List every route or endpoint defined in this repo. For each: does a handler exist?
Does it have real logic? Is it connected to the frontend? Flag anything broken or missing.
```

---

## Tips

- Send the audit prompt as **one complete Jules task**, not multiple messages.
- Do **Step 2 and Step 3 separately** — cleaner results than combining them.
- Commit `FEATURE_AUDIT.md` so the whole team can see it.

---
