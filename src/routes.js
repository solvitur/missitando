// This is heavily inspired by https://github.com/lukeed/regexparam
export function parseRoute(route, prefix) {
	if (route instanceof RegExp) {
		return { regex: route };
	}

	let pattern = '';
	let name;

	for (const segment of route.split('/')) {
		if (!segment) continue;

		if (segment[0] === '*') {
			pattern += '/(?<wild>.*)';
		} else if (segment[0] === ':') {
			const optional = segment.indexOf('?', 1);
			const ext = segment.indexOf('.', 1);

			if (optional === -1) {
				name = segment.slice(1, ext === -1 ? segment.length : ext);
				pattern += `/(?<${name}>[^/]+?)`;
			} else {
				name = segment.slice(1, optional);
				pattern += `(?:/(?<${name}>[^/]+?))?`;
			}

			if (ext !== -1) {
				pattern += segment[ext + 1] === '('
					? `\\.(?<ext>${segment.slice(ext + 2)}`
					: `\\${segment.slice(ext)}`;
			}
		} else {
			pattern += `/${segment}`;
		}
	}

	return {
		label: route,
		regex: new RegExp(`^${pattern}${prefix ? '(?=$|/)' : '/?$'}`, 'i')
	};
}
