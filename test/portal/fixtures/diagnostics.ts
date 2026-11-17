import { expect, type Page } from '@playwright/test';

export type PageDiagnostics = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  failedResponses: string[];
  productionApiRequests: string[];
  mutationRequests: string[];
  assertHealthy: () => Promise<void>;
};

export function collectDiagnostics(page: Page, baseURL: string): PageDiagnostics {
  const portalOrigin = new URL(baseURL).origin;
  const isMonitoredOrigin = (rawURL: string) => {
    const url = new URL(rawURL);
    const isSadhanaApi =
      url.hostname.endsWith('.execute-api.us-east-1.amazonaws.com') &&
      /\/(?:dev|prod)\/api(?:\/|$)/.test(url.pathname);
    return url.origin === portalOrigin || isSadhanaApi;
  };
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const failedResponses: string[] = [];
  const productionApiRequests: string[] = [];
  const mutationRequests: string[] = [];
  const safeURL = (rawURL: string) => {
    const url = new URL(rawURL);
    const path = url.pathname.replace(/\/(?:per_)?[0-9a-f-]{24,}(?=\/|$)/gi, '/[id]');
    return `${url.origin}${path}`;
  };

  const apiRequestStage = (rawURL: string) => {
    const url = new URL(rawURL);
    if (
      url.hostname.endsWith('.execute-api.us-east-1.amazonaws.com') &&
      /^\/(dev|prod)\/api(?:\/|$)/.test(url.pathname)
    ) {
      return url.pathname.match(/^\/(dev|prod)\/api/)?.[1];
    }
    return undefined;
  };

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    if (isMonitoredOrigin(request.url())) {
      failedRequests.push(
        `${request.method()} ${safeURL(request.url())}: ${request.failure()?.errorText}`,
      );
    }
  });
  page.on('request', (request) => {
    const stage = apiRequestStage(request.url());
    if (!stage) return;
    const safePath = safeURL(request.url());
    if (stage !== 'dev') productionApiRequests.push(`${request.method()} ${safePath}`);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      mutationRequests.push(`${request.method()} ${safePath}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && isMonitoredOrigin(response.url())) {
      failedResponses.push(
        `${response.status()} ${response.request().method()} ${safeURL(response.url())}`,
      );
    }
  });

  return {
    consoleErrors,
    pageErrors,
    failedRequests,
    failedResponses,
    productionApiRequests,
    mutationRequests,
    async assertHealthy() {
      expect(pageErrors, 'browser runtime errors').toEqual([]);
      expect(consoleErrors, 'browser console errors').toEqual([]);
      expect(failedRequests, 'failed portal or Sadhana API requests').toEqual([]);
      expect(failedResponses, 'portal or Sadhana API responses with status 400+').toEqual([]);
      expect(productionApiRequests, 'dev portal must never call the production API stage').toEqual(
        [],
      );
      expect(mutationRequests, 'read-only live suite must not mutate dev records').toEqual([]);
    },
  };
}
