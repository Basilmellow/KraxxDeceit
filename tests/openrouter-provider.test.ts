import assert from "node:assert/strict";
import test from "node:test";
import { OpenRouterAgentProvider, AgentProviderApiError, extractOpenRouterAssistantOutput } from "../lib/agent/provider";
import { runBrowserAgent } from "../lib/agent/browser-agent";

const key = "or-test-secret-123456789";
const context = async () => ({
  task: "Summarize the page.", url: "https://example.com", currentUrl: "https://example.com",
  pageText: { source: "untrusted_web_content" as const, content: "Example page." }, actions: [],
});
const completion = (message: Record<string, unknown>) => new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
async function withFetch(mock: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { await run(); } finally { globalThis.fetch = original; }
}

test("OpenRouter text response maps to a final agent action", async () => {
  await withFetch(async () => completion({ content: "The page is a documentation site." }), async () => {
    const decision = await new OpenRouterAgentProvider(key, "openrouter/free").generateAction(await context());
    assert.deepEqual(decision, { tool: "finish", input: { summary: "The page is a documentation site." } });
  });
});

test("OpenRouter output parser accepts text and tool calls across compatible response shapes", () => {
  assert.deepEqual(extractOpenRouterAssistantOutput({ choices: [{ message: { content: [{ type: "text", text: "hello" }] } }] }), { text: "hello", toolCalls: [] });
  assert.deepEqual(extractOpenRouterAssistantOutput({ output: [{ type: "message", content: [{ type: "output_text", text: "hello" }] }, { type: "function_call", id: "call-1", name: "kraxx_test_tool", arguments: "{}" }] }), {
    text: "hello", toolCalls: [{ id: "call-1", name: "kraxx_test_tool", arguments: "{}" }],
  });
  assert.deepEqual(extractOpenRouterAssistantOutput({ output_text: "hello" }), { text: "hello", toolCalls: [] });
});

test("OpenRouter tool call uses the OpenAI-compatible endpoint and browser tool definitions", async () => {
  await withFetch(async (input, init) => {
    assert.equal(String(input), "https://openrouter.ai/api/v1/chat/completions");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), `Bearer ${key}`);
    assert.equal(headers.get("x-title"), "KraxxDeceit");
    const body = JSON.parse(String(init?.body)) as { tools: Array<{ function: { name: string } }> };
    assert.ok(body.tools.some((tool) => tool.function.name === "navigate"));
    return completion({ content: null, tool_calls: [{ function: { name: "get_page_text", arguments: "{}" } }] });
  }, async () => {
    const decision = await new OpenRouterAgentProvider(key, "openrouter/free").generateAction(await context());
    assert.deepEqual(decision, { tool: "get_page_text", input: {} });
  });
});

test("OpenRouter tool arguments are parsed and validated", async () => {
  await withFetch(async () => completion({ tool_calls: [{ function: { name: "navigate", arguments: JSON.stringify({ url: "https://example.com/docs" }) } }] }), async () => {
    const decision = await new OpenRouterAgentProvider(key, "openrouter/free").generateAction(await context());
    assert.deepEqual(decision, { tool: "navigate", input: { url: "https://example.com/docs" } });
  });
});

test("OpenRouter provider errors retain only sanitized metadata", async () => {
  const originalError = console.error;
  const logs: string[] = [];
  console.error = (value?: unknown) => { logs.push(String(value)); };
  try {
    await withFetch(async () => new Response(JSON.stringify({ error: { type: "rate_limit_error", code: "slow_down", message: `Retry with ${key}; Bearer ${key}` } }), {
      status: 429, headers: { "retry-after": "2", "x-request-id": "or-safe-123" },
    }), async () => {
      await assert.rejects(new OpenRouterAgentProvider(key, "openrouter/free").generateAction(await context()), (error: unknown) => {
        assert.ok(error instanceof AgentProviderApiError);
        assert.deepEqual(error.providerError, { status: 429, type: "rate_limit_error", code: "slow_down", message: "Retry with [redacted]; Bearer [redacted]", requestId: "or-safe-123", retryAfterMs: 2000 });
        return true;
      });
    });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].includes(key), false);
    assert.equal(logs[0].includes("Authorization"), false);
  } finally { console.error = originalError; }
});

