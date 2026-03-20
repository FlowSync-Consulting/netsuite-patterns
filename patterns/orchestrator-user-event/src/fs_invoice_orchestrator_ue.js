/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @description Orchestrator User Event script that delegates to registered handlers.
 *              Provides clean separation of concerns and makes invoice logic maintainable.
 */
define(
	[
		'N/log',
		'./lib/fs_handler_registry'
	],
	(
		log,
		HandlerRegistry
	) => {
		/**
		 * Function definition to be triggered before load.
		 *
		 * @param {Object} scriptContext
		 * @param {Record} scriptContext.newRecord - New record
		 * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
		 * @param {Form} scriptContext.form - Current form
		 * @param {ServletRequest} scriptContext.request - HTTP request information sent from the browser for a client action only.
		 * @since 2015.2
		 */
		const beforeLoad = (scriptContext) => {
			try {
				// Initialize the handler registry inside the entry point where API modules are available
				const registry = new HandlerRegistry();
				registry.executeBeforeLoad(scriptContext);
			} catch (e) {
				// Initialize registry for error handling
				const registry = new HandlerRegistry();
				registry.handleException(e, 'beforeLoad');
				// Don't throw - we don't want to break the form load
			}
		};

		/**
		 * Function definition to be triggered before submit.
		 *
		 * @param {Object} scriptContext
		 * @param {Record} scriptContext.newRecord - New record
		 * @param {Record} scriptContext.oldRecord - Old record
		 * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
		 * @since 2015.2
		 */
		const beforeSubmit = (scriptContext) => {
			try {
				// Initialize the handler registry inside the entry point where API modules are available
				const registry = new HandlerRegistry();
				registry.executeBeforeSubmit(scriptContext);
			} catch (e) {
				// Initialize registry for error handling
				const registry = new HandlerRegistry();
				registry.handleException(e, 'beforeSubmit');
				// Don't throw - we don't want to break the save operation
			}
		};

		/**
		 * Function definition to be triggered after submit.
		 *
		 * @param {Object} scriptContext
		 * @param {Record} scriptContext.newRecord - New record
		 * @param {Record} scriptContext.oldRecord - Old record
		 * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
		 * @since 2015.2
		 */
		const afterSubmit = (scriptContext) => {
			try {
				// Initialize the handler registry inside the entry point where API modules are available
				const registry = new HandlerRegistry();
				registry.executeAfterSubmit(scriptContext);
			} catch (e) {
				// Initialize registry for error handling
				const registry = new HandlerRegistry();
				registry.handleException(e, 'afterSubmit');
				// Don't throw - afterSubmit errors shouldn't affect the user experience
			}
		};

		// Export the entry points
		return {
			beforeLoad: beforeLoad,
			beforeSubmit: beforeSubmit,
			afterSubmit: afterSubmit
		};
	});
