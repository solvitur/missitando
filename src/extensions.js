import buffer from 'node:buffer';
import crypto from 'node:crypto';
import http from 'node:http';

const { Buffer } = buffer;

const ID_LENGTH = 5;

const CONTENT_LENGTH = 'content-length';
const CONTENT_TYPE = 'content-type';
const LOCATION = 'location';

const TYPES = {
	html: 'text/html',
	json: 'application/json',
	text: 'text/plain',
	txt: 'text/plain',
	xml: 'application/xml'
};

function redirect(status, path) {
	if (!path) {
		path = status;
		status = 302;
	}

	this.statusCode = status;
	this.setHeader(LOCATION, path);
	this.end();

	return this;
}

function json(obj) {
	this.type('json').send(JSON.stringify(obj));

	return this;
}

function status(code) {
	this.statusCode = code;

	return this;
}

function type(identifier) {
	if (identifier.includes('/')) {
		this.setHeader(CONTENT_TYPE, identifier);
	} else if (TYPES[identifier]) {
		this.setHeader(CONTENT_TYPE, TYPES[identifier]);
	} else {
		throw new Error(`No Content-Type defined for '${identifier}'`);
	}

	return this;
}

function send(data) {
	data = data ?? http.STATUS_CODES[this.statusCode];
	let type = this.getHeader(CONTENT_TYPE);

	// If it looks like a stream, just pipe it without setting content length
	if (data && typeof data.pipe === 'function') {
		if (!type) {
			this.setHeader(CONTENT_TYPE, 'application/octet-stream');
		}

		data.pipe(this);
		return this;
	}

	if (Buffer.isBuffer(data)) {
		type = type || 'application/octet-stream';
	} else if (typeof data === 'object') {
		data = JSON.stringify(data);
		type = type || 'application/json';
	} else {
		type = type || 'text/plain';
	}

	this.setHeader(CONTENT_LENGTH, Buffer.byteLength(data));
	this.setHeader(CONTENT_TYPE, type);
	this.end(data);

	return this;
}

function processIp(ip) {
	if (ip === '::1') return '127.0.0.1';

	return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function isLocalIp(ip) {
	if (ip === '127.0.0.1') return true;

	const octets = ip.split('.').slice(0, 2).map(Number);
	return octets[0] === 10
		|| (octets[0] === 192 && octets[1] === 168)
		|| (octets[0] === 172 && (octets[1] >= 16 && octets[1] <= 31));
}

export function applyExtensions(app, req, res) {
	if (req.id) {
		return;
	}

	const reqExtensions = {
		baseUrl: '/',
		id: crypto.randomInt(36 ** ID_LENGTH).toString(36),
		originalUrl: req.url,
		params: {},
		route: '/'
	};

	const socketIp = processIp(req.socket.localAddress);
	const trustProxy = app.trustProxy ?? isLocalIp(socketIp);

	reqExtensions.host = (trustProxy && req.headers['x-forwarded-host']) || req.headers.host;
	reqExtensions.hostname = reqExtensions.host.split(':')[0];
	reqExtensions.protocol = (trustProxy && req.headers['x-forwarded-proto']) || (req.socket.encrypted ? 'https' : 'http');
	reqExtensions.secure = reqExtensions.protocol === 'https';

	if (trustProxy && req.headers['x-forwarded-for']) {
		reqExtensions.ips = req.headers['x-forwarded-for'].split(/,\w*/).map(processIp);
		reqExtensions.ips.push(socketIp);
	} else {
		reqExtensions.ips = [socketIp];
	}

	reqExtensions.ip = reqExtensions.ips[0];

	const resExtensions = {
		json,
		redirect,
		send,
		status,
		type
	};

	Object.assign(req, reqExtensions);
	Object.assign(res, resExtensions);

	res.on('pipe', () => {
		res.handled = true;
	});
}
