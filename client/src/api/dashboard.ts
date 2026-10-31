import { apiFetch } from "./http.js";
import { TicketStatus } from "../components/ui/Badge.js";
import { Priority } from "./staffQueue.js";

// Lab 4 - Issue 83: dashboards (docs/lab-04/api-spec.md §7 and §8). The screen
// shows exactly what the server calculated; nothing here is recomputed.
export interface DashboardTicket {
  id: number;
  ticketNumber: string;
  summary: string;
  currentStatus: TicketStatus;
  itPriority: Priority;
  updatedAt: string;
}

export interface RequesterDashboard {
  generatedAt: string;
  metrics: { openTickets: number; waitingForYou: number; resolved: number; closed: number };
  attention: DashboardTicket[];
  recent: DashboardTicket[];
}

export interface StaffDashboardTicket extends DashboardTicket {
  owner: { id: number; fullName: string } | null;
}

export interface DashboardAction {
  id: number;
  ticketId: number;
  ticketNumber: string;
  description: string;
  actionAt: string;
  actionStatus: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  followUpRequired: boolean;
}

export interface StaffDashboard {
  generatedAt: string;
  role: "IT_STAFF" | "ADMINISTRATOR";
  statusCounts: { NEW: number; OPEN: number; IN_PROGRESS: number; WAITING_FOR_REQUESTER: number };
  unassigned: number;
  activeByPriority: { URGENT: number; HIGH: number; MEDIUM: number; LOW: number };
  personal: { myAssigned: number; myOpenActions: number } | null;
  urgentTickets: StaffDashboardTicket[];
  recentTickets: StaffDashboardTicket[];
  myActions: DashboardAction[] | null;
  accounts: { activeRequesters: number; activeItStaff: number; activeAdministrators: number; inactive: number } | null;
}

// 403 means the screen picked the wrong view for the role; it shows the shared Forbidden panel.
export class DashboardForbiddenError extends Error {}

async function get<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (res.status === 403) throw new DashboardForbiddenError("Forbidden");
  if (!res.ok) throw new Error("We could not load the dashboard.");
  return res.json();
}

export const fetchRequesterDashboard = () => get<RequesterDashboard>("/api/dashboard/requester");
export const fetchStaffDashboard = () => get<StaffDashboard>("/api/dashboard/staff");
