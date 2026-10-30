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
