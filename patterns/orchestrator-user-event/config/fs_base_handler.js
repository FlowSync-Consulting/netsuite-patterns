/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description Base handler class with error handling, logging, and lazy module loading.
 *              All handlers should extend this class.
 */
define(['N/log', 'N/error', 'require'], (log, error, require) => {

	/**
	 * @class BaseHandler
	 * @description Base class for all handlers with error handling and logging capabilities
	 */
	class BaseHandler {
		constructor() {
			// Initialize common field IDs
			this.ITEM_SUBLIST_ID = 'item';
			this.LINE_ITEM_FIELD_ID = 'item';
			this.LINE_AMOUNT_FIELD_ID = 'amount';
			this.LINE_RATE_FIELD_ID = 'rate';
			this.LINE_QUANTITY_FIELD_ID = 'quantity';

			// Initialize script parameter IDs
			this.SURCHARGE_ITEM_PARAM_ID = 'custscript_fs_surcharge_item';

			// Initialize custom field IDs
			this.SURCHARGE_PERCENTAGE_FIELD_ID = 'custitem_fs_surcharge_percentage';
			this.CUSTOMER_SURCHARGE_FIELD_ID = 'custentity_fs_add_surcharge';

			// Initialize approval status constants
			this.APPROVAL_STATUS_FIELD_ID = 'approvalstatus';
			this.PENDING_APPROVAL_STATUS = '1'; // NetSuite's value for Pending Approval
		}

		/**
		 * Parse any error (SuiteScript or native) into a structured object
		 *
		 * @param {Error|Object} e - The raw error
		 * @param {string} [context] - Optional context (e.g., function or module name)
		 * @returns {Object}
		 */
		parseError = (e, context = '') => {
			let msg = '';
			let name = `UNEXPECTED_ERROR`;

			if (e instanceof error.create.constructor || e.type === 'error.SuiteScriptError') {
				name = e.name || `SUITESCRIPT_ERROR`;
				msg = (typeof e.message === 'string' ? e.message : (typeof e.message === 'object' && e.message.hasOwnProperty('message') ? e.message.message : ''));
			} else if (e instanceof Error) {
				name = `${e.name}`;
				msg = e.message;
			} else if (typeof e === 'string') {
				msg = e;
			} else {
				msg = JSON.stringify(e);
			}

			return {
				name,
				message: msg,
				context,
				stack: (e && e.stack) || '',
				timestamp: new Date().toISOString()
			};
		};

		/**
		 * Log a normalized error to the NetSuite script log
		 *
		 * @param {Object} parsedError - From parseError()
		 */
		logError = (parsedError) => {
			this.error(
				`${parsedError.name} ${parsedError.context ? `@ ${parsedError.context}` : ''}`,
				parsedError.message + (parsedError.stack ? `\nStack:\n${parsedError.stack}` : '')
			);
		};

		/**
		 * Full error handler to normalize + log
		 *
		 * @param {Error|Object|string} rawError
		 * @param {string} context - Optional context (e.g., function or module name)
		 * @returns {Object} Parsed error (for re-use or saving)
		 */
		handleException = (rawError, context = '') => {
			const parsed = this.parseError(rawError, context);
			this.logError(parsed);
			return parsed;
		};

		/**
		 * Shorthand for logging @ debug
		 *
		 * @param {string} title - The title of the message
		 * @param {*} details - The details of the message
		 */
		debug = (title, details) => log.debug({title, details});

		/**
		 * Shorthand for logging @ audit
		 *
		 * @param {string} title - The title of the message
		 * @param {*} details - The details of the message
		 */
		audit = (title, details) => log.audit({title, details});

		/**
		 * Shorthand for logging @ error
		 *
		 * @param {string} title - The title of the message
		 * @param {*} details - The details of the message
		 */
		error = (title, details) => log.error({title, details});

		/**
		 * Shorthand for logging @ emergency
		 *
		 * @param {string} title - The title of the message
		 * @param {*} details - The details of the message
		 */
		emergency = (title, details) => log.emergency({title, details});

		/**
		 * Safely execute a function with error handling
		 *
		 * @param {string} methodName - The name of the method being executed (used for logging)
		 * @param {Function} func - The function to execute
		 * @param {...any} args - Optional arguments or context to pass into error logging
		 * @returns {any} The return value of the function, or undefined if an error occurs
		 */
		wrapExecution = (methodName, func, ...args) => {
			try {
				return func();
			} catch (e) {
				this.error(`${methodName}: error inputs`, this.formatArgsForLogging(...args));
				this.handleException(e, methodName);
				return undefined;
			}
		}

		/**
		 * Wrap execution that returns a boolean to indicate success or failure
		 *
		 * @param {string} methodName
		 * @param {function} func
		 * @param {...any} args
		 * @returns {boolean}
		 */
		wrapExecutionWithBooleanReturn(methodName, func, ...args) {
			try {
				func();
				return true;
			} catch (e) {
				this.error(`${methodName}: error inputs`, this.formatArgsForLogging(...args));
				this.handleException(e, methodName);
				return false;
			}
		}

		/**
		 * Format arguments for structured logging
		 *
		 * @param {...any} args - The arguments to format
		 * @returns {Array<{ type: string, value: any }>} - List of formatted argument details
		 */
		formatArgsForLogging = (...args) => {
			return args.map((arg, index) => {
				let formatted;

				try {
					formatted = typeof arg === 'object'
						? JSON.parse(JSON.stringify(arg)) // Safe deep copy for objects
						: arg;
				} catch {
					formatted = '[Unserializable Argument]';
				}

				return {
					arg: `arg${index + 1}`,
					type: typeof arg,
					value: formatted
				};
			});
		};

		/**
		 * Lazy-load a module
		 *
		 * @param {string} modulePath - The path to the module
		 * @returns {any|null} The required module or null if an error occurs
		 */
		loadModule = (modulePath) => {
			let module = null;
			require([modulePath], (Module) => {
				try {
					module = Module;
				} catch (e) {
					this.error(`loadModule: error inputs`, { modulePath, typeof: typeof modulePath });
					this.handleException(e, `loadModule`);
				}
			});
			return module;
		};

		/**
		 * Get the surcharge item ID from the script deployment parameter
		 *
		 * @returns {string|null} The surcharge item ID from deployment parameters, or null if not configured
		 */
		getSurchargeItemId = () => {
			try {
				const runtime = this.loadModule('N/runtime');
				if (!runtime) {
					this.error('getSurchargeItemId', 'Failed to load runtime module');
					return null;
				}

				const scriptObj = runtime.getCurrentScript();
				const surchargeItemId = scriptObj.getParameter({
					name: this.SURCHARGE_ITEM_PARAM_ID
				});
				return surchargeItemId || null;
			} catch (e) {
				this.handleException(e, 'getSurchargeItemId');
				return null;
			}
		};

		/**
		 * Get the surcharge percentage from the Item record
		 *
		 * @param {string} itemId - The internal ID of the surcharge item
		 * @returns {number} The surcharge percentage (e.g., 0.02 for 2%)
		 */
		getSurchargePercentage = (itemId) => {
			if (!itemId) return 0;

			try {
				const search = this.loadModule('N/search');
				if (!search) {
					this.error('getSurchargePercentage', 'Failed to load search module');
					return 0;
				}

				const itemFields = search.lookupFields({
					type: search.Type.ITEM,
					id: itemId,
					columns: [this.SURCHARGE_PERCENTAGE_FIELD_ID]
				});

				// Check custom field for percentage
				if (itemFields[this.SURCHARGE_PERCENTAGE_FIELD_ID]) {
					const percentage = parseFloat(itemFields[this.SURCHARGE_PERCENTAGE_FIELD_ID]);
					// If percentage is stored as whole number (e.g., 2 for 2%), divide by 100
					// If it's already decimal (e.g., 0.02), use as is
					return percentage > 1 ? percentage / 100 : percentage;
				}

				// No default percentage - return 0 if not found
				this.audit('getSurchargePercentage', 'No surcharge percentage found for item');
				return 0;
			} catch (e) {
				this.handleException(e, 'getSurchargePercentage');
				return 0;
			}
		};
	}

	return BaseHandler;
});
