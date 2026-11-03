/**
 * Domínio de marketing (apex/www) x domínio do app (app.*).
 *
 * tudocontado.com.br (e www.) abre a landing; app.tudocontado.com.br abre o login.
 * O domínio antigo (controledinheiro.com.br) segue reconhecido. Localhost, IPs e hosts "app." são tratados como app.
 */
const HOSTS_MARKETING = [
  "tudocontado.com.br",
  "www.tudocontado.com.br",
  "controledinheiro.com.br",
  "www.controledinheiro.com.br",
];

export function isMarketingHost(): boolean {
  if (typeof window === "undefined") return false;
  return HOSTS_MARKETING.includes(window.location.hostname.toLowerCase());
}

/** URL do app a partir do domínio de marketing (ex.: https://app.tudocontado.com.br). */
export function appUrl(path = "/"): string {
  const host = window.location.hostname.toLowerCase().replace(/^www\./, "");
  return `${window.location.protocol}//app.${host}${path}`;
}

/** Navega dentro do app; no domínio de marketing, sai para o subdomínio app. */
export function goToApp(path: string, navigate: (to: string) => void): void {
  if (isMarketingHost()) window.location.href = appUrl(path);
  else navigate(path);
}
