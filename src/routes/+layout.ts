// App desktop = SPA estático (sem SSR e sem prerender, pois há rotas dinâmicas
// como /modulo/[id]). O adapter-static usa o fallback index.html.
export const ssr = false;
export const prerender = false;