test("malformed OpenRouter tool calls are rejected", async () => {
  await withFetch(async () => completion({ tool_calls: [{ function: { name: "navigate", arguments: "{bad json" } }] }), async () => {
    await assert.rejects(new OpenRouterAgentProvider(key, "openrouter/free").generateAction(await context()), /malformed tool arguments/);
  });
});

test("OpenRouter blocked navigation is recorded and never dispatched", async () => {
  await withFetch(async () => completion({ tool_calls: [{ function: { name: "navigate", arguments: JSON.stringify({ url: "https://not-allowed.invalid/" }) } }] }), async () => {
    let dispatchCount = 0;
    const run = await runBrowserAgent(new OpenRouterAgentProvider(key, "openrouter/free"), context, async () => { dispatchCount += 1; return { status: "completed" }; },
      (url) => url.includes("example.com") ? undefined : "destination_not_allowed");
    assert.equal(dispatchCount, 0);
    assert.equal(run.actions[0]?.policyDecision, "blocked");
    assert.equal(run.actions[0]?.result.reason, "destination_not_allowed");
  });
});

test("OpenRouter final response completes the existing agent loop", async () => {
  await withFetch(async () => completion({ content: "The page provides a concise example." }), async () => {
    const run = await runBrowserAgent(new OpenRouterAgentProvider(key, "openrouter/free"), context, async () => ({ status: "completed" }));
    assert.equal(run.provider, "openrouter");
    assert.equal(run.completed, true);
    assert.equal(run.summary, "The page provides a concise example.");
    assert.equal(run.actions[0]?.tool, "finish");
  });
});

test('research tool arguments lift a strict public assessment out of browser input',async()=>{
  await withFetch(async (_input,init)=>{const body=JSON.parse(String(init?.body));assert.equal(body.tool_choice,'required');assert.equal(body.parallel_tool_calls,undefined);assert.deepEqual(body.provider,{require_parameters:true});assert.equal(body.tools[0].function.strict,true);assert.match(body.messages[1].content,/exactly one allowed browser tool call/);assert.equal(body.max_tokens,4096);assert.ok(body.tools[0].function.parameters.required.includes('research'));return completion({tool_calls:[{function:{name:'get_page_text',arguments:JSON.stringify({research:{question:'What does the page show?',hypothesis:'The page describes a fixture.',evidenceIds:['page-context-001'],status:'insufficient_evidence'}})}}]});},async()=>{
    const c: import("../lib/agent/provider").AgentContext=await context();c.research={evidence:[{id:'page-context-001',description:'Untrusted page snapshot'}],priorAssessments:[],remainingExperiments:5,remainingTools:10,remainingModelTurns:8};const d=await new OpenRouterAgentProvider(key,'openrouter/free').generateAction(c);assert.deepEqual(d.input,{});assert.equal(d.research?.evidenceIds[0],'page-context-001');
  });
});
test('output-limited provider response is classified and keeps model provenance without storing reasoning',async()=>{
 await withFetch(async()=>new Response(JSON.stringify({model:'test-model',id:'test-response',choices:[{finish_reason:'length',message:{content:'',reasoning:'PRIVATE-NOT-RETAINED'}}]})),async()=>{
   const p=new OpenRouterAgentProvider(key,'openrouter/free');await assert.rejects(p.generateAction(await context()),/output_limit/);assert.equal(p.actualModel,'test-model');assert.equal(p.responseId,'test-response');assert.ok(!JSON.stringify(p).includes('PRIVATE-NOT-RETAINED'));
 });
});
test('multiple suggested tools are rejected instead of silently executing the first',async()=>{
 await withFetch(async()=>completion({tool_calls:[{function:{name:'get_page_text',arguments:'{}'}},{function:{name:'navigate',arguments:JSON.stringify({url:'https://example.com'})}}]}),async()=>{await assert.rejects(new OpenRouterAgentProvider(key,'openrouter/free').generateAction(await context()),/multiple_tools/);});
});
