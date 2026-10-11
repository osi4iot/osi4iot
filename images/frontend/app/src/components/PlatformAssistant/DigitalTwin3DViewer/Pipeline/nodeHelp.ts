// nodeHelp.ts
export type NodeHelpEntry = {
    description: string;
    details: string;
    params?: { name: string; description: string }[];
    inputExamples?: { label: string; code: string }[]; // ← array
    outputExamples?: { label: string; code: string }[]; // ← array
    notes?: string[];
};

export const NODE_HELP: Record<string, NodeHelpEntry> = {
    Listen: {
        description: "Subscribes to a NATS subject and emits every message received on it downstream.",
        details: `The Listen node is the main entry point for bringing external data into a pipeline. It opens a persistent subscription to one or more subjects and immediately forwards each incoming message to its output as soon as it is received.

Because the node has no input, it always behaves as a source node, starting a pipeline branch. A pipeline can contain multiple Listen nodes, each subscribed to a different subject.

The subscription target is configured through Listen to, which supports three modes:

Topic reference: resolves the subject from a topic reference registered in the digital twin. This makes pipelines more portable across environments because the subject does not need to be hardcoded.
Generic nats: subscribes directly to the raw NATS subject you provide.
Generic mqtt: accepts an MQTT-style topic and converts / separators into . before subscribing.

When Topic reference is used, the node can resolve a single registered topic or, in some cases, expand to multiple subjects. For example, the special reference all_dev2pdb subscribes to all registered topics whose type starts with dev2pdb.

Incoming NATS messages may include three optional headers that control how payloads are interpreted:

Content-Type: defines the payload format. If not provided, the node assumes application/json.
Json-Structure: defines whether the JSON payload should be treated as an object or an array. If not provided, the node assumes object.
Reply-Timeout-Ms: defines the maximum time in milliseconds the pipeline has to deliver a reply before the send is skipped. Defaults to 30000 ms if the requesting client does not supply a 'Reply-Timeout-Ms' header. Has no effect when 'Publish To' is not set to 'Reply'.

JSON payloads are parsed automatically:

If Content-Type is application/json and Json-Structure is object, the payload is forwarded as a standard JSON object.
If Content-Type is application/json and Json-Structure is array, the payload is wrapped under a rows field before being forwarded.

For non-JSON payloads, the message is forwarded as a file-like binary payload, preserving the original content type.

Use this node whenever a pipeline must react to live data published on NATS or MQTT-compatible topics.`,
        params: [
            {
                name: "Listen To",
                description:
                    "Defines how the subscription target is resolved. 'Topic reference' looks up a registered topic in the digital twin (recommended for portability). 'Generic nats' subscribes to a raw NATS subject. 'Generic mqtt' accepts an MQTT-style topic and converts it to a NATS subject.",
            },
            {
                name: "Topic",
                description:
                    "The topic identifier to subscribe to. Use a topic reference key (e.g. 'dev2dtm') when using 'Topic reference', or provide the raw NATS subject (or MQTT-style topic) when using a generic mode.",
            },
        ],
        outputExamples: [
            {
                label: "JSON object input message example",
                code: JSON.stringify(
                    {
                        topic: "dev2pdb.Group_e12220f1_e21c_4c1d_b073_6c63fdc8e7cd.Topic_KYKuxTPes5PKt9sS4Ycx",
                        payload: {
                            deviceId: "sensor-001",
                            timestamp: "2026-04-16T10:15:30Z",
                            temperature: 22.5,
                            unit: "C",
                        },
                        contentType: "application/json",
                        jsonStructure: "object",
                    },
                    null,
                    2,
                ),
            },
            {
                label: "JSON array input message (batched sensor readings) example",
                code: JSON.stringify(
                    {
                        topic: "dev2pdb.Group_e12220f1_e21c_4c1d_b073_6c63fdc8e7cd.Topic_KYKuxTPes5PKt9sS4Ycx",
                        payload: {
                            rows: [
                                { deviceId: "sensor-001", temperature: 22.5 },
                                { deviceId: "sensor-002", temperature: 21.8 },
                            ],
                        },
                        contentType: "application/json",
                        jsonStructure: "array",
                    },
                    null,
                    2,
                ),
            },
        ],
        notes: [
            "When using 'Topic reference', the special value 'all dev2pdb' expands to multiple subscriptions, one for each dev2pdb topic in the digital twin.",
        ],
    },
    Publish: {
        description:
            "Publishes the incoming message to a configured destination topic and ends the current pipeline branch.",

        details:
            "The Publish node sends each incoming message to a destination NATS subject and has no output wire, so it acts as the end of a pipeline branch. The destination must be configured explicitly through the 'Publish To' and 'Topic' settings. 'Topic reference' resolves the subject from a topic registered in the digital twin, which helps keep pipelines portable across environments. 'Generic nats' publishes to a raw NATS subject. 'Generic mqtt' accepts an MQTT-style topic and converts '/' separators into '.' before publishing. 'Reply' responds to an incoming NATS request by publishing back to the reply subject carried in the message — if the message has no reply context the node silently skips the send. The node preserves message metadata by forwarding the 'Content-Type' and 'Json-Structure' headers. JSON payloads are published as either objects or arrays depending on the message structure, while binary file payloads are sent as raw bytes using the file's own content type. Using an explicit output topic reduces the risk of accidental feedback loops between pipeline inputs and outputs and makes routing behavior easier to predict and debug.",

        params: [
            {
                name: "Publish To",
                description:
                    "Defines how the destination topic is resolved. 'Topic reference' uses a registered topic from the digital twin. 'Generic nats' publishes to a raw NATS subject. 'Generic mqtt' accepts an MQTT-style topic and converts '/' into '.'. 'Reply' responds to the originating NATS request using the reply subject carried in the message — no topic configuration is required in this mode.",
            },
            {
                name: "Topic",
                description:
                    "The destination topic to publish to. Use a topic reference key when 'Publish To' is set to 'Topic reference', a raw NATS subject for 'Generic nats', or an MQTT-style topic for 'Generic mqtt'. Not required when 'Publish To' is set to 'Reply'.",
            },
        ],
        inputExamples: [
            {
                label: "Expected input message",
                code: JSON.stringify(
                    {
                        topic: "dev2pdb.Group_e12220f1_e21c_4c1d_b073_6c63fdc8e7cd.Topic_KYKuxTPes5PKt9sS4Ycx",
                        payload: {
                            deviceId: "sensor-001",
                            timestamp: "2026-04-16T10:15:30Z",
                            temperature: 22.5,
                            unit: "C",
                        },
                        contentType: "application/json",
                        jsonStructure: "object",
                    },
                    null,
                    2,
                ),
            },
        ],
    },
    Inject: {
        description: "Injects a JSON message into the pipeline manually or on a schedule.",
        details:
            "The Inject node is a source node that introduces messages into the pipeline without requiring an input wire. It can inject messages in two ways: on demand through a dedicated inject topic reference, or automatically according to a configured schedule. The inject topic must be a registered topic reference between 'inject_1' and 'inject_5'. Scheduled execution is controlled by the 'Repeat' setting: 'none' disables automatic injection, 'interval' injects a message every configured number of seconds, 'interval_between_times' injects at a fixed interval only within a daily time window, and 'interval_at_specific_time' injects once at a specific time of day. Time-based schedules use the configured timezone and can optionally be limited to selected days of the week. The injected payload is always a JSON object, either generated as a timestamp object or taken from the custom JSON configured in the node. In replicated deployments, only the leader replica runs scheduled injections to avoid duplicates.",
        params: [
            {
                name: "Inject Reference",
                description:
                    "Selects the registered inject topic used by this node. It must be a topic reference between 'inject_1' and 'inject_5'.",
            },
            {
                name: "Repeat",
                description:
                    "Defines whether messages are injected automatically. 'none' disables scheduling. 'interval' injects every N seconds. 'interval_between_times' injects at a fixed interval only within a daily time window. 'interval_at_specific_time' injects once at a specific time of day.",
            },
            {
                name: "Every",
                description:
                    "Interval in seconds between injected messages. Used by 'interval' and 'interval_between_times'.",
            },
            {
                name: "Start Time",
                description:
                    "Start of the daily active window in HH:MM format. Used only when 'Repeat' is set to 'interval_between_times'.",
            },
            {
                name: "End Time",
                description:
                    "End of the daily active window in HH:MM format. Used only when 'Repeat' is set to 'interval_between_times'. It must be later than 'Start Time'.",
            },
            {
                name: "Specific Time",
                description:
                    "Time of day in HH:MM format when a message should be injected. Used only when 'Repeat' is set to 'interval_at_specific_time'.",
            },
            {
                name: "Days of Week",
                description:
                    "Optional list of weekdays when time-based injection is allowed. If not specified, all days are valid.",
            },
            {
                name: "Timezone",
                description: "Timezone used to evaluate scheduled injections. Defaults to 'Europe/Madrid'.",
            },
            {
                name: "Injection Type",
                description:
                    "Defines the JSON object generated by the node. 'Timestamp' injects an object containing the current timestamp. 'JSON' injects the custom JSON configured in the node.",
            },
            {
                name: "JSON",
                description: "Custom JSON object to inject when 'Injection Type' is set to 'JSON'.",
            },
        ],
        outputExamples: [
            {
                label: "Timestamp injection",
                code: JSON.stringify(
                    {
                        topic: "inject_1.Group_e12220f1_e21c_4c1d_b073_6c63fdc8e7cd.Topic_KYKuxTPes5PKt9sS4Ycx",
                        payload: {
                            timestamp: 1776334530000,
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Custom JSON injection",
                code: JSON.stringify(
                    {
                        topic: "inject_1.Group_e12220f1_e21c_4c1d_b073_6c63fdc8e7cd.Topic_KYKuxTPes5PKt9sS4Ycx",
                        payload: {
                            deviceId: "sensor-001",
                            command: "poll",
                            requestedAt: "2026-04-16T10:15:30Z",
                        },
                    },
                    null,
                    2,
                ),
            },
        ],
        notes: [
            "Maximum 5 Inject nodes per pipeline.",
            "Only JSON objects are supported.",
            "Only the leader replica runs scheduled injections in replicated deployments.",
        ],
    },
    Trigger: {
        description: "Controls when incoming JSON messages are sent, delayed, repeated, or reset.",

        details:
            "The Trigger node controls how incoming JSON messages are released into the pipeline. Depending on the selected mode, it can send a first message immediately, delay a second message, repeat a message at a fixed interval, or block further messages until a reset condition is met. In 'Wait for delay and then send second message', the node can emit an initial message right away and optionally emit a second message after the configured delay. In 'Resend every', the node emits the first message and then keeps resending it at the configured interval until the trigger is reset. In 'Wait to be reset', the node sends the first message once and ignores further messages for the same trigger scope until a reset message is received. The first and second messages can be configured independently as a timestamp object, the existing incoming message object, the latest received message object where applicable, a custom JSON object, or nothing. This allows patterns such as suppressing the initial output and only sending a delayed second message. Trigger state can be handled globally for all messages or independently by the 'stream' field in the payload. Reset detection can use 'msg.payload.reset' or another boolean payload field. In 'Wait for delay and then send second message', the second message can optionally be sent through a separate output.",

        params: [
            {
                name: "Send first message and then",
                description:
                    "Defines how the trigger behaves after receiving a message. 'Wait for delay and then send second message' sends an initial message immediately and can send a second one after a delay. 'Resend every' sends the first message and then repeats it at a fixed interval until reset. 'Wait to be reset' sends once and blocks further messages until a reset condition is met.",
            },
            {
                name: "Delay (seconds)",
                description:
                    "Time to wait before sending the second message in 'Wait for delay and then send second message' mode.",
            },
            {
                name: "Every (seconds)",
                description: "Interval between repeated messages in 'Resend every' mode.",
            },
            {
                name: "Allow msg.payload.delay to override delay setting",
                description:
                    "Allows the incoming payload field 'delay' to override the configured delay or resend interval for that message.",
            },
            {
                name: "Extend delay if new message arrives",
                description:
                    "In 'Wait for delay and then send second message' mode, restarts the delay countdown when a new message arrives for the same trigger scope.",
            },
            {
                name: "Reset the trigger if",
                description:
                    "Defines how reset messages are detected. Use 'msg.payload.reset is set' to reset when the payload contains 'reset: true', or 'Optional msg.payload field is set' to use another boolean payload field.",
            },
            {
                name: "Custom payload field",
                description:
                    "Name of the boolean payload field used to reset the trigger when 'Optional msg.payload field is set' is selected.",
            },
            {
                name: "Handling",
                description:
                    "Defines the trigger scope. 'All Messages' uses a single shared trigger state for all incoming messages. 'By stream field in payload' keeps independent trigger states using the payload field 'stream'.",
            },
            {
                name: "First message / Message type",
                description:
                    "Defines the content of the first output message. It can be a timestamp object, the existing incoming message object, a custom JSON object, or nothing. Use 'Nothing' to suppress the initial output.",
            },
            {
                name: "First message / JSON",
                description: "Custom JSON object used when the first message type is set to 'Custom JSON'.",
            },
            {
                name: "Second message / Message",
                description:
                    "Defines the content of the second output message in 'Wait for delay and then send second message' mode. It can be a timestamp object, the original incoming message object, the latest received message object, a custom JSON object, or nothing.",
            },
            {
                name: "Second message / JSON",
                description: "Custom JSON object used when the second message type is set to 'Custom JSON'.",
            },
            {
                name: "Send second message to separate output",
                description: "Sends the second message through a dedicated second output instead of the main output.",
            },
        ],

        inputExamples: [
            {
                label: "Incoming trigger message",
                code: JSON.stringify(
                    {
                        topic: "dev2pdb.Group_e12220f1_e21c_4c1d_b073_6c63fdc8e7cd.Topic_KYKuxTPes5PKt9sS4Ycx",
                        payload: {
                            stream: "pump-01",
                            deviceId: "pump-01",
                            command: "start",
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Reset message",
                code: JSON.stringify(
                    {
                        topic: "dev2pdb.Group_e12220f1_e21c_4c1d_b073_6c63fdc8e7cd.Topic_KYKuxTPes5PKt9sS4Ycx",
                        payload: {
                            stream: "pump-01",
                            reset: true,
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        outputExamples: [
            {
                label: "First output message",
                code: JSON.stringify(
                    {
                        topic: "dev2pdb.Group_e12220f1_e21c_4c1d_b073_6c63fdc8e7cd.Topic_KYKuxTPes5PKt9sS4Ycx",
                        payload: {
                            stream: "pump-01",
                            deviceId: "pump-01",
                            command: "start",
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Delayed second output message",
                code: JSON.stringify(
                    {
                        topic: "dev2pdb.Group_e12220f1_e21c_4c1d_b073_6c63fdc8e7cd.Topic_KYKuxTPes5PKt9sS4Ycx",
                        payload: {
                            timestamp: 1776334530000,
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        notes: [
            "Only JSON object payloads are supported.",
            "When 'Handling' is set to 'By stream field in payload', the payload should include a string field named 'stream'.",
            "The second output is only used when 'Send second message to separate output' is enabled.",
        ],
    },
    Function: {
        description: "Runs custom JavaScript to initialize state, react to startup, and transform incoming messages.",

        details:
            "The Function node lets you run custom JavaScript at three different stages of the node lifecycle. 'On Init' runs once when the node is initialized again and must define an 'init()' function. 'On Start' runs each time the node starts and must define a 'start()' function. 'On Message' runs for every incoming message and must define a 'process(msg)' function. The message script receives a JavaScript message object with fields such as 'topic', 'payload', 'state', and 'file', together with helper methods to inspect and modify the message. A message script can return a single message, an array of messages, or nothing. With one output, the returned message is sent through that output. With multiple outputs, the returned array is routed by position so each item goes to the matching output index. Returning nothing stops the message. When the returned object is based on the original message, the node updates the original topic, payload, state, content type, and JSON structure while preserving the attached file. The script runs inside a JavaScript runtime with platform helper functions available and is subject to the configured function timeout.",

        params: [
            {
                name: "Outputs",
                description:
                    "Defines how many output wires the node exposes. If the message script returns an array, each returned message is routed to the output with the same index.",
            },
            {
                name: "On Init",
                description:
                    "JavaScript executed during reinitialization. The script must define an 'init()' function. Use it to prepare persistent resources or initialize shared state.",
            },
            {
                name: "On Start",
                description:
                    "JavaScript executed each time the node starts. The script must define a 'start()' function. Use it for startup actions that should run whenever the pipeline starts.",
            },
            {
                name: "On Message",
                description:
                    "JavaScript executed for each incoming message. The script must define a 'process(msg)' function. It can transform the message, create new messages, route messages to multiple outputs, or return nothing to drop the input message.",
            },
        ],

        inputExamples: [
            {
                label: "Incoming message",
                code: JSON.stringify(
                    {
                        topic: "dev2pdb.Group_e12220f1_e21c_4c1d_b073_6c63fdc8e7cd.Topic_KYKuxTPes5PKt9sS4Ycx",
                        payload: {
                            deviceId: "sensor-001",
                            temperature: 22.5,
                            unit: "C",
                        },
                        state: {},
                    },
                    null,
                    2,
                ),
            },
        ],

        outputExamples: [
            {
                label: "Single transformed output",
                code: JSON.stringify(
                    {
                        topic: "dev2pdb.Group_e12220f1_e21c_4c1d_b073_6c63fdc8e7cd.Topic_iH1xiBIH4Y0pRyXVCkGo",
                        payload: {
                            deviceId: "sensor-001",
                            temperature: 22.5,
                            alert: false,
                        },
                        state: {},
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Multiple outputs",
                code: JSON.stringify(
                    [
                        {
                            topic: "dev2pdb.Group_e12220f1_e21c_4c1d_b073_6c63fdc8e7cd.Topic_1h7ouLvxUsyPRUxcovvC",
                            payload: {
                                deviceId: "sensor-001",
                                temperature: 22.5,
                            },
                        },
                        {
                            topic: "dev2pdb.Group_e12220f1_e21c_4c1d_b073_6c63fdc8e7cd.Topic_a1b2c3d4e5f6g7h8i9j0",
                            payload: {
                                deviceId: "sensor-001",
                                event: "temperature_processed",
                            },
                        },
                    ],
                    null,
                    2,
                ),
            },
        ],

        notes: [
            "The 'On Init' script must expose an 'init()' function, 'On Start' must expose 'start()', and 'On Message' must expose 'process(msg)'.",
            "With multiple outputs, returned messages are routed by array position.",
            "Returning null, undefined, or no value from 'process(msg)' stops the message.",
        ],
    },
    Delay: {
        description: "Waits for a fixed amount of time before forwarding each incoming message.",

        details:
            "The Delay node pauses each incoming message for the configured duration and then forwards it unchanged to its output. It does not modify the topic, payload, state, or attached file. Each message is delayed independently, so multiple messages can be waiting at the same time. If the node or pipeline stops before the delay finishes, pending messages are discarded instead of being forwarded.",

        params: [
            {
                name: "Duration (seconds)",
                description: "How long each incoming message should wait before being forwarded.",
            },
        ],

        notes: ["Pending messages are dropped if the node stops before their delay completes."],
    },
    Splitter: {
        description: "Distributes incoming messages across multiple outputs using weighted round-robin routing.",
        details:
            "The Splitter node forwards each incoming message to exactly one output according to the configured weights. Routing is deterministic and follows a weighted round-robin pattern, not random sampling. Each weight represents how many messages in each cycle are assigned to its corresponding output. For example, weights '1 4' produce a cycle of 5 messages: output 0 receives 1 message and output 1 receives 4 messages. The sequence repeats continuously while the node is running. The number of weights must match the number of outputs, and all weights must be positive integers.",
        params: [
            {
                name: "Weights",
                description:
                    "One positive integer per output. Each value defines that output's share of messages within the routing cycle. The number of weights must match the number of outputs.",
            },
        ],

        notes: ["Routing is deterministic and repeats in a fixed cycle based on the configured weights."],
    },
    MlModel: {
        description: "Runs ONNX model inference on tensor data contained in the incoming message.",

        details:
            "The MlModel node loads a registered machine learning model and applies inference to each incoming message. The selected model must exist in the platform model registry. Input tensor data is read from the message payload. If the model has a single input, the node expects the tensor data in 'payload.mlmInput'. If the model has multiple inputs, it expects 'payload.mlmInput0', 'payload.mlmInput1', and so on. After running inference, the node writes the result back into the same payload under 'mlmOutput'. For models with a single output, 'mlmOutput' contains that output tensor directly. For models with multiple outputs, 'mlmOutput' contains an array with one entry per output tensor. The node also adds 'elapsedTime' to the payload to indicate how long inference took. The original message topic and any other payload fields are preserved.",

        params: [
            {
                name: "Machine learning model",
                description: "Selects the registered ONNX model to load and run for this node.",
            },
            {
                name: "Batch size",
                description:
                    "Positive integer batch size used when preparing the model input and output tensors. It should match the batch dimension expected by the selected model.",
            },
        ],

        inputExamples: [
            {
                label: "Single-input model message",
                code: JSON.stringify(
                    {
                        payload: {
                            deviceId: "camera-01",
                            mlmInput: [0.12, 0.87, 0.33, 0.45],
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Multi-input model message",
                code: JSON.stringify(
                    {
                        payload: {
                            deviceId: "sensor-hub-01",
                            mlmInput0: [0.12, 0.87, 0.33],
                            mlmInput1: [1, 0, 1],
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        outputExamples: [
            {
                label: "Single-output inference result",
                code: JSON.stringify(
                    {
                        payload: {
                            deviceId: "camera-01",
                            mlmOutput: [0.03, 0.91, 0.06],
                            elapsedTime: "4.8ms",
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Multi-output inference result",
                code: JSON.stringify(
                    {
                        payload: {
                            deviceId: "sensor-hub-01",
                            mlmOutput: [[0.82], [0.11, 0.07]],
                            elapsedTime: "6.1ms",
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        notes: [
            "Input tensor field names depend on the number of model inputs.",
            "Output tensors are always written into the payload under 'mlmOutput'.",
        ],
    },
    AiAgent: {
        description: "Sends a user message to an AI agent and forwards the agent response into the pipeline.",

        details:
            "The AiAgent node connects the pipeline to a configured language model with tool support. For each incoming message, it reads the user name from 'payload.userName' and the prompt text from 'payload.message'. If either field is missing, fallback values are used. The node sends that request to the configured AI agent together with the selected model, system prompt, temperature, Top K, and Top P settings. The system prompt is mandatory and defines the agent's behavior. The agent can access MCP tools made available by the platform, including filesystem access inside the digital twin workspace, date and calculation tools, and FEM results tools when available. The agent response is transformed into a structured JSON payload containing the response message, optional UI metadata, and any tool calls performed during execution. The original message is replaced by the agent response.",

        params: [
            {
                name: "Outputs",
                description:
                    "Defines how many output wires the node exposes. The AI response is sent through the outputs as a standard pipeline message.",
            },
            {
                name: "Model",
                description: "Selects the language model used by the AI agent.",
            },
            {
                name: "Temperature",
                description:
                    "Controls how deterministic or creative the model response should be. Lower values produce more predictable outputs, while higher values increase variability.",
            },
            {
                name: "Top K",
                description: "Limits token sampling to the top K candidate tokens at each generation step.",
            },
            {
                name: "Top P",
                description:
                    "Uses nucleus sampling to limit token generation to the smallest set of tokens whose cumulative probability reaches the configured threshold.",
            },
            {
                name: "System prompt",
                description:
                    "Instructions that define the agent's role, behavior, and constraints. This field is required.",
            },
        ],

        inputExamples: [
            {
                label: "Incoming user prompt",
                code: JSON.stringify(
                    {
                        topic: "assistant.requests",
                        payload: {
                            userName: "operator-01",
                            message: "Summarize the latest temperature alerts for pump-01.",
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        outputExamples: [
            {
                label: "Standard AI response",
                code: JSON.stringify(
                    {
                        payload: {
                            messageType: "response",
                            message:
                                "Pump-01 reported 3 temperature alerts in the last hour. The highest recorded value was 84.2 °C.",
                            uiOpts: {},
                            eventTriggerTopicType: "llm2sim",
                            mcpToolCalls: [],
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Response with tool usage",
                code: JSON.stringify(
                    {
                        payload: {
                            messageType: "response",
                            message: "The average temperature is 72.4 °C.",
                            uiOpts: {},
                            eventTriggerTopicType: "llm2sim",
                            mcpToolCalls: [
                                {
                                    tool: "calculator",
                                    input: "average([70.1, 75.2, 71.9])",
                                },
                            ],
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Email-type response",
                code: JSON.stringify(
                    {
                        payload: {
                            messageType: "email",
                            emailSubject: "Pump-01 Temperature Report",
                            emailBody: "Pump-01 exceeded safe temperature thresholds three times in the last hour.",
                            mcpToolCalls: [],
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        notes: [
            "The input message should provide the prompt in 'payload.message'.",
            "The input message can optionally include 'payload.userName'.",
            "The system prompt is required to define agent behavior.",
        ],
    },
    Transcriptor: {
        description: "Transcribes incoming audio files into text using the OpenAI Whisper API.",
        details:
            "The Transcriptor node processes incoming messages that contain an audio file attachment. If the message does not include a file, or the file is not recognized as audio, the message is forwarded unchanged. For audio files, the node sends the file to the OpenAI transcription API using the configured language as a hint and returns a new message whose payload contains the transcription under 'message'. The output is a new JSON message containing only the transcription result, not the original input message. Supported audio formats include OGG, MP3, MP4, FLAC, WAV, and WebM.",

        params: [
            {
                name: "Language",
                description:
                    "Language hint used for audio transcription. This value is sent to the transcription API to help recognize the spoken language.",
            },
        ],
        notes: [
            "If the input message does not contain an audio file, it is forwarded unchanged.",
            "The output of a successful transcription is a new message containing only the transcription payload.",
            "The LLM provider must be configured to OpenAI, as Whisper is an OpenAI-exclusive API.",
        ],
    },

    Translator: {
        description:
            "Translates the text in an incoming message into a target language using a configured LLM provider.",
        details:
            "The Translator node reads the 'message' field from the incoming payload and sends it to a language model for translation. The translated result overwrites the 'message' field in the output payload, preserving any other fields that were present in the original message. If the incoming payload does not contain a 'message' field, or if it is empty, the message is forwarded unchanged. The node is compatible with any OpenAI-compatible LLM provider by configuring its base URL, making it suitable for use with OpenAI, Azure OpenAI, Groq, Ollama, and similar services.",

        params: [
            {
                name: "Target language",
                description:
                    "The language into which the message text will be translated. For example: English, Spanish, French.",
            },
            {
                name: "LLM model",
                description:
                    "The model used to perform the translation. Defaults to gpt-4o-mini. The 'openai:' prefix is stripped automatically if present.",
            },
        ],
        inputExamples: [
            {
                label: "Incoming message to translate",
                code: JSON.stringify(
                    {
                        payload: {
                            message: "Pump one is currently operating within normal temperature range.",
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        notes: [
            "If the input payload does not contain a 'message' field, the message is forwarded unchanged.",
            "The translated text replaces the original 'message' field; all other payload fields are preserved.",
            "The LLM provider URL is taken from the organization settings. Any OpenAI-compatible provider is supported.",
            "Model names with the 'openai:' prefix are normalized automatically.",
        ],
    },
    Text2Speech: {
        description:
            "Converts the text in an incoming message into an audio file using either the OpenAI TTS API or the free Microsoft Edge TTS service.",
        details:
            "The Text2Speech node reads the 'message' field from the incoming payload and synthesizes it into speech. The resulting audio is attached to the output message as a file, while the original payload fields are preserved. If the incoming payload does not contain a 'message' field, or if it is empty, the message is forwarded unchanged. Two backends are supported: 'openai' uses the OpenAI TTS REST API and requires a valid API key configured in the organization settings; 'edge-tts' uses Microsoft Edge's neural speech service for free, requiring no API key but needing an internet connection. The output audio format defaults to MP3.",
        params: [
            {
                name: "TTS mode",
                description:
                    "Selects the speech synthesis backend. Accepted values: 'openai' (default) or 'edge-tts'. The 'openai' mode requires the organization LLM provider to be set to OpenAI. The 'edge-tts' mode is free and requires no API key.",
            },
            {
                name: "Voice language",
                description:
                    "Only used in 'edge-tts' mode. Selects the language for automatic voice resolution. Supported values: english, spanish, french, german, italian, portuguese, catalan.",
            },
            {
                name: "Voice gender",
                description:
                    "Only used in 'edge-tts' mode. Selects the gender of the automatically resolved voice. Accepted values: 'female' (default) or 'male'.",
            },
        ],
        inputExamples: [
            {
                label: "Incoming message to synthesize",
                code: JSON.stringify(
                    {
                        payload: {
                            message: "Pump one is currently operating within normal temperature range.",
                        },
                    },
                    null,
                    2,
                ),
            },
        ],
        outputExamples: [
            {
                label: "Message with audio file attached (openai mode)",
                code: JSON.stringify(
                    {
                        payload: {
                            message: "Pump one is currently operating within normal temperature range.",
                        },
                        file: {
                            name: "speech.mp3",
                            content_type: "audio/mpeg",
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Message with audio file attached (edge-tts mode, catalan female voice)",
                code: JSON.stringify(
                    {
                        payload: {
                            message: "La bomba u funciona dins del rang de temperatura normal.",
                        },
                        file: {
                            name: "speech.mp3",
                            content_type: "audio/mpeg",
                        },
                    },
                    null,
                    2,
                ),
            },
        ],
        notes: [
            "If the input payload does not contain a 'message' field, the message is forwarded unchanged without generating audio.",
            "The original payload fields are preserved in the output message alongside the attached audio file.",
            "In 'openai' mode, the organization LLM provider URL must be set to 'https://api.openai.com/v1' and a valid API key must be configured.",
            "In 'edge-tts' mode, no API key is required, but the service depends on Microsoft's online speech infrastructure and requires internet access.",
            "The 'edge-tts' mode supports the following languages for automatic voice resolution: english, spanish, french, german, italian, portuguese and catalan.",
            "The Text2Speech node pairs naturally with the Translator node: place Translator before Text2Speech to translate a message and then synthesize it in the target language.",
        ],
    },
    Email: {
        description: "Sends an email when a message reaches the node.",

        details:
            "The Email node sends an email for each incoming message and ends the current pipeline branch. The recipient is selected through 'To Options'. 'Group email notification channel' sends the email to the notification address configured for the current group. 'Custom email' sends it to the email address entered in the node settings. The email content is controlled through 'Message Options'. With 'Custom message', the node always sends the configured subject and body. With 'Use subject and body from incoming message', the node reads the email content from the incoming payload and expects 'payload.emailSubject' and 'payload.emailBody'. If either field is missing in that mode, the message cannot be sent.",

        params: [
            {
                name: "To Options",
                description:
                    "Defines how the recipient email address is selected. 'Group email notification channel' uses the notification email configured for the current group. 'Custom email' uses the address entered in the node.",
            },
            {
                name: "Email Address",
                description: "Recipient email address used when 'To Options' is set to 'Custom email'.",
            },
            {
                name: "Message Options",
                description:
                    "Defines where the email subject and body come from. 'Use subject and body from incoming message' reads them from the incoming message payload. 'Custom message' uses the subject and body configured in the node.",
            },
            {
                name: "Subject",
                description: "Subject line used when 'Message Options' is set to 'Custom message'.",
            },
            {
                name: "Body",
                description: "Email body used when 'Message Options' is set to 'Custom message'.",
            },
        ],

        inputExamples: [
            {
                label: "Dynamic email content from the incoming message",
                code: JSON.stringify(
                    {
                        payload: {
                            emailSubject: "Pump-01 temperature alert",
                            emailBody: "Pump-01 exceeded the configured temperature threshold at 2026-04-16T10:15:30Z.",
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        notes: [
            "This node does not produce an output wire message.",
            "When 'Message Options' is set to 'Use subject and body from incoming message', the input payload must include both 'emailSubject' and 'emailBody'.",
        ],
    },
    TelegramListen: {
        description: "Listens for messages from a specific Telegram chat and injects them into the pipeline.",

        details:
            "The TelegramListen node subscribes to a specific Telegram chat and forwards incoming user messages into the pipeline. It acts as a source node, so it does not require an input wire. The chat is selected using its Telegram chat ID. For standard text messages, the node emits a JSON payload containing the Telegram message ID, chat ID, raw text, Telegram entities, a normalized 'message' field, and a generated user name based on the chat ID. Some Telegram commands are handled internally by the node instead of being forwarded into the pipeline. These include '/start', '/clear', '/state', '/assets', and '/asset'. Callback interactions from inline buttons are also handled internally. Only messages that are not consumed by these built-in commands are sent to the pipeline.",

        params: [
            {
                name: "Chat ID",
                description:
                    "Telegram chat identifier to listen to. Only messages from this chat are received by the node.",
            },
        ],

        outputExamples: [
            {
                label: "Forwarded Telegram text message",
                code: JSON.stringify(
                    {
                        payload: {
                            message_id: 1452,
                            chat_id: 123456789,
                            text: "Show me the latest pump status",
                            entities: [],
                            message: "Show me the latest pump status",
                            userName: "telegram_chat_123456789",
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        notes: [
            "Acts as a source node and does not require an input wire.",
            "Built-in Telegram commands such as '/start', '/clear', '/state', '/assets', and '/asset' are handled by the node and are not forwarded into the pipeline.",
        ],
    },
    TelegramSend: {
        description: "Sends a message to a Telegram chat.",

        details:
            "The TelegramSend node sends a message to a specified Telegram chat and ends the current pipeline branch. The destination chat is defined by its Chat ID. The message content can either be taken from the incoming message or defined directly in the node. When 'Use message from incoming payload' is selected, the node expects the input payload to contain a 'message' field, which will be sent as the Telegram message text. When 'Custom message' is selected, the node sends the static text configured in the node settings. The node does not modify the incoming message and does not produce an output wire message.",

        params: [
            {
                name: "Chat ID",
                description: "Telegram chat identifier where the message will be sent.",
            },
            {
                name: "Message Options",
                description:
                    "Defines where the message text comes from. 'Use message from incoming payload' sends the value of 'payload.message'. 'Custom message' sends the text configured in the node.",
            },
            {
                name: "Message",
                description: "Text to send when 'Message Options' is set to 'Custom message'.",
            },
        ],

        inputExamples: [
            {
                label: "Dynamic message from pipeline",
                code: JSON.stringify(
                    {
                        payload: {
                            message: "Pump-01 is operating within normal parameters.",
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Trigger message for custom text",
                code: JSON.stringify(
                    {
                        payload: {
                            deviceId: "pump-01",
                            temperature: 84.2,
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        notes: [
            "This node does not produce an output wire message.",
            "When using dynamic messages, the payload should include a 'message' field.",
        ],
    },
    Batch: {
        description: "Groups multiple incoming messages into a single batch message.",

        details:
            "The Batch node collects incoming message payloads and emits them together as a single output message. It supports two modes. In 'Group by number of messages', the node waits until the configured number of messages has been collected and then sends one output message containing all payloads. In 'Group by time interval', the node starts a batch when the first message arrives and emits the batch after the configured interval has elapsed. In both modes, the output payload has the form '{ batch: [...] }', where each entry is one original input payload. Only the payload of each incoming message is stored in the batch; topic, state, content type, and file data are not included in the batched output. The current batch is stored in the digital twin key-value store so it can be shared across runtime instances. In time-interval mode, only the leader replica performs the periodic interval check and flushes completed batches.",

        params: [
            {
                name: "Mode",
                description:
                    "Defines how messages are grouped. 'Group by number of messages' emits a batch when the configured number of messages is reached. 'Group by time interval' emits a batch after the configured interval has elapsed since the first message in the batch.",
            },
            {
                name: "Number of messages",
                description:
                    "Number of incoming messages to collect before emitting a batch when using 'Group by number of messages'.",
            },
            {
                name: "Time interval (seconds)",
                description:
                    "Maximum time to wait before emitting the current batch when using 'Group by time interval'. The timer starts when the first message of the batch arrives.",
            },
        ],

        inputExamples: [
            {
                label: "Incoming messages",
                code: JSON.stringify(
                    [
                        {
                            payload: {
                                deviceId: "sensor-001",
                                temperature: 22.5,
                            },
                        },
                        {
                            payload: {
                                deviceId: "sensor-002",
                                temperature: 21.8,
                            },
                        },
                    ],
                    null,
                    2,
                ),
            },
        ],

        outputExamples: [
            {
                label: "Batched output message",
                code: JSON.stringify(
                    {
                        payload: {
                            batch: [
                                {
                                    deviceId: "sensor-001",
                                    temperature: 22.5,
                                },
                                {
                                    deviceId: "sensor-002",
                                    temperature: 21.8,
                                },
                            ],
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        notes: [
            "The batched output contains only the collected payloads, wrapped under 'payload.batch'.",
            "In time-interval mode, the batch timer starts with the first message of the current batch.",
        ],
    },
    IoTDb: {
        description: "Inserts data into the IoT database or reads rows from it using SQL.",

        details:
            "The IoTDb node connects the pipeline to the platform IoT database. It supports two query modes. In 'Static query' mode, the database action is configured directly in the node. 'Insert' stores incoming message payloads in the selected IoT topic table, while 'Read' executes the configured SQL query and returns the query results in the output message. In 'Query from msg.payload.sql' mode, the action and query parameters are taken dynamically from 'msg.payload.sql'. For inserts, the node stores the current message payload as a database row. If the payload contains a 'rows' array, each entry is inserted as a separate row. If a payload includes a 'timestamp' field in RFC3339 format, that value is used as the row timestamp; otherwise the current time is used. For reads, the SQL query is executed and the result is written back into the outgoing payload under 'rows'. Static read queries are validated and resolved before execution, including platform-specific SQL helpers such as topic and time resolution.",

        params: [
            {
                name: "Query mode",
                description:
                    "Defines whether the database action is configured directly in the node or provided dynamically in 'msg.payload.sql'. 'Static query' uses the node settings. 'Query from msg.payload.sql' reads the action and parameters from the incoming message.",
            },
            {
                name: "Action",
                description:
                    "Database operation used in 'Static query' mode. 'Insert' stores incoming payloads in the selected topic. 'Read' executes the configured SQL query and returns the matching rows.",
            },
            {
                name: "Topic",
                description:
                    "Topic reference used as the destination when 'Action' is set to 'Insert' in 'Static query' mode.",
            },
            {
                name: "SQL Query",
                description: "SQL query executed when 'Action' is set to 'Read' in 'Static query' mode.",
            },
        ],

        inputExamples: [
            {
                label: "Insert a single payload",
                code: JSON.stringify(
                    {
                        topic: "sensors.temperature",
                        payload: {
                            deviceId: "sensor-001",
                            temperature: 22.5,
                            timestamp: "2026-04-16T10:15:30Z",
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Insert multiple rows from payload.rows",
                code: JSON.stringify(
                    {
                        payload: {
                            rows: [
                                {
                                    deviceId: "sensor-001",
                                    temperature: 22.5,
                                    timestamp: "2026-04-16T10:15:30Z",
                                },
                                {
                                    deviceId: "sensor-002",
                                    temperature: 21.8,
                                    timestamp: "2026-04-16T10:15:35Z",
                                },
                            ],
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Dynamic insert query from msg.payload.sql",
                code: JSON.stringify(
                    {
                        payload: {
                            sql: {
                                action: "Insert",
                                insertTopic: "dev2pdb_1",
                                variables: {},
                            },
                            deviceId: "sensor-001",
                            temperature: 22.5,
                            timestamp: "2026-04-16T10:15:30Z",
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Dynamic read query from msg.payload.sql. Example 1",
                code: JSON.stringify(
                    {
                        payload: {
                            sql: {
                                action: "Read",
                                readQuery:
                                    "SELECT * FROM iot_table WHERE topic = $__topicFun('dev2pdb_1') ORDER BY timestamp DESC LIMIT 10;",
                                variables: {},
                            },
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Dynamic read query from msg.payload.sql. Example 2",
                code: JSON.stringify(
                    {
                        payload: {
                            sql: {
                                action: "Read",
                                readQuery:
                                    "SELECT * FROM iot_table WHERE topic = $__topicFun('dev2pdb_1') AND timestamp >= $__timeFun('now-1m') ORDER BY timestamp DESC;",
                                variables: {},
                            },
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        outputExamples: [
            {
                label: "Read query result",
                code: JSON.stringify(
                    {
                        payload: {
                            rows: [
                                {
                                    timestamp: "2026-04-16T10:15:30Z",
                                    topic: "dev2pdb_1",
                                    payload: {
                                        deviceId: "sensor-001",
                                        temperature: 22.5,
                                    },
                                },
                                {
                                    timestamp: "2026-04-16T10:15:35Z",
                                    topic: "dev2pdb_1",
                                    payload: {
                                        deviceId: "sensor-002",
                                        temperature: 21.8,
                                    },
                                },
                            ],
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        notes: [
            "Read results are added to the outgoing payload under 'rows'.",
            "Insert operations store the current payload, or each entry in 'payload.rows' when batching inserts.",
            "When using dynamic queries, the payload must include a 'sql' object.",
        ],
    },
    S3Storage: {
        description: "Stores rows in asset S3 storage folders or reads data from them using DuckDB queries.",

        details:
            "The S3Storage node connects the pipeline to the asset S3 storage layer. It supports two query modes. In 'Static query' mode, the action is configured directly in the node. 'Insert' writes rows into the selected folder using the latest registered schema version for that folder. 'Read' executes the configured DuckDB query against the asset storage and returns the results in the output message. In 'Query from msg.payload.s3Storage' mode, the action and parameters are taken dynamically from the incoming payload. For dynamic inserts, the payload must include 'payload.s3Storage.action', 'payload.s3Storage.folder', and 'payload.s3Storage.rows'. Each entry in 'rows' is written as a separate row. For dynamic reads, the payload must include 'payload.s3Storage.action' and 'payload.s3Storage.duckdbQuery', and may also include 'payload.s3Storage.variables'. Read results are added to the outgoing payload under 'rows'. Static and dynamic read queries can use platform-specific SQL helpers such as time resolution and the 's3_storage(...)' DuckDB table function.",

        params: [
            {
                name: "Query mode",
                description:
                    "Defines whether the storage action is configured directly in the node or provided dynamically in 'msg.payload.s3Storage'. 'Static query' uses the node settings. 'Query from msg.payload.s3Storage' reads the action and parameters from the incoming message.",
            },
            {
                name: "Action",
                description:
                    "Storage operation used in 'Static query' mode. 'Insert' writes rows into the selected folder. 'Read' executes the configured DuckDB query and returns the matching rows.",
            },
            {
                name: "Folder name",
                description: "Destination folder used when 'Action' is set to 'Insert' in 'Static query' mode.",
            },
            {
                name: "DuckDB query",
                description: "DuckDB query executed when 'Action' is set to 'Read' in 'Static query' mode.",
            },
        ],

        inputExamples: [
            {
                label: "Dynamic insert from msg.payload.s3Storage",
                code: JSON.stringify(
                    {
                        payload: {
                            s3Storage: {
                                action: "Insert",
                                folder: "telemetry",
                                rows: [
                                    {
                                        deviceId: "sensor-001",
                                        temperature: 22.5,
                                        timestamp: "2026-04-16T10:15:30Z",
                                    },
                                    {
                                        deviceId: "sensor-002",
                                        temperature: 21.8,
                                        timestamp: "2026-04-16T10:15:35Z",
                                    },
                                ],
                            },
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Dynamic read from msg.payload.s3Storage",
                code: JSON.stringify(
                    {
                        payload: {
                            s3Storage: {
                                action: "Read",
                                duckdbQuery:
                                    "SELECT * FROM s3_storage('telemetry') WHERE timestamp >= $__timeFun('now-1d/d') AND timestamp <= $__timeFun('now/d') ORDER BY timestamp DESC;",
                                variables: {},
                            },
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        outputExamples: [
            {
                label: "Read query result",
                code: JSON.stringify(
                    {
                        payload: {
                            rows: [
                                {
                                    timestamp: "2026-04-16T10:15:30Z",
                                    deviceId: "sensor-001",
                                    temperature: 22.5,
                                },
                                {
                                    timestamp: "2026-04-16T10:15:35Z",
                                    deviceId: "sensor-002",
                                    temperature: 21.8,
                                },
                            ],
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        notes: [
            "Dynamic queries use 'msg.payload.s3Storage' with exact field names in lowercase JSON.",
            "Read results are added to the outgoing payload under 'rows'.",
            "Dynamic inserts require a 'rows' array inside 'msg.payload.s3Storage'.",
        ],
    },
    AssetState: {
        description: "Sets, updates, or retrieves the state of the current asset or the assets in the current group.",

        details:
            "The AssetState node manages asset state information using either the IoT DB or the group key-value store. It supports three actions. 'Set or update state of current asset' stores the current asset state in the selected store. In that mode, the state can come from a custom JSON object configured in the node or from 'msg.payload.state'. 'Get state of current asset' reads the current asset state from the selected store and adds it to the outgoing payload under 'state', together with 'state_description'. 'Get states of assets in current group' reads the states of all assets in the current group and adds them to the outgoing payload under 'assetStates'. When reading state data, the node ensures that 'status' is always present, defaulting to 'Unknown' if missing. It also ensures that 'state_description' is present when returning state information.",

        params: [
            {
                name: "Store type",
                description:
                    "Selects where asset state data is stored and retrieved from. 'IoT DB' uses the asset state table in the database. 'Key-Value Store' uses the group key-value store.",
            },
            {
                name: "Action",
                description:
                    "Defines the operation to perform. 'Set or update state of current asset' writes state for the current asset. 'Get state of current asset' retrieves the current asset state. 'Get states of assets in current group' retrieves the states of all assets in the current group.",
            },
            {
                name: "Set state mode",
                description:
                    "Defines where the state data comes from when updating the current asset. 'Custom state' uses the JSON configured in the node. 'State from msg.payload.state' reads the state object from the incoming payload.",
            },
            {
                name: "JSON",
                description:
                    "Custom JSON object used as the asset state when 'Set state mode' is set to 'Custom state'.",
            },
        ],

        inputExamples: [
            {
                label: "Set state from msg.payload.state",
                code: JSON.stringify(
                    {
                        topic: "asset.state.update",
                        payload: {
                            state: {
                                status: "Alarm",
                                state_description: "Temperature threshold exceeded",
                                temperature: 84.2,
                            },
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Trigger message for custom configured state",
                code: JSON.stringify(
                    {
                        topic: "asset.state.update",
                        payload: {
                            source: "rule-engine",
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        outputExamples: [
            {
                label: "Get state of current asset",
                code: JSON.stringify(
                    {
                        payload: {
                            state: {
                                status: "OK",
                                state_description: "Asset operating normally",
                                temperature: 22.5,
                            },
                            state_description: "Asset operating normally",
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Get states of assets in current group",
                code: JSON.stringify(
                    {
                        payload: {
                            assetStates: {
                                asset_001: {
                                    status: "OK",
                                    state_description: "Asset operating normally",
                                },
                                asset_002: {
                                    status: "Alarm",
                                    state_description: "Temperature threshold exceeded",
                                },
                            },
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Successful state update response",
                code: JSON.stringify(
                    {
                        payload: {
                            message: "State for asset asset_001 upserted successfully in IoT DB",
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        notes: [
            "When 'Set state mode' is set to 'State from msg.payload.state', the input payload must include a 'state' object.",
            "When reading state data, missing 'status' values are replaced with 'Unknown'.",
        ],
    },
};
