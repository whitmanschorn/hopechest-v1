import type { Locator, Page } from "@playwright/test";

/**
 * The element with this test id on the page being shown.
 *
 * After a navigation, Next keeps the page you left in the document, hidden, so
 * going back is instant. A plain `page.getByTestId()` can therefore match the
 * old page as well as the new one. Use this in any spec that moves between
 * pages sharing test ids.
 */
export function shown(page: Page, testId: string): Locator {
  return page.getByTestId(testId).filter({ visible: true });
}
