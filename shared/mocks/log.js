/**
 * Mock for N/log module
 */

const logs = {
  debug: [],
  audit: [],
  error: [],
  emergency: []
};

function debug(title, details) {
  const entry = { title, details, timestamp: new Date() };
  logs.debug.push(entry);
  if (process.env.VERBOSE_LOGS) {
    console.log('[DEBUG]', title, details);
  }
}

function audit(title, details) {
  const entry = { title, details, timestamp: new Date() };
  logs.audit.push(entry);
  if (process.env.VERBOSE_LOGS) {
    console.log('[AUDIT]', title, details);
  }
}

function error(title, details) {
  const entry = { title, details, timestamp: new Date() };
  logs.error.push(entry);
  if (process.env.VERBOSE_LOGS) {
    console.error('[ERROR]', title, details);
  }
}

function emergency(title, details) {
  const entry = { title, details, timestamp: new Date() };
  logs.emergency.push(entry);
  if (process.env.VERBOSE_LOGS) {
    console.error('[EMERGENCY]', title, details);
  }
}

// Test helpers
function _clearLogs() {
  logs.debug = [];
  logs.audit = [];
  logs.error = [];
  logs.emergency = [];
}

function _getLogs() {
  return logs;
}

module.exports = {
  debug,
  audit,
  error,
  emergency,
  _clearLogs,
  _getLogs
};
