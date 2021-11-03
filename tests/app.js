import fs from 'node:fs';

import test from 'ava';
import { makeFetch } from 'supertest-fetch';

import { App } from '@solvitur/missitando';

function startApp(app) {
	const server = app.listen();
	return makeFetch(server);
}

function reqInfoHandler(req, res) {
	res.send({
		baseUrl: req.baseUrl,
		originalUrl: req.originalUrl,
		path: req.path,
		route: req.route,
		url: req.url
	});
}

test('simple route', async t => {
	const app = new App();

	app.get('/users/:id', reqInfoHandler);

	const fetch = startApp(app);

	await fetch('/users/34')
		.expect(200, {
			baseUrl: '/',
			originalUrl: '/users/34',
			path: '/users/34',
			route: '/users/:id',
			url: '/users/34'
		});

	t.pass();
});

test('simple middleware', async t => {
	const app = new App();

	app.use(reqInfoHandler);

	const fetch = startApp(app);

	await fetch('/users/34')
		.expect(200, {
			baseUrl: '/',
			originalUrl: '/users/34',
			path: '/users/34',
			route: '/',
			url: '/users/34'
		});

	t.pass();
});

test('middleware handler', async t => {
	const app = new App();

	app.use('/users', reqInfoHandler);

	const fetch = startApp(app);

	await fetch('/users/34')
		.expect(200, {
			baseUrl: '/users',
			originalUrl: '/users/34',
			path: '/34',
			route: '/users',
			url: '/34'
		});

	t.pass();
});

test('handler chains', async t => {
	const app = new App();

	// Middleware and route handlers are essentially the same. If next is called,
	// the next handler is invoked. If not, it's skipped. That's true for all
	// three of these functions even though semantically some are middleware and
	// not route handlers.

	t.plan(6);

	const makeHandler = allowedCalls => (req, res, next) => {
		if (allowedCalls > 0) {
			allowedCalls--;
			t.pass();
			next();
		} else if (allowedCalls === 0) {
			const err = new Error('Forcing 404');
			err.code = 404;
			throw err;
		} else {
			t.fail();
		}
	};

	app.get('/foo', makeHandler(3), makeHandler(2));
	app.use('/foo', makeHandler(1));

	const fetch = startApp(app);

	await fetch('/foo').expect(404);
	await fetch('/foo').expect(404);
	await fetch('/foo').expect(404);
});

test('sub app', async t => {
	const app = new App();
	const subApp = new App();

	app.use('/users', subApp);

	subApp.get('/:id', reqInfoHandler);

	const fetch = startApp(app);

	await fetch('/users/34')
		.expect(200, {
			baseUrl: '/users',
			originalUrl: '/users/34',
			path: '/34',
			route: '/users/:id',
			url: '/34'
		});

	t.pass();
});

test('sub app fall through', async t => {
	const app = new App();
	const subApp = new App({ noMatchHandler: false });

	app.use('/foo', subApp);
	app.get('/foo/baz', reqInfoHandler);

	subApp.get('/bar', reqInfoHandler);

	const fetch = startApp(app);

	await fetch('/foo/bar')
		.expect(200, {
			baseUrl: '/foo',
			originalUrl: '/foo/bar',
			path: '/bar',
			route: '/foo/bar',
			url: '/bar'
		});

	await fetch('/foo/baz')
		.expect(200, {
			baseUrl: '/',
			originalUrl: '/foo/baz',
			path: '/foo/baz',
			route: '/foo/baz',
			url: '/foo/baz'
		});

	t.pass();
});

test('unhandled route', async t => {
	const app = new App();

	app.get('/users', reqInfoHandler);

	const fetch = startApp(app);

	await fetch('/users/34')
		.expect(404);

	t.pass();
});

test('piped JSON', async t => {
	const app = new App();

	app.get('/json', (req, res) => {
		res.setHeader('content-type', 'application/json');
		fs.createReadStream('package.json').pipe(res);
	});

	const fetch = startApp(app);

	const response = await fetch('/json').expect(200).json();
	t.like(response, { name: '@solvitur/missitando' });
});

test('future handlers are skipped if response in progress', async t => {
	const app = new App();

	app.get('/json', (req, res, next) => {
		res.setHeader('content-type', 'application/json');
		fs.createReadStream('package.json').pipe(res);
		next();
	});

	app.get('/json', (req, res) => {
		t.fail();
		res.send({});
	});

	const fetch = startApp(app);

	const response = await fetch('/json').expect(200).json();
	t.like(response, { name: '@solvitur/missitando' });
});

test('default error handler', async t => {
	const app = new App();

	app.use(() => {
		throw new Error('Test error');
	});

	const fetch = startApp(app);

	await fetch('/foo').expect(500);

	t.pass();
});

test('default error handler, async', async t => {
	const app = new App();

	app.use(async () => {
		throw new Error('Test error');
	});

	const fetch = startApp(app);

	await fetch('/foo').expect(500);

	t.pass();
});

test('error in async middleware chain', async t => {
	t.plan(2);

	const app = new App();

	const noop = async (req, res, next) => {
		t.pass();
		next();
	};

	const error = async () => {
		t.pass();
		throw new Error('Test error');
	};

	app.use(noop, error);

	const fetch = startApp(app);

	await fetch('/foo').expect(500);
});

test('sub app errors bubble up', async t => {
	t.plan(2);

	const onError = (err, req, res) => {
		t.pass();
		res.status(503).send();
	};

	const throwError = () => {
		t.pass();
		throw new Error('Test error');
	};

	const app = new App({ errorHandler: onError });
	const subApp = new App({ errorHandler: false });

	app.use('/foo', subApp);
	subApp.get('/bar', throwError, reqInfoHandler);

	const fetch = startApp(app);

	await fetch('/foo/bar')
		.expect(503);
});

test('network extensions', async t => {
	const app = new App({ trustProxy: false });

	app.get('/ext', (req, res) => {
		res.send({
			host: req.host,
			hostname: req.hostname,
			ip: req.ip,
			protocol: req.protocol,
			secure: req.secure
		});
	});

	const fetch = startApp(app);

	const headers = {
		Host: 'internal.app:8888',
		'X-Forwarded-Host': 'solvitur.dev',
		'X-Forwarded-Proto': 'https',
		'X-Forwarded-For': '1.2.3.4, 10.0.0.10'
	};

	const response = await fetch('/ext', { headers }).expect(200).json();
	t.like(response, {
		host: 'internal.app:8888',
		hostname: 'internal.app',
		ip: '127.0.0.1',
		protocol: 'http',
		secure: false
	});
});

test('network extensions, trust proxy', async t => {
	const app = new App();

	app.get('/ext', (req, res) => {
		res.send({
			host: req.host,
			hostname: req.hostname,
			ip: req.ip,
			protocol: req.protocol,
			secure: req.secure
		});
	});

	const fetch = startApp(app);

	const headers = {
		Host: 'internal.app:8888',
		'X-Forwarded-Host': 'solvitur.dev',
		'X-Forwarded-Proto': 'https',
		'X-Forwarded-For': '1.2.3.4, 10.0.0.10'
	};

	const response = await fetch('/ext', { headers }).expect(200).json();
	t.like(response, {
		host: 'solvitur.dev',
		hostname: 'solvitur.dev',
		ip: '1.2.3.4',
		protocol: 'https',
		secure: true
	});
});
