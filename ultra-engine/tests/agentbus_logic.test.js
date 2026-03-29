import { describe, it, expect } from 'vitest';

/**
 * Pure commit parsing and routing logic extracted from routes/agentbus.js.
 * Tests the git-push webhook parsing without filesystem or HTTP dependencies.
 */

function parseCommit(commit, repoName) {
  const message = commit.message || '';
  const author = commit.author ? (commit.author.name || commit.author.username || '') : '';
  const hash = (commit.id || commit.sha || '').substring(0, 8);
  const files = [].concat(commit.added || [], commit.modified || [], commit.removed || []);

  const isClaudeCode = message.includes('Co-Authored-By: Claude') || author.toLowerCase().includes('claude');
  const isAntigravity = author.toLowerCase().includes('antigravity') || message.includes('antigravity');

  let action = 'review';
  if (/^fix/i.test(message)) action = 'fix';
  else if (/^test/i.test(message)) action = 'test';
  else if (/^deploy|^release/i.test(message)) action = 'deploy';

  return {
    from: isClaudeCode ? 'claude_code' : isAntigravity ? 'antigravity' : 'human',
    action,
    repo: repoName,
    commit: hash,
    summary: message.split('\n')[0].substring(0, 200),
    files_changed: files.length,
  };
}

function routeTask(task) {
  const isClaudeCode = task.from === 'claude_code';
  const isAntigravity = task.from === 'antigravity';
  const queues = [];
  if (!isClaudeCode || task.from === 'human') queues.push('pending_for_claude_code');
  if (!isAntigravity || task.from === 'human') queues.push('pending_for_antigravity');
  return queues;
}

// Validation logic extracted from /send endpoint (lines 110-124)
function validateSendPayload({ from, to, action, priority }) {
  const validAgents = ['claude_code', 'antigravity', 'claude_chat'];
  const validTargets = ['claude_code', 'antigravity'];
  const validActions = ['review', 'fix', 'build', 'test', 'question'];
  const validPriorities = ['low', 'normal', 'high'];

  if (!from || !validAgents.includes(from)) return 'invalid_from';
  if (!to || !validTargets.includes(to)) return 'invalid_to';
  if (action && !validActions.includes(action)) return 'invalid_action';
  if (priority && !validPriorities.includes(priority)) return 'invalid_priority';
  return null;
}

describe('Agent bus commit parsing', () => {
  it('detects Claude Code authored commits', () => {
    const result = parseCommit({
      message: 'fix(auth): patch\n\nCo-Authored-By: Claude',
      author: { name: 'user' },
      id: 'abc12345678',
    }, 'my-repo');
    expect(result.from).toBe('claude_code');
    expect(result.action).toBe('fix');
    expect(result.commit).toBe('abc12345');
    expect(result.repo).toBe('my-repo');
  });

  it('detects Antigravity authored commits', () => {
    const result = parseCommit({
      message: 'refactor: cleanup',
      author: { name: 'Antigravity Bot' },
      id: 'def456789',
    }, 'repo');
    expect(result.from).toBe('antigravity');
  });

  it('detects human commits', () => {
    const result = parseCommit({
      message: 'update readme',
      author: { name: 'John' },
      id: 'xyz789',
    }, 'repo');
    expect(result.from).toBe('human');
    expect(result.action).toBe('review');
  });

  it('parses fix action from message prefix', () => {
    const result = parseCommit({ message: 'fix: broken thing', id: '' }, 'r');
    expect(result.action).toBe('fix');
  });

  it('parses test action from message prefix', () => {
    const result = parseCommit({ message: 'test: add tests', id: '' }, 'r');
    expect(result.action).toBe('test');
  });

  it('parses deploy action from message prefix', () => {
    const result = parseCommit({ message: 'deploy: v2.0', id: '' }, 'r');
    expect(result.action).toBe('deploy');
  });

  it('parses release action as deploy', () => {
    const result = parseCommit({ message: 'Release 3.0', id: '' }, 'r');
    expect(result.action).toBe('deploy');
  });

  it('defaults to review for unrecognized prefixes', () => {
    const result = parseCommit({ message: 'refactor: stuff', id: '' }, 'r');
    expect(result.action).toBe('review');
  });

  it('counts changed files', () => {
    const result = parseCommit({
      message: 'update',
      id: '',
      added: ['a.js'],
      modified: ['b.js', 'c.js'],
      removed: ['d.js'],
    }, 'r');
    expect(result.files_changed).toBe(4);
  });

  it('truncates summary to 200 chars', () => {
    const longMsg = 'x'.repeat(300);
    const result = parseCommit({ message: longMsg, id: '' }, 'r');
    expect(result.summary.length).toBe(200);
  });

  it('handles missing author gracefully', () => {
    const result = parseCommit({ message: 'test', id: '' }, 'r');
    expect(result.from).toBe('human');
  });
});

describe('Agent bus task routing', () => {
  it('routes human tasks to both queues', () => {
    const queues = routeTask({ from: 'human' });
    expect(queues).toContain('pending_for_claude_code');
    expect(queues).toContain('pending_for_antigravity');
  });

  it('routes claude_code tasks to antigravity only', () => {
    const queues = routeTask({ from: 'claude_code' });
    expect(queues).not.toContain('pending_for_claude_code');
    expect(queues).toContain('pending_for_antigravity');
  });

  it('routes antigravity tasks to claude_code only', () => {
    const queues = routeTask({ from: 'antigravity' });
    expect(queues).toContain('pending_for_claude_code');
    expect(queues).not.toContain('pending_for_antigravity');
  });
});

describe('Agent bus /send validation', () => {
  it('accepts valid payload', () => {
    expect(validateSendPayload({ from: 'claude_code', to: 'antigravity' })).toBeNull();
  });

  it('rejects invalid from', () => {
    expect(validateSendPayload({ from: 'unknown', to: 'antigravity' })).toBe('invalid_from');
  });

  it('rejects missing from', () => {
    expect(validateSendPayload({ to: 'antigravity' })).toBe('invalid_from');
  });

  it('rejects invalid to', () => {
    expect(validateSendPayload({ from: 'claude_code', to: 'claude_chat' })).toBe('invalid_to');
  });

  it('rejects invalid action', () => {
    expect(validateSendPayload({ from: 'claude_code', to: 'antigravity', action: 'hack' })).toBe('invalid_action');
  });

  it('accepts valid actions', () => {
    for (const action of ['review', 'fix', 'build', 'test', 'question']) {
      expect(validateSendPayload({ from: 'claude_code', to: 'antigravity', action })).toBeNull();
    }
  });

  it('rejects invalid priority', () => {
    expect(validateSendPayload({ from: 'claude_code', to: 'antigravity', priority: 'urgent' })).toBe('invalid_priority');
  });

  it('accepts all valid priorities', () => {
    for (const priority of ['low', 'normal', 'high']) {
      expect(validateSendPayload({ from: 'claude_code', to: 'antigravity', priority })).toBeNull();
    }
  });

  it('allows claude_chat as sender', () => {
    expect(validateSendPayload({ from: 'claude_chat', to: 'claude_code' })).toBeNull();
  });

  it('allows omitted optional fields', () => {
    expect(validateSendPayload({ from: 'claude_code', to: 'antigravity' })).toBeNull();
  });
});
