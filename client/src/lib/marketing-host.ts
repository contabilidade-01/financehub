/**
 * Domínio de marketing x domínio do app (app.*).
 *
 * Os hosts de marketing abrem a landing na rota /; app.controledinheiro.com.br
 * continua abrindo o login. Localhost, IPs e hosts "app." são tratados como app.
 */
const APP_URL_PADRAO = "https://app.controledinheiro.com.br";

/** Host de marketing → origem do app para onde vão login e cadastro (null = app.<domínio>). */
const HOSTS_MARKETING: Record<string, string | null> = {
  "controledinheiro.com.br": null,
  "www.controledinheiro.com.br": null,
  "controle.gestaoempresa.com": APP_URL_PADRAO,
};

function hostAtual(): string {
  return window.location.hostname.toLowerCase();
}

export function isMarketingHost(): boolean {
  if (typeof window === "undefined") return false;
  return Object.prototype.hasOwnProperty.call(HOSTS_MARKETING, hostAtual());
}

/** URL do app a partir do domínio de marketing (ex.: https://app.controledinheiro.com.br). */
export function appUrl(path = "/"): string {
  const fixo = HOSTS_MARKETING[hostAtual()];
  if (fixo) return `${fixo}${path}`;
  const host = hostAtual().replace(/^www\./, "");
  return `${window.location.protocol}//app.${host}${path}`;
}

/** Navega dentro do app; no domínio de marketing, sai para o subdomínio app. */
export function goToApp(path: string, navigate: (to: string) => void): void {
  if (isMarketingHost()) window.location.href = appUrl(path);
  else navigate(path);
}
