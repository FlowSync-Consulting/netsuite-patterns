/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description Governance Guard - Safe remaining usage checking for long-running scripts
 * Prevents UNEXPECTED_ERROR by checking governance before expensive operations
 */
define(['N/runtime'], function(runtime) {

  /**
   * Check if sufficient governance units remain
   * @param {number} threshold - Minimum required units (default: 100)
   * @returns {boolean} True if remaining usage > threshold
   */
  function checkGovernance(threshold) {
    threshold = threshold || 100;
    var remaining = runtime.getCurrentScript().getRemainingUsage();
    return remaining > threshold;
  }

  /**
   * Get current remaining usage
   * @returns {number} Remaining governance units
   */
  function getRemainingUsage() {
    return runtime.getCurrentScript().getRemainingUsage();
  }

  /**
   * Recommended governance thresholds for common operations
   * @constant
   */
  var THRESHOLDS = {
    SEARCH: 100,           // Before executing search.run()
    RECORD_SAVE: 200,      // Before record.save()
    MAP_REDUCE_YIELD: 500, // Before yielding in map/reduce
    SUITELET_RENDER: 50,   // Before rendering large forms
    LOOP_ITERATION: 10     // Per iteration in large loops
  };

  return {
    checkGovernance: checkGovernance,
    getRemainingUsage: getRemainingUsage,
    THRESHOLDS: THRESHOLDS
  };
});
