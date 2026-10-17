// author-profile: renders every [data-about-card] from about.json (data-src) in the page language,
// <html lang="es"> or English otherwise, and again whenever that attribute changes. Without
// JavaScript, or if the fetch fails, the static HTML inside the card stays as it is.
(() => {
	const ICONS = {
		github:
			'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.24c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.04 1.77 2.72 1.26 3.38.96.1-.75.4-1.26.74-1.55-2.57-.29-5.27-1.29-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18A10.98 10.98 0 0 1 12 6.09c.98 0 1.94.13 2.85.38 2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.4-2.71 5.38-5.29 5.67.42.36.79 1.07.79 2.16v3.29c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z"/></svg>',
		linkedin:
			'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.34 7.72H1.15V21h4.19V7.72ZM3.25 1a2.43 2.43 0 1 0 0 4.86 2.43 2.43 0 0 0 0-4.86ZM21.85 13.39c0-4-2.14-5.86-5-5.86a4.31 4.31 0 0 0-3.91 2.15V7.72H8.75V21h4.19v-6.58c0-1.74.33-3.42 2.48-3.42 2.12 0 2.15 1.98 2.15 3.53V21h4.28v-7.61Z"/></svg>',
		kofi: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h13v10a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V5Zm13 2v6h1a3 3 0 0 0 0-6h-1ZM8.1 9.1c-1.8 0-2.2 2.3-.8 3.3l3.2 2.3 3.2-2.3c1.4-1 .9-3.3-.8-3.3-1 0-1.6.7-2.4 1.4-.8-.7-1.4-1.4-2.4-1.4Z"/></svg>'
	};
	const CREATOR = { en: 'Creator', es: 'Creador' };

	const language = () =>
		document.documentElement.lang.toLowerCase().startsWith('es') ? 'es' : 'en';

	function element(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	}

	function render(card, data) {
		const lang = language();
		const facts = element('ul', 'about-facts');
		for (const fact of data.facts[lang]) facts.append(element('li', '', fact));
		const links = element('div', 'about-links');
		for (const item of data.links) {
			const link = element('a', '', item.label);
			link.href = item.url;
			link.target = '_blank';
			link.rel = 'noreferrer';
			link.insertAdjacentHTML('afterbegin', ICONS[item.icon] ?? '');
			links.append(link);
		}
		card
			.querySelector('.about-content')
			.replaceChildren(
				element('p', 'about-kicker', CREATOR[lang]),
				element('h3', '', data.name),
				element('p', 'about-bio', data.bio[lang]),
				facts,
				links
			);
		card.querySelector('.about-photo').alt = data.name;
	}

	async function init(card) {
		try {
			const response = await fetch(card.dataset.src || 'about.json', { cache: 'no-cache' });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const data = await response.json();
			render(card, data);
			new MutationObserver(() => render(card, data)).observe(document.documentElement, {
				attributes: true,
				attributeFilter: ['lang']
			});
		} catch (error) {
			console.error('about card: keeping the static profile', error);
		}
	}

	document.querySelectorAll('[data-about-card]').forEach(init);
})();
