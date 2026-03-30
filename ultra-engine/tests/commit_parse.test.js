import { describe, it, expect } from 'vitest';
import { parseCommitAction, identifyCommitSource } from '../src/utils/commit_parse.js';

describe('parseCommitAction', () => {
  it('returns "fix" for messages starting with fix', () => {
    expect(parseCommitAction('fix(auth): resolve token issue')).toBe('fix');
  });

  it('returns "fix" case-insensitively', () => {
    expect(parseCommitAction('Fix broken import')).toBe('fix');
    expect(parseCommitAction('FIX: urgent patch')).toBe('fix');
  });

  it('returns "test" for messages starting with test', () => {
    expect(parseCommitAction('test(utils): add edge case tests')).toBe('test');
  });

  it('returns "test" case-insensitively', () => {
    expect(parseCommitAction('Test coverage improvement')).toBe('test');
  });

  it('returns "deploy" for messages starting with deploy', () => {
    expect(parseCommitAction('deploy: push to production')).toBe('deploy');
  });

  it('returns "deploy" for messages starting with release', () => {
    expect(parseCommitAction('release v2.0.0')).toBe('deploy');
    expect(parseCommitAction('Release candidate 1')).toBe('deploy');
  });

  it('returns "review" for other messages', () => {
    expect(parseCommitAction('refactor(db): simplify queries')).toBe('review');
    expect(parseCommitAction('docs: update README')).toBe('review');
    expect(parseCommitAction('chore: bump dependencies')).toBe('review');
  });

  it('returns "review" for empty message', () => {
    expect(parseCommitAction('')).toBe('review');
  });

  it('does not match "fix" mid-message', () => {
    expect(parseCommitAction('refactor: fix something')).toBe('review');
  });

  it('does not match "test" mid-message', () => {
    expect(parseCommitAction('add test for auth')).toBe('review');
  });

  it('does not match "deploy" mid-message', () => {
    expect(parseCommitAction('prepare for deploy')).toBe('review');
  });
});

describe('identifyCommitSource', () => {
  it('identifies Claude Code by Co-Authored-By in message', () => {
    expect(identifyCommitSource('John', 'feat: add feature\n\nCo-Authored-By: Claude')).toBe('claude_code');
  });

  it('identifies Claude Code by author name', () => {
    expect(identifyCommitSource('Claude Bot', 'refactor: cleanup')).toBe('claude_code');
    expect(identifyCommitSource('claude-code', 'some change')).toBe('claude_code');
  });

  it('identifies Antigravity by author name', () => {
    expect(identifyCommitSource('antigravity-agent', 'build: compile assets')).toBe('antigravity');
    expect(identifyCommitSource('Antigravity', 'fix: patch')).toBe('antigravity');
  });

  it('identifies Antigravity by message content', () => {
    expect(identifyCommitSource('bot', 'antigravity auto-build')).toBe('antigravity');
  });

  it('returns "human" for regular commits', () => {
    expect(identifyCommitSource('John Doe', 'feat: add login page')).toBe('human');
  });

  it('returns "human" for empty author and message', () => {
    expect(identifyCommitSource('', '')).toBe('human');
  });

  it('Claude takes priority over Antigravity if both match', () => {
    expect(identifyCommitSource('claude', 'antigravity update')).toBe('claude_code');
  });
});
