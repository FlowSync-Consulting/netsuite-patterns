/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description Handler registry that manages and executes handlers for invoice record actions.
 *              Supports lazy loading, priority ordering, and enable/disable per handler.
 */
define(
	[
		'../../config/fs_base_handler'
		// Handler imports are lazy-loaded for governance optimization
	],
	(
		BaseHandler
		// Handler classes loaded on-demand
	) => {
		class HandlerRegistry extends BaseHandler {
			constructor() {
				super();

				// Store handler module paths but don't load them yet (lazy loading)
				this.handlerPaths = {
					surchargeHandler: '../handlers/fs_surcharge_handler',
					validationHandler: '../handlers/fs_validation_handler',
					fieldDerivationHandler: '../handlers/fs_field_derivation_handler'
				};

				// Loaded handler instances (populated on first use)
				this.handlers = {};
			}

			/**
			 * Lazy-load a handler module
			 *
			 * @param {string} handlerKey - Key in handlerPaths
			 * @returns {Object} Handler instance
			 */
			loadHandler = (handlerKey) => {
				if (this.handlers[handlerKey]) {
					return this.handlers[handlerKey];
				}

				const handlerPath = this.handlerPaths[handlerKey];
				if (!handlerPath) {
					this.error('loadHandler', `Unknown handler key: ${handlerKey}`);
					return null;
				}

				const HandlerClass = this.loadModule(handlerPath);
				if (!HandlerClass) {
					this.error('loadHandler', `Failed to load handler: ${handlerPath}`);
					return null;
				}

				this.handlers[handlerKey] = new HandlerClass();
				return this.handlers[handlerKey];
			}

			/**
			 * Get handler configuration for all entry points
			 * Handlers are lazy-loaded only when needed
			 *
			 * @returns {Object} Handler configurations by entry point
			 */
			getHandlerConfig = () => {
				return {
					beforeSubmitHandlers: [
						{
							name: 'SurchargeHandler',
							key: 'surchargeHandler',
							enabled: true,
							order: 1
						},
						{
							name: 'ValidationHandler',
							key: 'validationHandler',
							enabled: true,
							order: 2
						},
						{
							name: 'FieldDerivationHandler',
							key: 'fieldDerivationHandler',
							enabled: true,
							order: 3
						}
					],
					beforeLoadHandlers: [
						// Add beforeLoad handlers here when needed
					],
					afterSubmitHandlers: [
						// Add afterSubmit handlers here when needed
					]
				};
			}

			/**
			 * Execute all enabled beforeSubmit handlers
			 *
			 * @param {Object} scriptContext - The script context from User Event
			 * @returns {Object} Summary of all handler executions
			 */
			executeBeforeSubmit = (scriptContext) => {
				const results = {
					executed: [],
					skipped: [],
					failed: []
				};

				// Only run on create and edit operations
				if (scriptContext.type !== scriptContext.UserEventType.CREATE &&
					scriptContext.type !== scriptContext.UserEventType.EDIT) {
					this.debug('HandlerRegistry.executeBeforeSubmit', `Skipping - Event type ${scriptContext.type} not supported`);
					return results;
				}

				// Get handler configuration
				const config = this.getHandlerConfig();
				const handlerConfigs = config.beforeSubmitHandlers;

				this.audit('HandlerRegistry.executeBeforeSubmit', {
					recordType: scriptContext.newRecord.type,
					recordId: scriptContext.newRecord.id,
					eventType: scriptContext.type,
					handlersToRun: handlerConfigs.filter(h => h.enabled).map(h => h.name)
				});

				// Sort handlers by order if specified
				const sortedHandlers = [...handlerConfigs].sort((a, b) => {
					const orderA = a.order || 999;
					const orderB = b.order || 999;
					return orderA - orderB;
				});

				// Execute each enabled handler
				sortedHandlers.forEach(handlerConfig => {
					if (!handlerConfig.enabled) {
						results.skipped.push({
							name: handlerConfig.name,
							reason: 'Handler disabled'
						});
						return;
					}

					try {
						// Lazy-load the handler
						const handler = this.loadHandler(handlerConfig.key);
						if (!handler) {
							results.failed.push({
								name: handlerConfig.name,
								error: 'Failed to load handler module'
							});
							return;
						}

						const handlerResult = this.wrapExecution(
							`Execute ${handlerConfig.name}`,
							() => handler.executeBeforeSubmit(scriptContext),
							{ handlerName: handlerConfig.name }
						);

						if (handlerResult && handlerResult.executed) {
							results.executed.push({
								name: handlerConfig.name,
								result: handlerResult.result
							});
						} else {
							results.skipped.push({
								name: handlerConfig.name,
								reason: handlerResult?.reason || 'Handler returned false'
							});
						}
					} catch (e) {
						this.handleException(e, `HandlerRegistry.executeBeforeSubmit.${handlerConfig.name}`);
						results.failed.push({
							name: handlerConfig.name,
							error: e.message
						});
					}
				});

				// Log summary
				if (results.executed.length > 0 || results.failed.length > 0) {
					this.audit('HandlerRegistry.executeBeforeSubmit Summary', results);
				}

				return results;
			}

			/**
			 * Execute all enabled beforeLoad handlers
			 *
			 * @param {Object} scriptContext - The script context from User Event
			 * @returns {Object} Summary of all handler executions
			 */
			executeBeforeLoad = (scriptContext) => {
				const results = {
					executed: [],
					skipped: [],
					failed: []
				};

				// Get handler configuration
				const config = this.getHandlerConfig();
				const handlerConfigs = config.beforeLoadHandlers;

				if (handlerConfigs.length === 0) {
					return results;
				}

				this.audit('HandlerRegistry.executeBeforeLoad', {
					recordType: scriptContext.newRecord.type,
					recordId: scriptContext.newRecord.id,
					eventType: scriptContext.type,
					handlersToRun: handlerConfigs.filter(h => h.enabled).map(h => h.name)
				});

				// Execute each enabled handler
				handlerConfigs.forEach(handlerConfig => {
					if (!handlerConfig.enabled) {
						results.skipped.push({
							name: handlerConfig.name,
							reason: 'Handler disabled'
						});
						return;
					}

					try {
						// Lazy-load the handler
						const handler = this.loadHandler(handlerConfig.key);
						if (!handler) {
							results.failed.push({
								name: handlerConfig.name,
								error: 'Failed to load handler module'
							});
							return;
						}

						const handlerResult = this.wrapExecution(
							`Execute ${handlerConfig.name}`,
							() => handler.executeBeforeLoad(scriptContext),
							{ handlerName: handlerConfig.name }
						);

						if (handlerResult && handlerResult.executed) {
							results.executed.push({
								name: handlerConfig.name,
								result: handlerResult.result
							});
						} else {
							results.skipped.push({
								name: handlerConfig.name,
								reason: handlerResult?.reason || 'Handler returned false'
							});
						}
					} catch (e) {
						this.handleException(e, `HandlerRegistry.executeBeforeLoad.${handlerConfig.name}`);
						results.failed.push({
							name: handlerConfig.name,
							error: e.message
						});
					}
				});

				// Log summary if there were handlers
				if (results.executed.length > 0 || results.failed.length > 0) {
					this.audit('HandlerRegistry.executeBeforeLoad Summary', results);
				}

				return results;
			}

			/**
			 * Execute all enabled afterSubmit handlers
			 *
			 * @param {Object} scriptContext - The script context from User Event
			 * @returns {Object} Summary of all handler executions
			 */
			executeAfterSubmit = (scriptContext) => {
				const results = {
					executed: [],
					skipped: [],
					failed: []
				};

				// Get handler configuration
				const config = this.getHandlerConfig();
				const handlerConfigs = config.afterSubmitHandlers;

				if (handlerConfigs.length === 0) {
					return results;
				}

				this.audit('HandlerRegistry.executeAfterSubmit', {
					recordType: scriptContext.newRecord.type,
					recordId: scriptContext.newRecord.id,
					eventType: scriptContext.type,
					handlersToRun: handlerConfigs.filter(h => h.enabled).map(h => h.name)
				});

				// Execute each enabled handler
				handlerConfigs.forEach(handlerConfig => {
					if (!handlerConfig.enabled) {
						results.skipped.push({
							name: handlerConfig.name,
							reason: 'Handler disabled'
						});
						return;
					}

					try {
						// Lazy-load the handler
						const handler = this.loadHandler(handlerConfig.key);
						if (!handler) {
							results.failed.push({
								name: handlerConfig.name,
								error: 'Failed to load handler module'
							});
							return;
						}

						const handlerResult = this.wrapExecution(
							`Execute ${handlerConfig.name}`,
							() => handler.executeAfterSubmit(scriptContext),
							{ handlerName: handlerConfig.name }
						);

						if (handlerResult && handlerResult.executed) {
							results.executed.push({
								name: handlerConfig.name,
								result: handlerResult.result
							});
						} else {
							results.skipped.push({
								name: handlerConfig.name,
								reason: handlerResult?.reason || 'Handler returned false'
							});
						}
					} catch (e) {
						this.handleException(e, `HandlerRegistry.executeAfterSubmit.${handlerConfig.name}`);
						results.failed.push({
							name: handlerConfig.name,
							error: e.message
						});
					}
				});

				// Log summary if there were handlers
				if (results.executed.length > 0 || results.failed.length > 0) {
					this.audit('HandlerRegistry.executeAfterSubmit Summary', results);
				}

				return results;
			}

			/**
			 * Enable or disable a specific handler
			 *
			 * @param {string} handlerName - Name of the handler to toggle
			 * @param {boolean} enabled - Whether to enable or disable
			 * @param {string} entryPoint - Which entry point (beforeSubmit, beforeLoad, afterSubmit)
			 */
			setHandlerEnabled = (handlerName, enabled, entryPoint = 'beforeSubmit') => {
				const config = this.getHandlerConfig();

				let handlers;
				switch(entryPoint) {
					case 'beforeSubmit':
						handlers = config.beforeSubmitHandlers;
						break;
					case 'beforeLoad':
						handlers = config.beforeLoadHandlers;
						break;
					case 'afterSubmit':
						handlers = config.afterSubmitHandlers;
						break;
					default:
						this.error('setHandlerEnabled', `Invalid entry point: ${entryPoint}`);
						return;
				}

				const handler = handlers.find(h => h.name === handlerName);
				if (handler) {
					handler.enabled = enabled;
					this.debug('setHandlerEnabled', `Handler ${handlerName} ${enabled ? 'enabled' : 'disabled'} for ${entryPoint}`);
				} else {
					this.error('setHandlerEnabled', `Handler ${handlerName} not found in ${entryPoint}`);
				}
			}
		}

		return HandlerRegistry;
	});
