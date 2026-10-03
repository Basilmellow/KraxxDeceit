import { loadEnvConfig } from "@next/env";
import { AgentProviderApiError, extractOpenRouterAssistantOutput, requestOpenRouterCompletion } from "../lib/agent/provider";

loadEnvConfig(process.cwd());

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
const configuredModel = process.env.AI_MODEL?.trim() || "openrouter/free";
if (process.env.AI_PROVIDER?.trim().toLowerCase() !== "openrouter") {
  console.log(JSON.stringify({ status: null, success: false, error: { message: "AI_PROVIDER is not configured as openrouter." } }));
  process.exit(1);
}
if (!apiKey) {
  console.log(JSON.stringify({ status: null, success: false, error: { message: "OPENROUTER_API_KEY is not configured." } }));
  process.exit(1);
}
const activeApiKey: string = apiKey;

function safeError(error: unknown) {
  if (error instanceof AgentProviderApiError) return error.providerError;
  return { message: "OpenRouter request failed before a provider response was received." };
}

async function main() {
let response: Response;
try {
  response = await requestOpenRouterCompletion(activeApiKey, configuredModel, {
    messages: [{ role: "user", content: "Reply with the word OK." }],
    max_tokens: 32,
  });
} catch (error) {
  const providerError = safeError(error);
  console.log(JSON.stringify({ plainTextSmoke: { status: "status" in providerError ? providerError.status : null, success: false, hasAssistantOutput: false, hasToolCalls: false, toolCallCount: 0, error: providerError } }));
  process.exit(1);
}
const payload = await response.json().catch(() => undefined) as { id?: unknown; model?: unknown; error?: unknown } | undefined;
const output = extractOpenRouterAssistantOutput(payload);
const hasAssistantOutput = Boolean(output.text || output.toolCalls.length);
const hasProviderError = Boolean(payload?.error);
const plainTextResult = {
  status: response.status,
  success: response.ok && hasAssistantOutput && !hasProviderError,
  ...(typeof payload?.model === "string" ? { actualModel: payload.model } : {}),
  ...(typeof payload?.id === "string" ? { responseId: payload.id } : {}),
  hasAssistantOutput,
  hasToolCalls: output.toolCalls.length > 0,
  toolCallCount: output.toolCalls.length,
  hasProviderError,
};
console.log(JSON.stringify({ plainTextSmoke: plainTextResult }));

const fakeTool = [{
  type: "function",
  function: {
    name: "kraxx_test_tool",
    description: "A test tool that returns a fixed confirmation.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
}];

let toolResponse: Response;
try {
  toolResponse = await requestOpenRouterCompletion(activeApiKey, configuredModel, {
    messages: [{ role: "user", content: "Call kraxx_test_tool exactly once with empty arguments. Do not answer until the tool result is provided." }],
    tools: fakeTool,
    tool_choice: "required",
    max_tokens: 64,
  });
} catch (error) {
  const providerError = safeError(error);
  console.log(JSON.stringify({ toolCallSmoke: { status: "status" in providerError ? providerError.status : null, success: false, toolCallReceived: false, error: providerError } }));
  process.exit(1);
}
const toolPayload = await toolResponse.json().catch(() => undefined) as { id?: unknown; model?: unknown; error?: unknown } | undefined;
const toolOutput = extractOpenRouterAssistantOutput(toolPayload);
const requestedTool = toolOutput.toolCalls.length === 1 && toolOutput.toolCalls[0]?.name === "kraxx_test_tool" ? toolOutput.toolCalls[0] : undefined;
let parsedArguments: unknown;
let validArguments = false;
if (requestedTool) {
  try {
    parsedArguments = typeof requestedTool.arguments === "string" ? JSON.parse(requestedTool.arguments) : requestedTool.arguments;
    validArguments = Boolean(parsedArguments && typeof parsedArguments === "object" && !Array.isArray(parsedArguments) && Object.keys(parsedArguments).length === 0);
  } catch { validArguments = false; }
}

let assistantOutputAfterTool = false;
let followupStatus: number | undefined;
let followupError: unknown;
if (toolResponse.ok && requestedTool && validArguments) {
  const toolCallId = requestedTool.id ?? "kraxx-test-tool-call";
  try {
    const followup = await requestOpenRouterCompletion(activeApiKey, configuredModel, {
      messages: [
        { role: "user", content: "Call kraxx_test_tool exactly once with empty arguments. Do not answer until the tool result is provided." },
        { role: "assistant", content: null, tool_calls: [{ id: toolCallId, type: "function", function: { name: requestedTool.name, arguments: "{}" } }] },
        { role: "tool", tool_call_id: toolCallId, name: requestedTool.name, content: JSON.stringify({ confirmation: "KRAXX_TEST_TOOL_OK" }) },
      ],
      tools: fakeTool,
      tool_choice: "none",
      max_tokens: 64,
    });
    followupStatus = followup.status;
    const followupPayload = await followup.json().catch(() => undefined);
    assistantOutputAfterTool = followup.ok && Boolean(extractOpenRouterAssistantOutput(followupPayload).text);
  } catch (error) { followupError = safeError(error); }
}

console.log(JSON.stringify({
  toolCallSmoke: {
    status: toolResponse.status,
    ...(typeof toolPayload?.model === "string" ? { actualModel: toolPayload.model } : {}),
    ...(typeof toolPayload?.id === "string" ? { responseId: toolPayload.id } : {}),
    toolCallReceived: Boolean(requestedTool),
    ...(requestedTool ? { toolName: requestedTool.name, toolArguments: validArguments ? parsedArguments : "invalid" } : {}),
    ...(followupStatus !== undefined ? { followupStatus, assistantOutputAfterTool } : {}),
    ...(followupError ? { followupError } : {}),
    hasProviderError: Boolean(toolPayload?.error),
    success: toolResponse.ok && !toolPayload?.error && Boolean(requestedTool) && validArguments && assistantOutputAfterTool,
  },
}));
if (!(toolResponse.ok && !toolPayload?.error && requestedTool && validArguments && assistantOutputAfterTool && plainTextResult.success)) process.exit(1);
}

main().catch(() => {
  console.log(JSON.stringify({ success: false, error: { message: "OpenRouter smoke test failed before producing a response." } }));
  process.exit(1);
});
