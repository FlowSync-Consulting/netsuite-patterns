/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Sales Order Builder
 * Creates sales orders from work entry records.
 *
 * Features:
 * - Create new sales order from work entries
 * - Add work entries to existing sales order
 * - Outcome-to-item mapping
 * - Proper field order for NetSuite requirements
 * - Classification field setting
 *
 * CRITICAL NetSuite Requirement:
 * When adding line items to SO, ITEM must be set FIRST before price, department, etc.
 * Otherwise NetSuite will throw errors about invalid price levels or classification values.
 *
 * @module so_builder
 */
define([
    'N/record',
    'N/search',
    'N/log',
    './record_helpers'
], function(record, search, log, recordHelpers) {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Default SO configuration
    // In production, these would come from a config record or script parameter
    const DEFAULT_CONFIG = {
        subsidiary: 1,          // Replace with actual subsidiary ID
        department: 1,          // Replace with actual department ID
        location: 1,            // Replace with actual location ID
        priceLevel: -1,         // -1 = Custom pricing
        cseg1: null             // Custom segment (optional)
    };

    // Outcome-to-Item mapping
    // Maps work entry outcome to inventory item internal ID
    const OUTCOME_ITEM_MAP = {
        '1': 123,  // Repaired → Repair Service Item
        '2': 124,  // Replaced → Replacement Service Item
        '3': 125,  // Unrepairable → Evaluation Fee Item
        '4': 126   // No Issue Found → Diagnostic Fee Item
    };

    // Default item for unmapped outcomes
    const DEFAULT_ITEM_ID = 125;  // Evaluation Fee

    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Create a new sales order from work entry records
     * @param {number|string} customerId - Customer internal ID
     * @param {Array<number|string>} workEntryIds - Array of work entry internal IDs
     * @param {Object} [config] - Optional configuration overrides
     * @returns {number} Created sales order internal ID
     * @throws {Error} If SO creation fails
     */
    function createSalesOrderFromWorkEntries(customerId, workEntryIds, config) {
        log.audit({
            title: 'SO Builder - Creating Sales Order',
            details: 'Customer: ' + customerId + ', Work Entries: ' + workEntryIds.length
        });

        try {
            const soConfig = config || DEFAULT_CONFIG;

            // Load customer subsidiary (required for multi-subsidiary)
            const customerSubsidiary = getCustomerSubsidiary(customerId);
            if (customerSubsidiary) {
                soConfig.subsidiary = customerSubsidiary;
            }

            // Create sales order in dynamic mode
            const so = record.create({
                type: record.Type.SALES_ORDER,
                isDynamic: true
            });

            // Set header fields IN CORRECT ORDER
            // Customer and subsidiary must be set before line items
            so.setValue({ fieldId: 'entity', value: customerId });
            so.setValue({ fieldId: 'subsidiary', value: soConfig.subsidiary });
            so.setValue({ fieldId: 'trandate', value: new Date() });

            // Optional: Set department/location at header level
            if (soConfig.department) {
                recordHelpers.safeSetValue(so, 'department', soConfig.department);
            }

            // Load work entry details
            const workEntries = loadWorkEntries(workEntryIds);

            if (workEntries.length === 0) {
                throw new Error('No work entries found for IDs: ' + workEntryIds.join(', '));
            }

            // Add line items
            workEntries.forEach(function(entry) {
                addLineItem(so, entry, soConfig);
            });

            // Save the sales order
            const soId = so.save();

            log.audit({
                title: 'SO Builder - Sales Order Created',
                details: 'SO ID: ' + soId + ', Line Items: ' + workEntries.length
            });

            // Update work entries with SO reference and mark as billed
            updateWorkEntriesWithSO(workEntryIds, soId);

            return soId;

        } catch (e) {
            log.error({
                title: 'SO Builder - Creation Error',
                details: 'Customer: ' + customerId + ', Error: ' + e.message + '\n' + e.stack
            });
            throw new Error('Failed to create sales order: ' + e.message);
        }
    }

    /**
     * Add work entries to an existing sales order
     * @param {number|string} salesOrderId - Sales order internal ID
     * @param {Array<number|string>} workEntryIds - Array of work entry internal IDs
     * @param {Object} [config] - Optional configuration overrides
     * @returns {number} Updated sales order internal ID
     * @throws {Error} If SO update fails
     */
    function addWorkEntriesToSalesOrder(salesOrderId, workEntryIds, config) {
        log.audit({
            title: 'SO Builder - Adding to Existing SO',
            details: 'SO ID: ' + salesOrderId + ', Work Entries: ' + workEntryIds.length
        });

        try {
            const soConfig = config || DEFAULT_CONFIG;

            // Load existing sales order in dynamic mode
            const so = record.load({
                type: record.Type.SALES_ORDER,
                id: salesOrderId,
                isDynamic: true
            });

            // Load work entry details
            const workEntries = loadWorkEntries(workEntryIds);

            if (workEntries.length === 0) {
                throw new Error('No work entries found for IDs: ' + workEntryIds.join(', '));
            }

            // Add line items
            workEntries.forEach(function(entry) {
                addLineItem(so, entry, soConfig);
            });

            // Save the sales order
            so.save();

            log.audit({
                title: 'SO Builder - Lines Added to SO',
                details: 'SO ID: ' + salesOrderId + ', Added Lines: ' + workEntries.length
            });

            // Update work entries with SO reference and mark as billed
            updateWorkEntriesWithSO(workEntryIds, salesOrderId);

            return salesOrderId;

        } catch (e) {
            log.error({
                title: 'SO Builder - Add Lines Error',
                details: 'SO ID: ' + salesOrderId + ', Error: ' + e.message + '\n' + e.stack
            });
            throw new Error('Failed to add lines to sales order: ' + e.message);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Add a single line item to sales order
     * CRITICAL: Fields must be set in specific order per NetSuite requirements
     *
     * @param {Record} so - Sales order record (dynamic mode)
     * @param {Object} workEntry - Work entry data
     * @param {Object} config - SO configuration
     */
    function addLineItem(so, workEntry, config) {
        so.selectNewLine({ sublistId: 'item' });

        // STEP 1: Set ITEM field FIRST (NetSuite requirement)
        // Price level, department, and other fields depend on item being set first
        so.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'item',
            value: workEntry.itemId
        });

        // STEP 2: Set quantity
        so.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'quantity',
            value: 1
        });

        // STEP 3: Set price level (AFTER item)
        so.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'price',
            value: config.priceLevel
        });

        // STEP 4: Set classification fields (AFTER item)
        if (config.department) {
            recordHelpers.safeSetCurrentSublistValue(so, 'item', 'department', config.department);
        }

        if (config.location) {
            recordHelpers.safeSetCurrentSublistValue(so, 'item', 'location', config.location);
        }

        // STEP 5: Set custom segment (optional, with error handling)
        if (config.cseg1) {
            recordHelpers.safeSetCurrentSublistValue(so, 'item', 'cseg1', config.cseg1);
        }

        // STEP 6: Set item description (include serial number)
        const description = 'Serial: ' + workEntry.serial +
                          ' | Type: ' + workEntry.boardType +
                          ' | Outcome: ' + workEntry.outcomeText;

        so.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'description',
            value: description
        });

        // Commit the line
        so.commitLine({ sublistId: 'item' });
    }

    /**
     * Load work entry details from NetSuite
     * @param {Array<number|string>} entryIds - Work entry internal IDs
     * @returns {Array<Object>} Work entry data objects
     */
    function loadWorkEntries(entryIds) {
        const workEntrySearch = search.create({
            type: 'customrecord_fs_work_entry',
            filters: [
                ['internalid', 'anyof', entryIds]
            ],
            columns: [
                'internalid',
                'custrecord_fs_serial',
                'custrecord_fs_board_type',
                'custrecord_fs_outcome',
                'custrecord_fs_customer'
            ]
        });

        const results = workEntrySearch.run().getRange({ start: 0, end: 1000 });

        return results.map(function(result) {
            const outcomeId = result.getValue('custrecord_fs_outcome');
            const outcomeText = result.getText('custrecord_fs_outcome') || 'Unknown';

            return {
                id: result.getValue('internalid'),
                serial: result.getValue('custrecord_fs_serial') || '',
                boardType: result.getValue('custrecord_fs_board_type') || '',
                outcome: outcomeId,
                outcomeText: outcomeText,
                customerId: result.getValue('custrecord_fs_customer'),
                itemId: mapOutcomeToItem(outcomeId)
            };
        });
    }

    /**
     * Map work entry outcome to inventory item
     * @param {string} outcomeId - Outcome custom list value
     * @returns {number} Inventory item internal ID
     */
    function mapOutcomeToItem(outcomeId) {
        return OUTCOME_ITEM_MAP[outcomeId] || DEFAULT_ITEM_ID;
    }

    /**
     * Get customer's subsidiary (for multi-subsidiary environments)
     * @param {number|string} customerId - Customer internal ID
     * @returns {number|null} Subsidiary internal ID
     */
    function getCustomerSubsidiary(customerId) {
        try {
            const customerLookup = search.lookupFields({
                type: search.Type.CUSTOMER,
                id: customerId,
                columns: ['subsidiary']
            });

            if (customerLookup.subsidiary && customerLookup.subsidiary.length > 0) {
                return customerLookup.subsidiary[0].value;
            }

            return null;

        } catch (e) {
            log.debug({
                title: 'SO Builder - Subsidiary Lookup Failed',
                details: 'Customer: ' + customerId + ', Error: ' + e.message
            });
            return null;
        }
    }

    /**
     * Update work entries with sales order reference and mark as billed
     * @param {Array<number|string>} entryIds - Work entry internal IDs
     * @param {number|string} salesOrderId - Sales order internal ID
     */
    function updateWorkEntriesWithSO(entryIds, salesOrderId) {
        entryIds.forEach(function(entryId) {
            try {
                recordHelpers.updateRecord('customrecord_fs_work_entry', entryId, {
                    custrecord_fs_sales_order: salesOrderId,
                    custrecord_fs_status: '4'  // Status: Billed
                });
            } catch (e) {
                log.error({
                    title: 'SO Builder - Work Entry Update Failed',
                    details: 'Entry ID: ' + entryId + ', SO ID: ' + salesOrderId + ', Error: ' + e.message
                });
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════════════════════════════════

    return {
        createSalesOrderFromWorkEntries: createSalesOrderFromWorkEntries,
        addWorkEntriesToSalesOrder: addWorkEntriesToSalesOrder
    };
});
