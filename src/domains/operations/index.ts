/**
 * Operations domain façade. Consumers should import from here rather than
 * reaching into src/lib/* directly; that keeps the DDD boundary intact.
 */
export {
  getOpsDashboard,
  getRoomBoard,
  updateRoomState,
  getReservationWorkspace,
  checkInBooking,
  checkOutBooking,
  getOpsCalendar,
  refreshOpsAlerts,
  listOpsAlerts,
  resolveOpsAlert,
  getOpsTimeline,
} from "@/lib/operations.functions";

export {
  listOpsTasks,
  createOpsTask,
  updateOpsTask,
  completeOpsTask,
} from "@/lib/operations-tasks.functions";

export { RoomStateChip, ROOM_STATES } from "@/components/os/operations/RoomStateChip";
export type { RoomStateValue } from "@/components/os/operations/RoomStateChip";