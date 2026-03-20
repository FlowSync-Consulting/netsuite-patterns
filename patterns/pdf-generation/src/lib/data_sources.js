/**
 * @NApiVersion 2.1
 * @description Data source loader - loads and normalizes record data for PDF templates
 */
define(['N/record', 'N/search', 'N/format', 'N/log'], (record, search, format, log) => {

    /**
     * Load and normalize record data for template rendering
     * @param {string} recordType - NetSuite record type
     * @param {number} recordId - Record internal ID
     * @returns {Object} Normalized record data
     */
    function loadRecordData(recordType, recordId) {
        log.debug('Loading Record Data', { recordType, recordId });

        const rec = record.load({
            type: recordType,
            id: recordId,
            isDynamic: false
        });

        // Normalize based on record type
        if (isTransactionRecord(recordType)) {
            return loadTransactionData(rec);
        } else {
            return loadGenericData(rec);
        }
    }

    /**
     * Load transaction record data (invoices, sales orders, etc.)
     * @param {Record} rec
     * @returns {Object}
     */
    function loadTransactionData(rec) {
        const data = {
            // Header fields
            id: rec.id,
            type: rec.type,
            tranId: rec.getValue('tranid'),
            tranDate: formatDate(rec.getValue('trandate')),
            dueDate: formatDate(rec.getValue('duedate')),
            status: rec.getText('status'),

            // Customer/entity
            entity: {
                id: rec.getValue('entity'),
                name: rec.getText('entity'),
                email: getEntityEmail(rec.getValue('entity')),
                phone: getEntityPhone(rec.getValue('entity'))
            },

            // Billing address
            billingAddress: {
                attention: rec.getValue('billattention'),
                addressee: rec.getValue('billaddressee'),
                addr1: rec.getValue('billaddr1'),
                addr2: rec.getValue('billaddr2'),
                city: rec.getValue('billcity'),
                state: rec.getValue('billstate'),
                zip: rec.getValue('billzip'),
                country: rec.getValue('billcountry')
            },

            // Shipping address
            shippingAddress: {
                attention: rec.getValue('shipattention'),
                addressee: rec.getValue('shipaddressee'),
                addr1: rec.getValue('shipaddr1'),
                addr2: rec.getValue('shipaddr2'),
                city: rec.getValue('shipcity'),
                state: rec.getValue('shipstate'),
                zip: rec.getValue('shipzip'),
                country: rec.getValue('shipcountry')
            },

            // Terms and memo
            terms: rec.getText('terms'),
            memo: rec.getValue('memo'),
            message: rec.getValue('custbody_message') || '',

            // Totals
            subtotal: formatCurrency(rec.getValue('subtotal')),
            taxtotal: formatCurrency(rec.getValue('taxtotal')),
            shippingcost: formatCurrency(rec.getValue('shippingcost')),
            total: formatCurrency(rec.getValue('total')),

            // Line items
            lineItems: loadLineItems(rec),

            // Company info (from preferences)
            company: getCompanyInfo()
        };

        return data;
    }

    /**
     * Load line items from transaction
     * @param {Record} rec
     * @returns {Array<Object>}
     */
    function loadLineItems(rec) {
        const lineCount = rec.getLineCount({ sublistId: 'item' });
        const lineItems = [];

        for (let i = 0; i < lineCount; i++) {
            const lineItem = {
                line: i + 1,
                item: {
                    id: rec.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i }),
                    name: rec.getSublistText({ sublistId: 'item', fieldId: 'item', line: i }),
                    description: rec.getSublistValue({ sublistId: 'item', fieldId: 'description', line: i }) || ''
                },
                quantity: rec.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i }),
                rate: formatCurrency(rec.getSublistValue({ sublistId: 'item', fieldId: 'rate', line: i })),
                amount: formatCurrency(rec.getSublistValue({ sublistId: 'item', fieldId: 'amount', line: i })),
                taxcode: rec.getSublistText({ sublistId: 'item', fieldId: 'taxcode', line: i }) || '',

                // Category for grouping (if available)
                category: rec.getSublistText({ sublistId: 'item', fieldId: 'custcol_category', line: i }) || 'General',

                // Classification fields
                department: rec.getSublistText({ sublistId: 'item', fieldId: 'department', line: i }) || '',
                class: rec.getSublistText({ sublistId: 'item', fieldId: 'class', line: i }) || '',
                location: rec.getSublistText({ sublistId: 'item', fieldId: 'location', line: i }) || ''
            };

            lineItems.push(lineItem);
        }

        return lineItems;
    }

    /**
     * Load generic (non-transaction) record data
     * @param {Record} rec
     * @returns {Object}
     */
    function loadGenericData(rec) {
        // For custom records or other record types,
        // return basic data structure
        return {
            id: rec.id,
            type: rec.type,
            name: rec.getValue('name') || rec.getValue('id'),
            // Add more fields as needed
        };
    }

    /**
     * Get entity (customer/vendor) email
     * @param {number} entityId
     * @returns {string}
     */
    function getEntityEmail(entityId) {
        if (!entityId) {
            return '';
        }

        try {
            const lookupFields = search.lookupFields({
                type: search.Type.CUSTOMER,
                id: entityId,
                columns: ['email']
            });
            return lookupFields.email || '';
        } catch (e) {
            log.debug('Could not load entity email', e.message);
            return '';
        }
    }

    /**
     * Get entity phone
     * @param {number} entityId
     * @returns {string}
     */
    function getEntityPhone(entityId) {
        if (!entityId) {
            return '';
        }

        try {
            const lookupFields = search.lookupFields({
                type: search.Type.CUSTOMER,
                id: entityId,
                columns: ['phone']
            });
            return lookupFields.phone || '';
        } catch (e) {
            log.debug('Could not load entity phone', e.message);
            return '';
        }
    }

    /**
     * Get company information from configuration
     * @returns {Object}
     */
    function getCompanyInfo() {
        // In production, load from company information record or preferences
        // For this pattern, return placeholder data
        return {
            name: 'Your Company Name',
            address: '123 Main Street',
            city: 'Your City',
            state: 'ST',
            zip: '12345',
            phone: '(555) 123-4567',
            email: 'info@yourcompany.com',
            website: 'www.yourcompany.com',
            logo: '/path/to/logo.png'  // File cabinet path
        };
    }

    /**
     * Check if record type is a transaction
     * @param {string} recordType
     * @returns {boolean}
     */
    function isTransactionRecord(recordType) {
        const transactionTypes = [
            'invoice', 'salesorder', 'estimate', 'creditmemo',
            'cashsale', 'itemfulfillment', 'purchaseorder',
            'vendorbill', 'check', 'bill'
        ];
        return transactionTypes.indexOf(recordType.toLowerCase()) >= 0;
    }

    /**
     * Format date for display
     * @param {Date|string} dateValue
     * @returns {string}
     */
    function formatDate(dateValue) {
        if (!dateValue) {
            return '';
        }

        try {
            return format.format({
                value: dateValue,
                type: format.Type.DATE
            });
        } catch (e) {
            return String(dateValue);
        }
    }

    /**
     * Format currency for display
     * @param {number|string} amount
     * @returns {string}
     */
    function formatCurrency(amount) {
        if (!amount && amount !== 0) {
            return '$0.00';
        }

        const num = parseFloat(amount);
        if (isNaN(num)) {
            return '$0.00';
        }

        return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    return {
        loadRecordData: loadRecordData,
        formatCurrency: formatCurrency,
        formatDate: formatDate
    };
});
