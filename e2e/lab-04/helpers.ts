// Lab 4 specs share the Lab 3 helpers (accounts, API sessions, fixtures, the no-horizontal-scroll check)
// so there is one place that knows how to log in and arrange a Ticket.
export {
  ACCOUNTS,
  API,
  VIEWPORTS,
  addCompletedAction,
  apiSession,
  assertNoHorizontalScroll,
  createFreshUser,
  createTicketViaApi,
  loginAs,
  patchTicket,
  stamp,
} from "../lab-03/helpers";
export type { Viewport } from "../lab-03/helpers";

import fs from "node:fs";
import path from "node:path";
import { Page } from "@playwright/test";
import { assertNoHorizontalScroll as noScroll } from "../lab-03/helpers";
import type { Viewport as Vp } from "../lab-03/helpers";

// Full-page screenshot into artifacts/lab-04/screenshots/<dir>/<viewport>-<name>.png (docs/lab-04/ui-spec.md
// section 12), taken only after asserting the page does not scroll sideways.
export async function shot(page: Page, dir: string, vp: Vp, name: string) {
  await noScroll(page);
  await page.mouse.move(1, 1); // keep a stray hover highlight out of the picture
  const folder = path.join(process.cwd(), "artifacts", "lab-04", "screenshots", dir);
  fs.mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: path.join(folder, `${vp.name}-${name}.png`), fullPage: true });
}
