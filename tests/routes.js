import test from 'ava';

import { parseRoute } from '../src/routes.js';

test('static, non-prefix', t => {
	const handler = parseRoute('/foo', false);

	t.is(handler.label, '/foo');

	t.truthy(handler.regex.exec('/foo'));
	t.truthy(handler.regex.exec('/foo/'));
	t.falsy(handler.regex.exec('/foo/bar'));
});

test('static, prefix', t => {
	const handler = parseRoute('/foo', true);

	t.is(handler.label, '/foo');

	t.truthy(handler.regex.exec('/foo'));
	t.truthy(handler.regex.exec('/foo/'));
	t.truthy(handler.regex.exec('/foo/bar'));
	t.falsy(handler.regex.exec('/foot'));
});

test('named parameters', t => {
	let handler = parseRoute('/users/:id', false);

	t.is(handler.label, '/users/:id');

	let match = handler.regex.exec('/users/');
	t.falsy(match);

	match = handler.regex.exec('/users/34');
	t.truthy(match);
	t.like(match.groups, { id: '34' });

	match = handler.regex.exec('/users/test@solvitur.dev/');
	t.truthy(match);
	t.like(match.groups, { id: 'test@solvitur.dev' });

	handler = parseRoute('/:grandparent/:parent/:child', false);
	match = handler.regex.exec('/foo/bar/baz');
	t.truthy(match);
	t.like(match.groups, { grandparent: 'foo', parent: 'bar', child: 'baz' });
});

test('extensions', t => {
	let handler = parseRoute('/users/:id.json', false);

	let match = handler.regex.exec('/users/34.xml');
	t.falsy(match);

	match = handler.regex.exec('/users/34.json');
	t.truthy(match);
	t.like(match.groups, { id: '34' });

	handler = parseRoute('/users/:id.(json|xml)', false);
	match = handler.regex.exec('/users/34.xml');
	t.truthy(match);
	t.like(match.groups, { id: '34', ext: 'xml' });
});

test('wildcards', t => {
	let handler = parseRoute('*', false);

	let match = handler.regex.exec('/foo/bar/baz');
	t.truthy(match);
	t.like(match.groups, { wild: 'foo/bar/baz' });

	handler = parseRoute('/users/:id/*', false);
	match = handler.regex.exec('/users/34/foo/bar');
	t.truthy(match);
	t.like(match.groups, { id: '34', wild: 'foo/bar' });
});

test('optional parameters', t => {
	const handler = parseRoute('/:grandparent/:parent?/:child?', false);
	let match = handler.regex.exec('/foo/bar/baz');
	t.truthy(match);
	t.like(match.groups, { grandparent: 'foo', parent: 'bar', child: 'baz' });

	match = handler.regex.exec('/foo/bar');
	t.like(match.groups, { grandparent: 'foo', parent: 'bar' });

	match = handler.regex.exec('/foo/');
	t.like(match.groups, { grandparent: 'foo' });
});

test('custom regex', t => {
	const handler = parseRoute(/\/foo\/(?<param>bar|baz)\/.*/);

	t.falsy(handler.label);

	const match = handler.regex.exec('/foo/bar/baz');
	t.truthy(match);
	t.like(match.groups, { param: 'bar' });
});
