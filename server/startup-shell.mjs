// This shell must work without any application script, stylesheet or font.
// Keep the same HTML in local builds and in localized edge documents.
import { notFoundPageCopy } from '../src/page-metadata.ts';

export const startupCopy = {
  en: ['Loading the explorer', 'Taking longer than expected? Check your connection and reload this page.', 'Reload page', 'Enable JavaScript to use the explorer, then reload this page.'],
  fr: ['Chargement de l’explorateur', 'Le chargement prend du temps ? Vérifiez votre connexion et rechargez cette page.', 'Recharger la page', 'Activez JavaScript pour utiliser l’explorateur, puis rechargez cette page.'],
  es: ['Cargando el explorador', '¿Tarda más de lo esperado? Comprueba tu conexión y recarga esta página.', 'Recargar página', 'Activa JavaScript para usar el explorador y recarga esta página.'],
  pt: ['A carregar o explorador', 'Está a demorar? Verifique a sua ligação e recarregue esta página.', 'Recarregar página', 'Ative o JavaScript para usar o explorador e recarregue esta página.'],
  zh: ['正在加载浏览器', '加载时间过长？请检查网络连接并重新加载此页面。', '重新加载页面', '请启用 JavaScript 以使用区块链浏览器，然后重新加载此页面。'],
  ja: ['エクスプローラーを読み込み中', '時間がかかっていますか？接続を確認して、このページを再読み込みしてください。', 'ページを再読み込み', 'エクスプローラーを使用するには JavaScript を有効にして、ページを再読み込みしてください。'],
  ru: ['Загрузка обозревателя', 'Загрузка затянулась? Проверьте подключение и перезагрузите страницу.', 'Перезагрузить страницу', 'Включите JavaScript для работы с обозревателем и перезагрузите страницу.'],
  ar: ['جارٍ تحميل المستكشف', 'هل يستغرق التحميل وقتًا طويلًا؟ تحقّق من اتصالك وأعد تحميل الصفحة.', 'إعادة تحميل الصفحة', 'فعّل JavaScript لاستخدام المستكشف، ثم أعد تحميل الصفحة.'],
  hi: ['एक्सप्लोरर लोड हो रहा है', 'लोड होने में समय लग रहा है? अपना कनेक्शन जाँचें और यह पेज फिर से लोड करें।', 'पेज फिर से लोड करें', 'एक्सप्लोरर इस्तेमाल करने के लिए JavaScript चालू करें, फिर यह पेज फिर से लोड करें।'],
  bn: ['এক্সপ্লোরার লোড হচ্ছে', 'লোড হতে বেশি সময় লাগছে? সংযোগ পরীক্ষা করে এই পৃষ্ঠাটি আবার লোড করুন।', 'পৃষ্ঠাটি আবার লোড করুন', 'এক্সপ্লোরার ব্যবহার করতে JavaScript চালু করুন, তারপর এই পৃষ্ঠাটি আবার লোড করুন।'],
};

