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
	if (!path && typeof status === 'number') {
		path = status;
		status = 301;
	}

	this.statusCode = status;
	// TODO: Convert to absolute URL?
	this.setHeader(LOCATION, path);

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

export function applyExtensions(req, res) {
	if (req.id) {
		return;
	}

	req.baseUrl = '/';
	req.id = crypto.randomInt(36 ** ID_LENGTH).toString(36);
	req.originalUrl = req.url;
	req.params = {};
	req.route = '/';

	res.redirect = redirect;
	res.json = json;
	res.status = status;
	res.type = type;
	res.send = send;

	res.on('pipe', () => {
		res.handled = true;
	});
}

/*
IP from req.socket?
const ip = req.socket.localAddress;
const port = req.socket.localPort;

But also x-forwarded-for header
*/
