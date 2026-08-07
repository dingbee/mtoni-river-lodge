/**
 * Intelligence Core — public surface.
 *
 * Browser-safe exports only (contracts, permissions, registry, and the
 * server-function clients). Server implementations stay behind *.server.ts.
 */
export * from "./core/contracts";
export * from "./core/permissions";
export * from "./core/registry";

export { recordIntelligenceEvent, listIntelligenceEvents } from "./events/events.functions";
export {
  recordIntelligenceSignal,
  listIntelligenceSignals,
  recordIntelligenceInsight,
  listIntelligenceInsights,
  decideIntelligenceInsight,
} from "./reasoning/reasoning.functions";
export {
  recordIntelligenceRecommendation,
  listIntelligenceRecommendations,
  decideIntelligenceRecommendation,
} from "./recommendations/recommendations.functions";
export {
  recordIntelligencePrediction,
  listIntelligencePredictions,
  scoreIntelligencePrediction,
} from "./predictions/predictions.functions";
export {
  proposeIntelligenceAction,
  listIntelligenceActions,
  transitionIntelligenceAction,
} from "./actions/actions.functions";
export {
  rememberIntelligence,
  recallIntelligence,
  reviewIntelligenceMemory,
  submitIntelligenceFeedback,
} from "./memory/memory.functions";

/* Sprint 2 — Activation layer */
export * from "./activation/event-map";
export { installIntelligenceBridge } from "./activation/bridge";
export {
  ingestPlatformIntelligenceEvent,
  runIntelligencePipeline,
  getIntelligenceTimelineFn,
  getIntelligenceHealthFn,
} from "./activation/activation.functions";

/* Sprint 3 — Context Intelligence layer */
export * from "./context/context.types";
export { getBusinessContextFn } from "./context/context.functions";

/* Sprint 4 — Predictive Intelligence layer */
export * from "./predictions/forecast.types";
export { getForecastBoardFn, runForecastPassFn } from "./predictions/forecast.functions";