const css = `
body:has(#ink-startup){margin:0}
#ink-startup{--start-bg:#fafafa;--start-text:#171717;--start-muted:#626262;--start-accent:#7132f5;--start-button:#fff;box-sizing:border-box;inline-size:100%;max-inline-size:none;margin:0;min-block-size:100vh;min-block-size:100svh;display:grid;align-content:center;justify-items:center;padding:32px 24px;background:var(--start-bg);color:var(--start-text);font:400 1rem/1.6 system-ui,sans-serif;text-align:center;overflow-wrap:anywhere}
[data-theme=dark] #ink-startup{--start-bg:#0f0f0f;--start-text:#fafafa;--start-muted:#b8b8b8;--start-accent:#9e70ff;--start-button:#0f0f0f}
@media(prefers-color-scheme:dark){html:not([data-theme=light]) #ink-startup{--start-bg:#0f0f0f;--start-text:#fafafa;--start-muted:#b8b8b8;--start-accent:#9e70ff;--start-button:#0f0f0f}}
#ink-startup .startup-brand{display:flex;align-items:center;gap:12px;font-size:1.25rem;font-weight:750;letter-spacing:-.02em}
#ink-startup .startup-brand img{inline-size:168px;block-size:54px}
[data-theme=dark] #ink-startup .startup-brand img{filter:brightness(0) invert(1)}
@media(prefers-color-scheme:dark){html:not([data-theme=light]) #ink-startup .startup-brand img{filter:brightness(0) invert(1)}}
#ink-startup :is(h1,.startup-status){margin:32px 0 0;font-size:1.25rem;line-height:1.5;font-weight:600;max-inline-size:28rem}
#ink-startup p{margin:16px 0 24px;color:var(--start-muted);max-inline-size:28rem}
#ink-startup .startup-recovery{max-inline-size:28rem}
#ink-startup a{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-block-size:48px;max-inline-size:100%;padding:12px 20px;border-radius:14px;background:var(--start-accent);color:var(--start-button);font:600 1rem/1.5 system-ui,sans-serif;text-decoration:none}
#ink-startup a:focus-visible{outline:3px solid var(--start-accent);outline-offset:5px}
#ink-startup.startup-embedded{position:fixed;inset-inline:16px;bottom:16px;z-index:10000;inline-size:calc(100% - 32px);max-inline-size:32rem;min-block-size:0;margin-inline:auto;padding:20px;border:1px solid var(--start-muted);border-radius:20px;box-shadow:0 8px 32px #00000022}
#ink-startup.startup-embedded .startup-brand,#ink-startup.startup-embedded .startup-status{display:none}
#ink-startup.startup-embedded p{margin:0 0 14px}
#ink-startup[hidden],#ink-startup .startup-recovery[hidden]{display:none}
#ink-startup > .startup-copy{display:contents}
:is([data-startup-failed],[data-startup-delayed]) #ink-startup.startup-embedded[hidden]{display:grid}
:is([data-startup-failed],[data-startup-delayed]) #ink-startup .startup-recovery[hidden]{display:block}
#root[data-startup-ready] #ink-startup{display:none}
`;
const escape = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function startupShell(language = 'en', initialContent = '') {
  const [loading, help, reload, noScript] = (startupCopy[language] || startupCopy.en).map(escape);
  const tag = initialContent ? 'aside' : 'main';
  const heading=initialContent?`<p class="startup-status" role="status">${loading}</p>`:`<h1 role="status">${loading}</h1>`;
  // Google supports data-nosnippet on div, span and section. Keep the main/aside
  // landmarks, and scope the supported wrapper to recovery copy only.
  return `<!-- ink-startup:start -->${initialContent}<style>${css}</style><${tag} id="ink-startup"${initialContent ? ' class="startup-embedded" hidden' : ''}><div class="startup-copy" data-nosnippet><div class="startup-brand"><img src="/brand/block-lens/wordmark.svg" width="168" height="54" alt="Ink Explorer" /></div>${heading}<div class="startup-recovery" hidden><p>${help}</p><a id="ink-startup-reload" href="">${reload}</a></div><noscript><style>#ink-startup :is(h1,.startup-status),#ink-startup .startup-recovery{display:none}#ink-startup.startup-embedded[hidden]{display:grid;position:static;inline-size:calc(100% - 32px);margin:16px auto}.header-search-field{display:block!important}.mobile-search-trigger{display:none!important}</style><p>${noScript}</p></noscript></div></${tag}><!-- ink-startup:end -->`;
}

function notFoundShell(language, basePath) {
  const [heading, description, returnHome] = notFoundPageCopy(language).map(escape);
  const home = `${basePath}/${language === 'en' ? '' : '?lang=' + encodeURIComponent(language)}`;
  return `<!-- ink-startup:start --><style>${css}</style><main id="ink-startup" aria-labelledby="ink-not-found-title"><div class="startup-brand"><img src="/brand/block-lens/wordmark.svg" width="168" height="54" alt="Ink Explorer" /></div><h1 id="ink-not-found-title">${heading}</h1><p>${description}</p><a href="${escape(home)}">${returnHome}</a></main><!-- ink-startup:end -->`;
}

export function replaceStartupShell(html, language = 'en', initialContent = '', { notFound = false, basePath = '' } = {}) {
  return html.replace(/<!-- ink-startup:start -->[\s\S]*?<!-- ink-startup:end -->/, () => notFound ? notFoundShell(language, basePath) : startupShell(language, initialContent));
}
