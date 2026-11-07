import { describe, expect, it } from "vitest";
import { reconcileCommercialProviderStatement, type ReconciliationInternalPayment, type ReconciliationProviderRow } from "./commercial-reconciliation-engine";

const payment=(overrides:Partial<ReconciliationInternalPayment>={})=>({
  id:"payment-1",providerTransactionRef:"provider-1",providerOrderRef:null,
  amountMinor:10000,currency:"TZS" as const,status:"successful" as const,allocatedMinor:10000,
  ...overrides,
});
const provider=(overrides:Partial<ReconciliationProviderRow>={})=>({
  providerRef:"provider-1",amountMinor:10000,currency:"TZS" as const,status:"successful" as const,
  ...overrides,
});

describe("CC-04 provider statement reconciliation",()=>{
  it("matches exact amount and currency without mutating the ledger",()=>{
    const result=reconcileCommercialProviderStatement([payment()],[provider()]);
    expect(result[0].itemType).toBe("matched");
    expect(result[0].resolutionStatus).toBe("resolved");
  });
  it("detects missing internal transactions and duplicate provider references",()=>{
    const result=reconcileCommercialProviderStatement([],[provider({providerRef:"missing"}),provider(),provider()]);
    expect(result.map(x=>x.itemType)).toContain("missing_internal");
    expect(result.map(x=>x.itemType)).toContain("duplicate");
  });
  it("detects amount and currency mismatches independently",()=>{
    expect(reconcileCommercialProviderStatement([payment()],[provider({amountMinor:9000})])[0].itemType).toBe("amount_mismatch");
    expect(reconcileCommercialProviderStatement([payment()],[provider({currency:"USD"})])[0].itemType).toBe("currency_mismatch");
  });
  it("detects status mismatches without confirming a payment",()=>{
    expect(reconcileCommercialProviderStatement([payment({status:"pending"})],[provider()])[0].itemType).toBe("status_mismatch");
  });
  it("detects successful but unallocated collections and reversed transactions",()=>{
    expect(reconcileCommercialProviderStatement([payment({allocatedMinor:0})],[provider()])[0].itemType).toBe("unallocated");
    expect(reconcileCommercialProviderStatement([payment({status:"reversed"})],[provider({status:"reversed"})])[0].itemType).toBe("reversed");
  });
  it("detects internal transactions missing from the provider statement",()=>{
    expect(reconcileCommercialProviderStatement([payment()],[])[0].itemType).toBe("missing_provider");
  });
  it("rejects malformed provider statement amounts",()=>{
    expect(()=>reconcileCommercialProviderStatement([],[provider({amountMinor:1.2})])).toThrow();
  });
});
