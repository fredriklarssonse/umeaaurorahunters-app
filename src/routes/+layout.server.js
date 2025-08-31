// src/routes/+layout.server.js
/** @type {import('./$types').LayoutServerLoad} */
export async function load({ fetch, url, cookies, request }) {
  const SUP_LANGS = ['sv', 'en'];

  const pickFromAccept = (hdr) => {
    if (!hdr) return null;
    const order = hdr
      .split(',')
      .map((part) => {
        const [tag, q] = part.trim().split(';q=');
        const lang = tag.toLowerCase().slice(0, 2);
        const weight = q ? parseFloat(q) : 1;
        return { lang, weight };
      })
      .sort((a, b) => b.weight - a.weight)
      .map((x) => x.lang);
    return order.find((l) => SUP_LANGS.includes(l)) || null;
  };

  const queryLang = url.searchParams.get('lang');
  const cookieLang = cookies.get('lang');
  const acceptLang = pickFromAccept(request.headers.get('accept-language'));

  let lang = queryLang && SUP_LANGS.includes(queryLang)
    ? queryLang
    : cookieLang && SUP_LANGS.includes(cookieLang)
    ? cookieLang
    : acceptLang || 'sv';

  // ladda dict från public/locales/<lang>.json
  const resp = await fetch(`/locales/${lang}.json`);
  const dict = resp.ok ? await resp.json() : {};

  // skriv cookie om den saknas eller ändrats
  if (cookieLang !== lang) {
    cookies.set('lang', lang, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax'
    });
  }

  return { lang, dict };
}
