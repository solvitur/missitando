# Missitando

> A zero-dependency alternative to Express

Missitando is a very small, very simple alternative to Express.js. Like other
small/hobby server frameworks, the API is heavily influenced by Express so that
you could start using Missitando without having to learn anything and most
existing middleware should just work.

## Install

```
npm i @solvitur/missitando
```

## Usage

Usage is not well documented here, mostly because I don't expect a single person
to ever find and read this. So, if you do find yourself reading this, feel free
to open a GHI asking for documentation. :]

```js
import { App } from '@solvitur/missitando';
import { makeFetch } from 'supertest-fetch';

function someMiddleware(req, res, next) {
	// ...
	next();
}

const app = new App();

app.use(someMiddleware);

app.use('/foo', (req, res) => {
	res.send({
		baseUrl: req.baseUrl,
		originalUrl: req.originalUrl,
		path: req.path,
		route: req.route,
		url: req.url
	});
});

app.get('/users/:id.(json|txt)', (req, res) => {
	if (req.params.ext === 'json') {
		res.send({ id: req.params.id });
	} else {
		res.send(req.params.id);
	}
});

const fetch = makeFetch(app.listen());

await fetch('/foo/34')
	.expect(200, {
		baseUrl: '/foo',
		originalUrl: '/foo/2',
		path: '/2',
		route: '/foo',
		url: '/2'
	});
```

## Why?

Self-indulgence? I think that's the most honest answer. I wanted to use
something other than Express, preferably small/simple/fast. I also have an
aversion to dependencies. At first I was going to use tinyhttp because I liked
its pitch of no legacy code. But I had a particular use case that depended on
sub applications, and they're not fully baked yet. When I forked the code to
help, I realized how much of the internals are essentially Polka rewritten in
TypeScript. This made me sort of fall in love with Polka. I love what lukeed
does ("I write wonky ES5 code in a single file"). But my quirky use case was
similarly incompatible with Polka. I wanted to be able to rewrite the URL in
one piece of middleware such that it affected future routing. This works in
Express, but not in Polka or tinyhttp. So I figured it'd be fun to write my own,
heavily inspired by Polka, but catering to my own use cases and less focused
on the wonkier aspects of code golf.

### And the name?

I love the phrase [solvitur ambulando](https://en.wikipedia.org/wiki/Solvitur_ambulando).
Years ago, I started working on a project for fun that had to do with walking,
so I imagined calling the project Ambulando and I'd release it from an
organization named Solvitur. I never (yet?) finished that project, but I've
always had fun with that naming pattern. So "solvitur missitando" means
something like "it is solved by sending repeatedly", which felt fair for a
fast web server.

## License

ISC &copy; Schuyler Ullman
