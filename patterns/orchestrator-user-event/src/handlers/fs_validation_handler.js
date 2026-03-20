/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description Handler for validating invoice data before save.
 *              Validates required fields, cross-field rules, and custom business rules.
 */
define(
	[
		'../../config/fs_base_handler'
	],
	(
		BaseHandler
	) => {
		class ValidationHandler extends BaseHandler {
			constructor() {
				super();
			}

			/**
			 * Main entry point for validation on beforeSubmit
			 *
			 * @param {Object} scriptContext - The script context from User Event
			 * @returns {Object} Result object with execution details
			 */
			executeBeforeSubmit = (scriptContext) => {
				try {
					const newRecord = scriptContext.newRecord;
					const errors = [];

					// Run all validation rules
					this.validateRequiredFields(newRecord, errors);
					this.validateDates(newRecord, errors);
					this.validateLineItems(newRecord, errors);
					this.validateBusinessRules(newRecord, errors);

					// If there are errors, throw to prevent save
					if (errors.length > 0) {
						const errorMessage = this.formatValidationErrors(errors);
						this.error('ValidationHandler.executeBeforeSubmit', errorMessage);

						// Create a SuiteScript error to prevent save with user-friendly message
						const errorModule = this.loadModule('N/error');
						if (errorModule) {
							throw errorModule.create({
								name: 'VALIDATION_ERROR',
								message: errorMessage,
								notifyOff: false
							});
						}

						// Fallback if error module fails to load
						throw new Error(errorMessage);
					}

					this.audit('ValidationHandler.executeBeforeSubmit', 'All validations passed');

					return {
						executed: true,
						result: { validationsPassed: true }
					};

				} catch (e) {
					// If it's our validation error, let it bubble up
					if (e.name === 'VALIDATION_ERROR') {
						throw e;
					}

					// Otherwise handle as internal error
					this.handleException(e, 'ValidationHandler.executeBeforeSubmit');
					return {
						executed: false,
						error: e.message
					};
				}
			}

			/**
			 * Validate required fields
			 *
			 * @param {Record} record - The invoice record
			 * @param {Array} errors - Array to collect error messages
			 */
			validateRequiredFields = (record, errors) => {
				const requiredFields = [
					{ id: 'entity', label: 'Customer' },
					{ id: 'trandate', label: 'Transaction Date' }
				];

				requiredFields.forEach(field => {
					const value = record.getValue({ fieldId: field.id });
					if (!value || value === '' || value === 0) {
						errors.push(`${field.label} is required`);
					}
				});
			}

			/**
			 * Validate date fields and cross-field date rules
			 *
			 * @param {Record} record - The invoice record
			 * @param {Array} errors - Array to collect error messages
			 */
			validateDates = (record, errors) => {
				const tranDate = record.getValue({ fieldId: 'trandate' });
				const shipDate = record.getValue({ fieldId: 'shipdate' });

				// If both dates exist, ship date must be on or after transaction date
				if (tranDate && shipDate) {
					const tranDateObj = new Date(tranDate);
					const shipDateObj = new Date(shipDate);

					if (shipDateObj < tranDateObj) {
						errors.push('Ship Date cannot be before Transaction Date');
					}
				}

				// Transaction date cannot be in the future
				if (tranDate) {
					const tranDateObj = new Date(tranDate);
					const today = new Date();
					today.setHours(0, 0, 0, 0); // Reset to start of day

					if (tranDateObj > today) {
						errors.push('Transaction Date cannot be in the future');
					}
				}
			}

			/**
			 * Validate line items
			 *
			 * @param {Record} record - The invoice record
			 * @param {Array} errors - Array to collect error messages
			 */
			validateLineItems = (record, errors) => {
				const sublistId = this.ITEM_SUBLIST_ID;
				const lineCount = record.getLineCount({ sublistId });

				if (lineCount === 0) {
					errors.push('Invoice must have at least one line item');
					return;
				}

				// Validate each line
				for (let i = 0; i < lineCount; i++) {
					const item = record.getSublistValue({
						sublistId,
						fieldId: this.LINE_ITEM_FIELD_ID,
						line: i
					});

					const quantity = record.getSublistValue({
						sublistId,
						fieldId: this.LINE_QUANTITY_FIELD_ID,
						line: i
					});

					const rate = record.getSublistValue({
						sublistId,
						fieldId: this.LINE_RATE_FIELD_ID,
						line: i
					});

					if (!item) {
						errors.push(`Line ${i + 1}: Item is required`);
					}

					if (!quantity || quantity <= 0) {
						errors.push(`Line ${i + 1}: Quantity must be greater than zero`);
					}

					if (rate === null || rate === undefined) {
						errors.push(`Line ${i + 1}: Rate is required`);
					}
				}
			}

			/**
			 * Validate custom business rules
			 *
			 * @param {Record} record - The invoice record
			 * @param {Array} errors - Array to collect error messages
			 */
			validateBusinessRules = (record, errors) => {
				// Example: Validate total amount threshold for approval
				const total = record.getValue({ fieldId: 'total' });
				const approvalStatus = record.getValue({ fieldId: this.APPROVAL_STATUS_FIELD_ID });

				// If total exceeds $10,000, must be approved
				if (total > 10000 && approvalStatus === this.PENDING_APPROVAL_STATUS) {
					// This is actually valid - just log it
					this.debug('validateBusinessRules', `High-value invoice detected: $${total}`);
				}

				// Example: Validate customer payment terms
				const customerId = record.getValue({ fieldId: 'entity' });
				if (customerId) {
					const customerData = this.getCustomerData(customerId);
					if (customerData && customerData.credithold === 'T') {
						errors.push('Cannot create invoice for customer on credit hold');
					}
				}
			}

			/**
			 * Get customer data for validation
			 *
			 * @param {string} customerId - Customer internal ID
			 * @returns {Object|null} Customer field values or null
			 */
			getCustomerData = (customerId) => {
				try {
					const search = this.loadModule('N/search');
					if (!search) {
						this.error('getCustomerData', 'Failed to load search module');
						return null;
					}

					return search.lookupFields({
						type: search.Type.CUSTOMER,
						id: customerId,
						columns: ['credithold', 'terms']
					});
				} catch (e) {
					this.handleException(e, 'getCustomerData');
					return null;
				}
			}

			/**
			 * Format validation errors into a user-friendly message
			 *
			 * @param {Array} errors - Array of error messages
			 * @returns {string} Formatted error message
			 */
			formatValidationErrors = (errors) => {
				if (errors.length === 1) {
					return `Validation Error: ${errors[0]}`;
				}

				return `Validation Errors:\n${errors.map((err, idx) => `${idx + 1}. ${err}`).join('\n')}`;
			}
		}

		return ValidationHandler;
	});
