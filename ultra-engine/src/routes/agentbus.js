const express = require("express");
const fs = require("fs/promises");
const crypto = require("crypto");
const { parseCommitAction, identifyCommitSource } = require("../utils/commit_parse");

const router = express.Router();
const BUS_PATH = "/data/agent_bus.json";

const EMPTY_BUS = { pending_for_antigravity: [], pending_for_claude_code: [], completed: [], last_updated: null };

async function readBus() {
  try {
    return JSON.parse(await fs.readFile(BUS_PATH, "utf8"));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('⚠️ agentbus: error leyendo bus:', err.message);
    return { ...EMPTY_BUS };
  }
}

async function writeBus(bus) {
  bus.last_updated = new Date().toISOString();
  await fs.writeFile(BUS_PATH, JSON.stringify(bus, null, 2));
}

// GET /api/agent-bus/status — polling endpoint
router.get("/status", async (req, res) => {
  const bus = await readBus();
  res.json({
    ok: true,
    last_updated: bus.last_updated,
    queues: {
      pending_for_antigravity: bus.pending_for_antigravity.length,
      pending_for_claude_code: bus.pending_for_claude_code.length,
      completed: bus.completed.length
    },
    pending_for_antigravity: bus.pending_for_antigravity,
    pending_for_claude_code: bus.pending_for_claude_code,
    recent_completed: (bus.completed || []).slice(-10)
  });
});

// POST /api/agent-bus/git-push — webhook receiver
router.post("/git-push", async (req, res) => {
  const body = req.body || {};
  const commits = body.commits || [];
  const repoName = (body.repository && body.repository.name) || body.repo || "unknown";
  const bus = await readBus();
  const tasks = [];

  for (const commit of commits) {
    const message = commit.message || "";
    const author = commit.author ? (commit.author.name || commit.author.username || "") : "";
    const hash = (commit.id || commit.sha || "").substring(0, 8);
    const files = [].concat(commit.added || [], commit.modified || [], commit.removed || []);

    const source = identifyCommitSource(author, message);
    const action = parseCommitAction(message);

    const task = {
      id: crypto.randomUUID(),
      from: source,
      action,
      repo: repoName,
      commit: hash,
      summary: message.split("\n")[0].substring(0, 200),
      files_changed: files.length,
      created_at: new Date().toISOString(),
      status: "pending"
    };

    // Routing: si NO es de Claude Code, va a Claude Code queue
    // Si NO es de Antigravity, va a Antigravity queue
    // Si es de un humano, va a ambas
    if (source !== "claude_code") {
      bus.pending_for_claude_code.push({ ...task });
    }
    if (source !== "antigravity") {
      bus.pending_for_antigravity.push({ ...task });
    }

    tasks.push(task);
  }

  if (!tasks.length) {
    const fallback = {
      id: crypto.randomUUID(),
      from: "unknown",
      action: "review",
      repo: repoName,
      commit: "",
      summary: "Push without parseable commits",
      files_changed: 0,
      created_at: new Date().toISOString(),
      status: "pending"
    };
    bus.pending_for_claude_code.push(fallback);
    tasks.push(fallback);
  }

  await writeBus(bus);
  res.json({ ok: true, tasks_created: tasks.length, tasks });
});

// POST /api/agent-bus/send — mensaje directo entre agentes
router.post("/send", async (req, res) => {
  const { from, to, action, summary, body, repo, priority } = req.body;

  const validAgents = ["claude_code", "antigravity", "claude_chat"];
  const validTargets = ["claude_code", "antigravity"];
  const validActions = ["review", "fix", "build", "test", "question"];
  const validPriorities = ["low", "normal", "high"];

  if (!from || !validAgents.includes(from))
    return res.status(400).json({ ok: false, error: `Invalid 'from'. Must be one of: ${validAgents.join(", ")}` });
  if (!to || !validTargets.includes(to))
    return res.status(400).json({ ok: false, error: `Invalid 'to'. Must be one of: ${validTargets.join(", ")}` });
  if (!summary)
    return res.status(400).json({ ok: false, error: "Missing 'summary'" });
  if (action && !validActions.includes(action))
    return res.status(400).json({ ok: false, error: `Invalid 'action'. Must be one of: ${validActions.join(", ")}` });
  if (priority && !validPriorities.includes(priority))
    return res.status(400).json({ ok: false, error: `Invalid 'priority'. Must be one of: ${validPriorities.join(", ")}` });

  const bus = await readBus();
  const queue = `pending_for_${to}`;

  const task = {
    id: crypto.randomUUID(),
    from,
    to,
    action: action || "review",
    repo: repo || null,
    summary: summary.substring(0, 200),
    body: body || null,
    priority: priority || "normal",
    created_at: new Date().toISOString(),
    status: "pending"
  };

  bus[queue].push(task);
  await writeBus(bus);
  res.json({ ok: true, task });
});

// POST /api/agent-bus/complete — mark task as done
router.post("/complete", async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ ok: false, error: "Missing task id" });

  const bus = await readBus();
  let found = false;

  for (const queue of ["pending_for_antigravity", "pending_for_claude_code"]) {
    const idx = bus[queue].findIndex(t => t.id === id);
    if (idx !== -1) {
      const [task] = bus[queue].splice(idx, 1);
      task.status = "done";
      task.completed_at = new Date().toISOString();
      bus.completed.push(task);
      found = true;
    }
  }

  if (!found) return res.status(404).json({ ok: false, error: "Task not found" });
  await writeBus(bus);
  res.json({ ok: true });
});

module.exports = router;
