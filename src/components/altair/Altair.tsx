/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { type FunctionDeclaration, SchemaType } from "@google/generative-ai";
import { useEffect, useRef, useState, memo } from "react";
import vegaEmbed from "vega-embed";
import { ForeverVM, StandardOutput } from "@forevervm/sdk";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { LiveFunctionResponse, ToolCall } from "../../multimodal-live-types";
import { generateReplToken } from "../../lib/forevervm";

const fvm = new ForeverVM({ token: await generateReplToken() });

const repl = fvm.repl();

const renderAltair: FunctionDeclaration = {
  name: "render_altair",
  description: "Displays an altair graph in json format.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      json_graph: {
        type: SchemaType.STRING,
        description:
          "JSON STRING representation of the graph to render. Must be a string, not a json object",
      },
    },
    required: ["json_graph"],
  },
};

const runPython: FunctionDeclaration = {
  name: "run_python",
  description:
    "Run Python code in a stateful read-eval-print loop. Variables, imports, and functions are persisted between calls. Imports of common packages, including requests, matplotlib, and pandas, are permitted, but you may not install libraries.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      code: {
        type: SchemaType.STRING,
        description: "The Python code to run",
      },
    },
    required: ["code"],
  },
};

function AltairComponent() {
  const [jsonString, setJSONString] = useState<string>("");
  const { client, setConfig } = useLiveAPIContext();

  useEffect(() => {
    setConfig({
      model: "models/gemini-2.0-flash-exp",
      generationConfig: {
        responseModalities: "audio",
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
        },
      },
      systemInstruction: {
        parts: [
          {
            text: 'You are my helpful assistant. Any time I ask you for a graph call the "render_altair" function I have provided you. Dont ask for additional information just make your best judgement.',
          },
        ],
      },
      tools: [
        // there is a free-tier quota for search
        { googleSearch: {} },
        { functionDeclarations: [renderAltair, runPython] },
      ],
    });
  }, [setConfig]);

  useEffect(() => {
    const onToolCall = async (toolCall: ToolCall) => {
      console.log(`got toolcall`, toolCall);

      const functionResponses: LiveFunctionResponse[] = [];

      for (const fc of toolCall.functionCalls) {
        switch (fc?.name) {
          case renderAltair.name: {
            const str = (fc.args as any).json_graph;
            setJSONString(str);
            functionResponses.push({ id: fc.id, response: { output: { success: true } } });
            break;
          }

          case runPython.name: {
            const code = (fc.args as any).code;

            const instruction = repl.exec(code);

            let output: StandardOutput[] = [];
            for await (const line of instruction.output) output.push(line);

            const result = await repl.exec(code).result;

            functionResponses.push({ id: fc.id, response: { output: { output, result } } });
            break;
          }
        }
      }

      // send data for the response of your tool call
      // in this case Im just saying it was successful
      if (functionResponses.length)
        setTimeout(() => client.sendToolResponse({ functionResponses }), 200);
    };
    client.on("toolcall", onToolCall);
    return () => {
      client.off("toolcall", onToolCall);
    };
  }, [client]);

  const embedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (embedRef.current && jsonString) {
      vegaEmbed(embedRef.current, JSON.parse(jsonString));
    }
  }, [embedRef, jsonString]);
  return <div className="vega-embed" ref={embedRef} />;
}

export const Altair = memo(AltairComponent);
