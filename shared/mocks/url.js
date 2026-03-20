/**
 * Mock for N/url module
 */

function resolveScript(config) {
  const { scriptId, deploymentId, returnExternalUrl, params } = config;

  let url = `/app/site/hosting/scriptlet.nl?script=${scriptId}&deploy=${deploymentId}`;

  if (params) {
    Object.keys(params).forEach(key => {
      url += `&${key}=${encodeURIComponent(params[key])}`;
    });
  }

  if (returnExternalUrl) {
    return `https://system.netsuite.com${url}`;
  }

  return url;
}

function resolveRecord(config) {
  const { recordType, recordId, isEditMode, params } = config;

  let url = `/app/common/custom/custrecordentry.nl?rectype=${recordType}&id=${recordId}`;

  if (isEditMode) {
    url += '&e=T';
  }

  if (params) {
    Object.keys(params).forEach(key => {
      url += `&${key}=${encodeURIComponent(params[key])}`;
    });
  }

  return url;
}

module.exports = {
  resolveScript,
  resolveRecord
};
