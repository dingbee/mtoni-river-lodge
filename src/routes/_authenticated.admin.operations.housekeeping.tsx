import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bell, Camera, CheckCircle2, CheckSquare2, Clock3, ImagePlus, Play, Trash2, UserRound, WandSparkles, XCircle } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { useCurrentUserRoles } from "@/lib/permissions";
import { useHousekeepingRealtime } from "@/lib/housekeeping-realtime";
import { actionIdempotencyKey, clearHousekeepingInspectionDraft, isHousekeepingOnline, loadHousekeepingInspectionDraft, saveHousekeepingInspectionDraft } from "@/lib/housekeeping-offline";
import { getHousekeepingDashboard, listHousekeepingIntelligence, listHousekeepingNotifications, markHousekeepingNotificationRead } from "@/lib/housekeeping-intelligence.functions";
import {
  assignHousekeepingTask,
  claimHousekeepingTask,
  completeHousekeepingTask,
  listHousekeepingStaff,
  listHousekeepingWork,
  listDistributionHousekeepingHandoffs,
  startHousekeepingTask,
} from "@/lib/housekeeping-execution.functions";
import {
  listHousekeepingInspectionQueue,
  submitHousekeepingInspection,
} from "@/lib/housekeeping-inspection.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  listHousekeepingExceptions,
  reportHousekeepingException,
  resolveHousekeepingException,
} from "@/lib/houseke¶»§q«^