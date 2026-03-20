/**
 * Mock for N/runtime module
 */

class Script {
  constructor() {
    this._remainingUsage = 10000;
    this.id = 'customscript_test';
    this.deploymentId = 'customdeploy_test';
    this.parameters = {};
  }

  getRemainingUsage() {
    return this._remainingUsage;
  }

  getParameter(config) {
    const name = config.name || config;
    return this.parameters[name] || null;
  }

  // Test helper
  _setRemainingUsage(usage) {
    this._remainingUsage = usage;
  }

  _setParameter(name, value) {
    this.parameters[name] = value;
  }
}

class User {
  constructor() {
    this.id = '1';
    this.name = 'Test User';
    this.email = 'test@example.com';
    this.role = '3'; // Administrator
    this.department = null;
    this.location = null;
    this.subsidiary = null;
  }

  getPreference(config) {
    return null;
  }
}

const _currentScript = new Script();
const _currentUser = new User();

function getCurrentScript() {
  return _currentScript;
}

function getCurrentUser() {
  return _currentUser;
}

const ContextType = {
  USER_INTERFACE: 'USERINTERFACE',
  SCHEDULED: 'SCHEDULED',
  MAP_REDUCE: 'MAPREDUCE',
  RESTLET: 'RESTLET',
  SUITELET: 'SUITELET',
  USER_EVENT: 'USEREVENT',
  CLIENT: 'CLIENT',
  WORKFLOW_ACTION: 'WORKFLOWACTION'
};

const EnvType = {
  PRODUCTION: 'PRODUCTION',
  SANDBOX: 'SANDBOX',
  BETA: 'BETA',
  INTERNAL: 'INTERNAL'
};

module.exports = {
  getCurrentScript,
  getCurrentUser,
  ContextType,
  EnvType
};
