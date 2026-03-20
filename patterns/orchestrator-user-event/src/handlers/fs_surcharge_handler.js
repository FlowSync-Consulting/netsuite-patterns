/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description Handler for calculating and applying configurable surcharges to invoices
 */
define(
	[
		'../../config/fs_base_handler'
	],
	(
		BaseHandler
	) => {
		class SurchargeHandler extends BaseHandler {
			constructor() {
				super();
			}

			/**
			 * Main entry point for surcharge calculation on beforeSubmit
			 *
			 * @param {Object} scriptContext - The script context from User Event
			 * @returns {Object} Result object with execution details
			 */
			executeBeforeSubmit = (scriptContext) => {
				try {
					const newRecord = scriptContext.newRecord;

					// Get the surcharge item ID from deployment parameter
					const surchargeItemId = this.wrapExecution(
						'getSurchargeItemId',
						() => this.getSurchargeItemId()
					);

					if (!surchargeItemId) {
						this.debug('SurchargeHandler.executeBeforeSubmit', 'No surcharge item ID configured, skipping surcharge calculation');
						return { executed: false, reason: 'No surcharge item ID configured' };
					}

					// Check if customer has surcharge enabled
					const customerId = newRecord.getValue('entity');
					const customerHasSurcharge = this.wrapExecution(
						'checkCustomerSurchargeEnabled',
						() => this.checkCustomerSurchargeEnabled(customerId),
						{ customerId }
					);

					if (!customerHasSurcharge) {
						this.debug('SurchargeHandler.executeBeforeSubmit',
							`Customer ${customerId} does not have surcharge enabled, skipping calculation`);
						return { executed: false, reason: 'Customer does not have surcharge enabled' };
					}

					this.audit('SurchargeHandler.executeBeforeSubmit', `Processing invoice with surcharge item ID: ${surchargeItemId}`);

					// Process the invoice lines to calculate surcharge
					const result = this.wrapExecution(
						'calculateAndSetSurcharge',
						() => this.calculateAndSetSurcharge(newRecord, surchargeItemId),
						{ recordId: newRecord.id, surchargeItemId }
					);

					if (result && result.updated) {
						this.audit('Surcharge Calculated Successfully', {
							invoiceId: newRecord.id,
							surchargeAmount: result.surchargeAmount,
							lineNumber: result.lineNumber,
							totalBeforeSurcharge: result.totalBeforeSurcharge
						});
					}

					return {
						executed: true,
						result: result
					};

				} catch (e) {
					this.handleException(e, 'SurchargeHandler.executeBeforeSubmit');
					return {
						executed: false,
						error: e.message
					};
				}
			}

			/**
			 * Check if customer has surcharge enabled
			 *
			 * @param {string} customerId - The internal ID of the customer
			 * @returns {boolean} True if customer has surcharge enabled
			 */
			checkCustomerSurchargeEnabled = (customerId) => {
				if (!customerId) return false;

				try {
					const search = this.loadModule('N/search');
					if (!search) {
						this.error('checkCustomerSurchargeEnabled', 'Failed to load search module');
						return false;
					}

					const customerFields = search.lookupFields({
						type: search.Type.CUSTOMER,
						id: customerId,
						columns: [this.CUSTOMER_SURCHARGE_FIELD_ID]
					});

					const surchargeEnabled = customerFields[this.CUSTOMER_SURCHARGE_FIELD_ID];

					this.debug('Customer Surcharge Check', {
						customerId,
						surchargeEnabled
					});

					return surchargeEnabled === true || surchargeEnabled === 'T';

				} catch (e) {
					this.handleException(e, 'checkCustomerSurchargeEnabled');
					// Default to false if we can't determine
					return false;
				}
			}

			/**
			 * Calculate and set the surcharge amount on the appropriate line
			 *
			 * @param {Record} record - The invoice record
			 * @param {string} surchargeItemId - The internal ID of the surcharge item
			 * @returns {Object} Result object with update details
			 */
			calculateAndSetSurcharge = (record, surchargeItemId) => {
				const sublistId = this.ITEM_SUBLIST_ID;
				const lineCount = record.getLineCount({ sublistId });

				let surchargeLineIndex = -1;
				let totalBeforeSurcharge = 0;
				let hasRegularItems = false;

				// First pass: find surcharge line and calculate total of other items
				for (let i = 0; i < lineCount; i++) {
					const itemId = this.wrapExecution(
						'getLineItemId',
						() => record.getSublistValue({
							sublistId,
							fieldId: this.LINE_ITEM_FIELD_ID,
							line: i
						}),
						{ line: i }
					);

					if (itemId == surchargeItemId) {
						surchargeLineIndex = i;
					} else {
						// Add up amounts from non-surcharge lines
						const amount = this.wrapExecution(
							'getLineAmount',
							() => record.getSublistValue({
								sublistId,
								fieldId: this.LINE_AMOUNT_FIELD_ID,
								line: i
							}),
							{ line: i }
						) || 0;

						totalBeforeSurcharge += parseFloat(amount);
						hasRegularItems = true;
					}
				}

				// If no surcharge line found or no regular items, nothing to do
				if (surchargeLineIndex === -1) {
					this.debug('calculateAndSetSurcharge', 'No surcharge line found on invoice');
					return { updated: false, reason: 'No surcharge line found' };
				}

				if (!hasRegularItems) {
					this.debug('calculateAndSetSurcharge', 'No regular items found to calculate surcharge from');
					return { updated: false, reason: 'No regular items found' };
				}

				// Get the surcharge percentage from the item record
				const surchargePercentage = this.wrapExecution(
					'getSurchargePercentage',
					() => this.getSurchargePercentage(surchargeItemId),
					{ surchargeItemId }
				) || 0;

				// Calculate surcharge amount
				const surchargeAmount = totalBeforeSurcharge * surchargePercentage;

				this.debug('Surcharge Calculation Details', {
					totalBeforeSurcharge,
					surchargePercentage,
					surchargeAmount,
					surchargeLineIndex
				});

				// Update the surcharge line with calculated amount
				const updateSuccess = this.wrapExecutionWithBooleanReturn(
					'setSurchargeAmount',
					() => {
						// Set the rate to the calculated amount
						record.setSublistValue({
							sublistId,
							fieldId: this.LINE_RATE_FIELD_ID,
							line: surchargeLineIndex,
							value: surchargeAmount
						});

						// Set quantity to 1 if not already set
						const currentQty = record.getSublistValue({
							sublistId,
							fieldId: this.LINE_QUANTITY_FIELD_ID,
							line: surchargeLineIndex
						});

						if (!currentQty || currentQty == 0) {
							record.setSublistValue({
								sublistId,
								fieldId: this.LINE_QUANTITY_FIELD_ID,
								line: surchargeLineIndex,
								value: 1
							});
						}

						// Set the amount field directly
						record.setSublistValue({
							sublistId,
							fieldId: this.LINE_AMOUNT_FIELD_ID,
							line: surchargeLineIndex,
							value: surchargeAmount
						});
					},
					{ surchargeLineIndex, surchargeAmount }
				);

				return {
					updated: updateSuccess,
					surchargeAmount: surchargeAmount.toFixed(2),
					lineNumber: surchargeLineIndex + 1,
					totalBeforeSurcharge: totalBeforeSurcharge.toFixed(2),
					percentage: (surchargePercentage * 100).toFixed(2) + '%'
				};
			}
		}

		return SurchargeHandler;
	});
