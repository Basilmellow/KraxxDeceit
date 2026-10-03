import assert from "node:assert/strict";
import test from "node:test";
import { OpenAIResponsesApiError, requestOpenAIResponse } from "../lib/agent/provider";
import { runBrowserAgent } from "../lib/agent/browser-agent";

test("Responses API errors expose only sanitized, allowlisted metadata", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const apiKey = "sk-test-secret-value-123456";
  const logs: string[] = [];
  globalThis.fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${apiKey}`);
    return new Response(JSON.stringify({error:{type:"rate_limit_error",code:"slow_down",message:`Retry later; key=${apiKey}; Bearer ${apiKey}`}}), {
      status:429,
      headers:{"content-type":"application/json","retry-after":"3","x-request-id":"req_safe_123"},
    });
  };
  console.error = (value?: unknown) => { logs.push(String(value)); };
  try {
    await assert.rejects(requestOpenAIResponse(apiKey,"gpt-6.1-sol",{input:"sensitive request body"}), (error: unknown) => {
      assert.ok(error instanceof OpenAIResponsesApiError);
      assert.deepEqual(error.providerError,{status:429,type:"rate_limit_error",code:"slow_down",message:"Retry later; key=[redacted]; Bearer [redacted]",requestId:"req_safe_123",retryAfterMs:3000});
      assert.equal(JSON.stringify(error.providerError).includes(apiKey),false);
      return true;
    });
    assert.equal(logs.length,1);
    const logged=JSON.parse(logs[0]) as Record<string,unknown>;
    assert.deepEqual(Object.keys(logged).sort(),["code","message","requestId","retryAfter","status","type"]);
    assert.equal(logged.retryAfter,"3");
    assert.equal(logs[0].includes(apiKey),false);
    assert.equal(logs[0].includes("sensitive request body"),false);
  } finally {
    globalThis.fetch=originalFetch;
    console.error=originalError;
  }
});

test("browser agent preserves only the safe providerError object for case construction", async () => {
  const providerError={status:429,type:"insufficient_quota",code:"credit_balance_exhausted",message:"No credits remain.",requestId:"req_safe_456"};
  const run=await runBrowserAgent({name:"openai",async generateAction(){throw new OpenAIResponsesApiError(providerError);}},async()=>({task:"test",url:"https://example.com",currentUrl:"https://example.com",pageText:{source:"untrusted_web_content",content:""},actions:[]}),async()=>({status:"completed"}));
  assert.equal(run.terminationReason,"model_error");
  assert.deepEqual(run.providerError,providerError);
});
