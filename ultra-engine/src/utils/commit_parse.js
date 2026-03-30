/**
 * Pure functions for parsing git commit data.
 * Extracted from routes/agentbus.js for testability.
 */

/**
 * Determine the action type from a commit message.
 * @param {string} message - Commit message
 * @returns {'fix'|'test'|'deploy'|'review'}
 */
function parseCommitAction(message) {
  if (/^fix/i.test(message)) return 'fix';
  if (/^test/i.test(message)) return 'test';
  if (/^deploy|^release/i.test(message)) return 'deploy';
  return 'review';
}

/**
 * Identify the source of a commit (which agent or human).
 * @param {string} author - Commit author name
 * @param {string} message - Commit message
 * @returns {'claude_code'|'antigravity'|'human'}
 */
function identifyCommitSource(author, message) {
  const isClaudeCode = message.includes('Co-Authored-By: Claude') || author.toLowerCase().includes('claude');
  const isAntigravity = author.toLowerCase().includes('antigravity') || message.includes('antigravity');

  if (isClaudeCode) return 'claude_code';
  if (isAntigravity) return 'antigravity';
  return 'human';
}

module.exports = { parseCommitAction, identifyCommitSource };
