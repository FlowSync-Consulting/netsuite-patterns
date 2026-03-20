/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description Handler for auto-populating derived fields on invoices.
 *              Sets fields based on customer data, amounts, and business rules.
 */
define(
	[
		'../../config/fs_base_handler'
	],
	(
		BaseHandler
	) => {
		class FieldDerivationHandler extends BaseHandler {
			constructor() {
				super();

				// Custom field IDs for derived fields
				this.TERRITORY_FIELD_ID = 'custbody_fs_territory';
				this.APPROVAL_REQUIRED_FIELD_ID = 'custbody_fs_approval_required';
				this.RISK_LEVEL_FIELD_ID = 'custbody_fs_risk_level';
			}

			/**
			 * Main entry point for field derivation on beforeSubmit
			 *
			 * @param {Object} scriptContext - The script context from User Event
			 * @returns {Object} Result object with execution details
			 */
			executeBeforeSubmit = (scriptContext) => {
				try {
					const newRecord = scriptContext.newRecord;
					const derivedFields = [];

					// Derive territory from customer
					const territoryDerived = this.deriveTerritory(newRecord);
					if (territoryDerived) {
						derivedFields.push('territory');
					}

					// Derive approval requirement from amount
					const approvalDerived = this.deriveApprovalRequirement(newRecord);
					if (approvalDerived) {
						derivedFields.push('approvalRequired');
					}

					// Derive risk level from customer and amount
					const riskDerived = this.deriveRiskLevel(newRecord);
					if (riskDerived) {
						derivedFields.push('riskLevel');
					}

					this.audit('FieldDerivationHandler.executeBeforeSubmit', {
						invoiceId: newRecord.id,
						derivedFields: derivedFields
					});

					return {
						executed: true,
						result: { derivedFields: derivedFields }
					};

				} catch (e) {
					this.handleException(e, 'FieldDerivationHandler.executeBeforeSubmit');
					return {
						executed: false,
						error: e.message
					};
				}
			}

			/**
			 * Derive territory from customer record
			 *
			 * @param {Record} record - The invoice record
			 * @returns {boolean} True if territory was derived
			 */
			deriveTerritory = (record) => {
				try {
					const customerId = record.getValue({ fieldId: 'entity' });
					if (!customerId) return false;

					// Check if territory already set manually
					const currentTerritory = record.getValue({ fieldId: this.TERRITORY_FIELD_ID });
					if (currentTerritory) {
						this.debug('deriveTerritory', 'Territory already set, skipping derivation');
						return false;
					}

					// Get customer's default territory
					const search = this.loadModule('N/search');
					if (!search) {
						this.error('deriveTerritory', 'Failed to load search module');
						return false;
					}

					const customerFields = search.lookupFields({
						type: search.Type.CUSTOMER,
						id: customerId,
						columns: ['territory']
					});

					const customerTerritory = customerFields.territory;
					if (customerTerritory && customerTerritory[0]) {
						const territoryId = customerTerritory[0].value;
						record.setValue({
							fieldId: this.TERRITORY_FIELD_ID,
							value: territoryId
						});

						this.debug('deriveTerritory', `Territory ${territoryId} derived from customer ${customerId}`);
						return true;
					}

					return false;

				} catch (e) {
					this.handleException(e, 'deriveTerritory');
					return false;
				}
			}

			/**
			 * Derive approval requirement from invoice amount
			 *
			 * @param {Record} record - The invoice record
			 * @returns {boolean} True if approval requirement was derived
			 */
			deriveApprovalRequirement = (record) => {
				try {
					const total = record.getValue({ fieldId: 'total' });
					if (!total) return false;

					// Amounts over $10,000 require approval
					const requiresApproval = total > 10000;

					record.setValue({
						fieldId: this.APPROVAL_REQUIRED_FIELD_ID,
						value: requiresApproval
					});

					this.debug('deriveApprovalRequirement', {
						total: total,
						requiresApproval: requiresApproval
					});

					return true;

				} catch (e) {
					this.handleException(e, 'deriveApprovalRequirement');
					return false;
				}
			}

			/**
			 * Derive risk level from customer credit status and amount
			 *
			 * @param {Record} record - The invoice record
			 * @returns {boolean} True if risk level was derived
			 */
			deriveRiskLevel = (record) => {
				try {
					const customerId = record.getValue({ fieldId: 'entity' });
					const total = record.getValue({ fieldId: 'total' });

					if (!customerId || !total) return false;

					// Get customer credit data
					const search = this.loadModule('N/search');
					if (!search) {
						this.error('deriveRiskLevel', 'Failed to load search module');
						return false;
					}

					const customerFields = search.lookupFields({
						type: search.Type.CUSTOMER,
						id: customerId,
						columns: ['creditlimit', 'balance', 'overduebalance']
					});

					const creditLimit = parseFloat(customerFields.creditlimit) || 0;
					const balance = parseFloat(customerFields.balance) || 0;
					const overdueBalance = parseFloat(customerFields.overduebalance) || 0;

					// Determine risk level
					let riskLevel = 'Low';

					// High risk: Over credit limit or has overdue balance
					if (balance + total > creditLimit || overdueBalance > 0) {
						riskLevel = 'High';
					}
					// Medium risk: Within 80% of credit limit or high-value invoice
					else if ((balance + total) / creditLimit > 0.8 || total > 10000) {
						riskLevel = 'Medium';
					}

					record.setValue({
						fieldId: this.RISK_LEVEL_FIELD_ID,
						value: riskLevel
					});

					this.debug('deriveRiskLevel', {
						customerId: customerId,
						total: total,
						creditLimit: creditLimit,
						balance: balance,
						overdueBalance: overdueBalance,
						riskLevel: riskLevel
					});

					return true;

				} catch (e) {
					this.handleException(e, 'deriveRiskLevel');
					return false;
				}
			}
		}

		return FieldDerivationHandler;
	});
