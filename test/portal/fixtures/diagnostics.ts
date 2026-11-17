import { expect, type Page } from '@playwright/test';

export type PageDiagnostics = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  failedResponses: string[];
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

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    if (isMonitoredOrigin(request.url())) {
      const url = new URL(request.url());
      failedRequests.push(
        `${request.method()} ${url.origin}${url.pathname}: ${request.failure()?.errorText}`,
      );
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && isMonitoredOrigin(response.url())) {
      const url = new URL(response.url());
      failedResponses.push(
        `${response.status()} ${response.request().method()} ${url.origin}${url.pathname}`,
      );
    }
  });

  return {
    consoleErrors,
    pageErrors,
    failedRequests,
    failedResponses,
    async assertHealthy() {
      expect(pageErrors, 'browser runtime errors').toEqual([]);
      expect(consoleErrors, 'browser console errors').toEqual([]);
      expect(failedRequests, 'failed portal or Sadhana API requests').toEqual([]);
      expect(failedResponses, 'portal or Sadhana API responses with status 400+').toEqual([]);
    },
  };
}
