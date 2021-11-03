import http from 'node:http';
import nodePath from 'node:path';
import qs from 'node:querystring';

import { applyExtensions } from './extensions.js';
import { parseRoute } from './routes.js';

function parseUrl(req) {
	if (req.url === req._parsedUrl) {
		return;
	}

	const sep = req.url.indexOf('?');

	if (sep === -1) {
		req.path = req.url;
		req.query = {};
	} else {
		req.path = req.url.slice(0, sep);
		req.query = qs.parse(req.url.slice(sep + 1));
	}

	req._parsedUrl = req.url;
}

function ensureLeading(str) {
	return str[0] === '/' ? str : `/${str}`;
}

function onNoMatch(req, res) {
	res.status(404).send();
}

function onError(err, req, res) {
	res.status(err.code || err.status || 500);
	res.send();
}

function throwError(err) {
	throw err;
}

export class App {
	constructor(options = {}) {
		this.handlers = [];
		this.server = options.server;
		this.noMatchHandler = options.noMatchHandler ?? onNoMatch;
		this.errorHandler = (options.errorHandler ?? onError) || throwError;
		this.trustProxy = options.trustProxy;

		// Only a few of these will ever be used, but it's easy enough to add them all
		for (const method of http.METHODS) {
			const lower = method.toLowerCase();
			if (!this[lower]) {
				this[lower] = this.route.bind(this, method);
			}
		}

		this.all = this.route.bind(this, '');
	}

	listen() {
		this.server = this.server || http.createServer();
		this.server.on('request', this.handler.bind(this));
		this.server.listen(...arguments);
		return this.server;
	}

	handler(req, res, next) {
		applyExtensions(this, req, res);

		next = this.noMatchHandler ? this.noMatchHandler.bind(null, req, res) : next;
		this.runHandlers(req, res, this.handlers, next);
	}

	runHandlers(req, res, handlers, done) {
		const method = req.method === 'HEAD' ? 'GET' : req.method;
		let i = 0;
		const next = err => {
			if (err) {
				this.errorHandler(err, req, res);
			} else {
				tryNextHandler();
			}
		};

		const tryNextHandler = () => {
			if (i >= handlers.length) {
				done();
				return;
			} else if (res.handled || res.writableEnded) {
				return;
			}

			// Make sure the URL has been parsed, it may have changed since the last iteration
			parseUrl(req);

			const handler = handlers[i++];

			let matches = true;
			let matched = '/';

			if (typeof handler === 'function') {
				matched = '';
			} else if (handler.method && handler.method !== method) {
				matches = false;
			} else if (handler.regex) {
				const match = handler.regex.exec(req.path);
				if (match) {
					matches = true;
					matched = match[0];
					Object.assign(req.params, match.groups);
				} else {
					matches = false;
				}
			}

			if (matches) {
				const previousValues = {
					baseUrl: req.baseUrl,
					path: req.path,
					route: req.route,
					url: req.url
				};

				req.route = nodePath.join(req.route, handler.label || matched);

				if (handler.prefix && matched !== '/') {
					req.baseUrl = nodePath.join(req.baseUrl, matched);
					req.path = ensureLeading(req.path.slice(matched.length));
					req.url = ensureLeading(req.url.slice(matched.length));
				}

				const wrappedNext = () => {
					Object.assign(req, previousValues);
					next();
				};

				try {
					let result;

					if (typeof handler === 'function') {
						result = handler(req, res, wrappedNext);
					} else if (handler.fn) {
						result = handler.fn(req, res, wrappedNext);
					} else if (handler.fns) {
						this.runHandlers(req, res, handler.fns, wrappedNext);
					} else if (handler.app) {
						handler.app.handler(req, res, wrappedNext);
					} else {
						throw new Error('Invalid handler');
					}

					if (result instanceof Promise) {
						result.catch(next);
					}
				} catch (err) {
					next(err);
				}
			} else {
				next();
			}
		};

		tryNextHandler();
	}

	use(...args) {
		const handler = { prefix: true };
		let path = '/';
		if (typeof args[0] === 'string') {
			path = ensureLeading(args.shift());
		}

		if (path !== '/') {
			const route = parseRoute(path, true);
			handler.label = route.label;
			handler.regex = route.regex;
		}

		if (args.length !== 1) {
			handler.fns = args;
		} else if (args[0] instanceof App) {
			handler.app = args[0];
		} else if (typeof args[0] === 'function') {
			handler.fn = args[0];
		} else {
			throw new TypeError(`Invalid handler for ${path}`);
		}

		this.handlers.push(handler);

		return this;
	}

	route(method, path, ...handlers) {
		const route = parseRoute(path, false);
		const handler = {
			label: route.label,
			method,
			regex: route.regex
		};

		if (handlers.length !== 1) {
			handler.fns = handlers;
		} else if (typeof handlers[0] === 'function') {
			handler.fn = handlers[0];
		} else {
			throw new TypeError(`Invalid handler for ${method} ${path}`);
		}

		this.handlers.push(handler);

		return this;
	}
}
