/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description Common record patterns and safe value getters/setters
 */
define(['N/record', 'N/log'], function(record, log) {

  /**
   * Safely get field value with fallback
   * @param {record.Record} rec - Record object
   * @param {string} fieldId - Field ID
   * @param {*} defaultValue - Default value if field is empty
   * @returns {*} Field value or default
   */
  function getSafeValue(rec, fieldId, defaultValue) {
    try {
      var value = rec.getValue({ fieldId: fieldId });
      return (value === null || value === undefined || value === '') ? defaultValue : value;
    } catch (e) {
      log.error('getSafeValue Error', 'Field: ' + fieldId + ', Error: ' + e.message);
      return defaultValue;
    }
  }

  /**
   * Safely get field text with fallback
   * @param {record.Record} rec - Record object
   * @param {string} fieldId - Field ID
   * @param {string} defaultValue - Default value if field is empty
   * @returns {string} Field text or default
   */
  function getSafeText(rec, fieldId, defaultValue) {
    try {
      var text = rec.getText({ fieldId: fieldId });
      return (text === null || text === undefined || text === '') ? defaultValue : text;
    } catch (e) {
      log.error('getSafeText Error', 'Field: ' + fieldId + ', Error: ' + e.message);
      return defaultValue;
    }
  }

  /**
   * Safely set field value (handles null/undefined)
   * @param {record.Record} rec - Record object
   * @param {string} fieldId - Field ID
   * @param {*} value - Value to set
   * @returns {record.Record} Record object for chaining
   */
  function setSafeValue(rec, fieldId, value) {
    try {
      // Convert null/undefined to empty string for text fields
      var safeValue = (value === null || value === undefined) ? '' : value;
      rec.setValue({ fieldId: fieldId, value: safeValue });
    } catch (e) {
      log.error('setSafeValue Error', 'Field: ' + fieldId + ', Value: ' + value + ', Error: ' + e.message);
    }
    return rec;
  }

  /**
   * Load record with error handling
   * @param {string} recordType - Record type
   * @param {string|number} recordId - Record ID
   * @returns {record.Record|null} Record object or null on error
   */
  function safeLoad(recordType, recordId) {
    try {
      return record.load({
        type: recordType,
        id: recordId
      });
    } catch (e) {
      log.error('safeLoad Error', 'Type: ' + recordType + ', ID: ' + recordId + ', Error: ' + e.message);
      return null;
    }
  }

  return {
    getSafeValue: getSafeValue,
    getSafeText: getSafeText,
    setSafeValue: setSafeValue,
    safeLoad: safeLoad
  };
});
