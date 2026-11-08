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
        description: "Injects a JSON message into the pipeline manually or on a schedule, or a file (image, video, audio) from the browser.",
        details:
            "The Inject node is a source node that introduces messages into the pipeline without requiring an input wire. It can inject messages in two ways: on demand with its 'Execute' button, or automatically according to a configured schedule. All the Inject nodes of a digital twin share its 'inject' topic: the button publishes on it with an 'Inject-Node' header carrying the node's UID, and each node only takes the messages addressed to it. Scheduled execution is controlled by the 'Repeat' setting: 'none' disables automatic injection, 'interval' injects a message every configured number of seconds, 'interval_between_times' injects at a fixed interval only within a daily time window, and 'interval_at_specific_time' injects once at a specific time of day. Time-based schedules use the configured timezone and can optionally be limited to selected days of the week. The injected payload is a JSON object, either generated as a timestamp object or taken from the custom JSON configured in the node, or a file: with 'File', the button sends an image, a video or an audio clip chosen in the node, in the same format as the mobile sensors send to dev2dtm, so that a pipeline can be tested without its device (a video goes as one JPEG image per frame, at the chosen frames per second, each with the frame's time as its timestamp; a large audio clip as 16 kHz WAV segments). The file stays in the browser where it was chosen, not in the pipeline. In replicated deployments, only the leader replica runs scheduled injections to avoid duplicates.",
        params: [
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
                    "Defines the message generated by the node. 'Timestamp' injects an object containing the current timestamp. 'JSON' injects the custom JSON configured in the node. 'File' injects the image, video or audio file chosen in the node (from its button only).",
            },
            {
                name: "File",
                description:
                    "An image (one message), a video (one image/jpeg message per frame: frames per second, speed, JPEG quality, largest side, loop) or an audio clip (as is when it fits in a message of 900 kB, else 16 kHz mono WAV segments). The payload carries fileName and timestamp, and frame and videoTime for a video or segment and segments for audio. Press the button again to stop a video or an audio being sent.",
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
                        topic: "inject.Group_e12220f1_e21c_4c1d_b073_6c63fdc8e7cd.Topic_KYKuxTPes5PKt9sS4Ycx",
                        payload: {
                            timestamp: 1776334530000,
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "File injection: a frame of a video (image/jpeg attached)",
                code: JSON.stringify(
                    {
                        topic: "inject.Group_e12220f1_e21c_4c1d_b073_6c63fdc8e7cd.Topic_KYKuxTPes5PKt9sS4Ycx",
                        payload: { fileName: "video.mp4", frame: "12", videoTime: "1.200", timestamp: "2026-11-07T11:20:01.200Z" },
                        file: { name: "video.mp4", contentType: "image/jpeg" },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Custom JSON injection",
                code: JSON.stringify(
                    {
                        topic: "inject.Group_e12220f1_e21c_4c1d_b073_6c63fdc8e7cd.Topic_KYKuxTPes5PKt9sS4Ycx",
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
            "There is no limit of Inject nodes per pipeline. They are meant to be fired from their button or by their schedule, never from outside the pipeline: a message on the 'inject' topic without the 'Inject-Node' header of a node is ignored.",
            "A file is sent by the browser of whoever presses the button, while the page stays open; the next nodes get it as from a Listen on dev2dtm (msg.IsImage(), msg.GetImage(), msg.IsAudio()).",
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
            "The AiAgent node connects the pipeline to a configured language model with tool support. For each incoming message, it takes the prompt text from 'payload.message' and the user who asks from where the message came: the web chat publishes on the user's own copy of the sim2llm topic (only that user can publish there), and a Telegram chat is its own user. Each user has its own conversation, which the agent reads and keeps; a message without a known sender (published on the sim2llm topic itself, whose 'payload.userName' anyone could write) is answered without a conversation. The answer to a web chat user goes to that user's NATS inbox, where nobody else can read it. The node sends that request to the configured AI agent together with the selected model, system prompt, temperature, Top K, and Top P settings. The system prompt is mandatory and defines the agent's behavior. The agent can access the MCP tools chosen in the Tools tab (the documents of the group's knowledge base, the history of the group's sensors and the states of its assets, date and calculation tools, and FEM results tools when available) and the skills chosen there: instructions for specific tasks, which the agent loads only when it needs them. The agent response is transformed into a structured JSON payload containing the response message, optional UI metadata, and any tool calls performed during execution. The original message is replaced by the agent response.",

        params: [
            {
                name: "Outputs",
                description:
                    "Defines how many output wires the node exposes. The AI response is sent through the outputs as a standard pipeline message.",
            },
            {
                name: "Model",
                description: "Selects the language model used by the AI agent, among the models of the organization's LLM provider (or the ones the platform administrator allowed for the organization). With OpenRouter, models of OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek and others are available through the same provider. The model must support tool calling to use the MCP tools.",
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
                    "Instructions that define the agent's role, behavior, and constraints. This field is required. Procedures that are only needed for some requests can go in skills instead, which keeps the system prompt short.",
            },
            {
                name: "MCP servers (Tools tab)",
                description:
                    "The MCP servers the agent may use. Their tools are named <server>__<tool> (e.g. fem_results__max-value). A node that never changed this setting has all of them. fem_results is only started when the digital twin has FEM results, and documents when the group's knowledge base is enabled and the digital twin may read documents. sensor_history (sensors, statistics, history and latest values from the IoT database) and asset_state (the states the AssetState nodes keep) read only the data of the digital twin's group.",
            },
            {
                name: "Skills (Tools tab)",
                description:
                    "Skills of the platform and of the group (managed in Platform admin and Group admin → Skills). The agent always sees each chosen skill's name and description, and calls load_skill to read its instructions when a request needs them (and read_skill_resource for its other files). A skill can declare the MCP servers it needs (requires_mcp). Changes to a skill reach the agent at its next prompt, without restarting it. The platform's built-in skills (marked built-in) cannot be changed: viewer-ui-options, chosen in new nodes, tells the agent how to change the 3D viewer (uiOpts); answer-format, also chosen in new nodes, how to present tables, matrices, equations and charts of sensor data in the chat; and fem-results-analysis how to query the FEM results. The values specific to the digital twin (object and result names, simulator fields, reset-view values, load factor rule) go in the system prompt.",
            },
            {
                name: "Flow tools (Tools tab)",
                description:
                    "The AI Tool nodes of this pipeline the agent may call, each as the tool flow__<tool name>. A node that never changed this setting may call all of them. Calling one sends the arguments into that flow and waits for the reply of its Publish node set to Reply, so a flow (Function nodes, IoT database, AssetState...) becomes a tool of the agent.",
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
            "'payload.userName' is not used to know who asks: the user comes from the subject the message was published to (or the Telegram chat).",
            "The system prompt is required to define agent behavior.",
        ],
    },
    AiTool: {
        description: "Turns the flow that starts at this node into a tool that the AI Agent nodes of the pipeline can call.",

        details:
            "The AI Tool node declares a tool: its name, a description that tells the model what it does and when to use it, and its parameters. The AI Agent nodes of the same pipeline offer it to their model as flow__<tool name> (in the Flow tools of their Tools tab). When the model calls the tool, the agent checks the arguments against the parameters (required, type, allowed values) and this node sends a message with them into its flow; the flow does whatever it needs (Function nodes, IoT database, AssetState, other nodes) and ends in a Publish node set to Reply, whose payload is the result the model receives. If no reply arrives within the timeout, the model gets an error that says so. The node has no input: only the agents start it.",

        params: [
            {
                name: "Tool name",
                description:
                    "The name of the tool, with letters, digits and '_' (starting with a letter, up to 48 characters). The model sees it as flow__<tool name>, and it must be unique in the pipeline.",
            },
            {
                name: "Description",
                description:
                    "What the tool does, what it returns and when to use it. The model decides whether to call the tool by this text, so it is required and should be specific (units, ranges, meaning of the result).",
            },
            {
                name: "Timeout (s)",
                description: "How long the agent waits for the reply of the flow (1 to 300 seconds, 30 by default).",
            },
            {
                name: "Parameters",
                description:
                    "The arguments of the tool: name, type (text, number, integer, boolean or list), description, whether it is required and, for text, the allowed values. Up to 20; 'userName' and 'toolName' are reserved.",
            },
        ],

        outputExamples: [
            {
                label: "Message sent into the flow",
                code: JSON.stringify(
                    {
                        payload: {
                            windSpeed: 32.5,
                            designWind: 42,
                            toolName: "wind_load",
                            userName: "operator-01",
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Function node that answers (before a Publish node set to Reply)",
                code: [
                    "function process(msg) {",
                    "    const v = msg.payload.windSpeed;",
                    "    const vd = msg.payload.designWind || 42;",
                    "    const lf = (v / vd) ** 2;",
                    "    msg.payload = { loadFactor: lf, safetyFactor: 1 / lf };",
                    "    return msg;",
                    "}",
                ].join("\n"),
            },
        ],

        notes: [
            "The flow must end in a Publish node set to Reply; its payload is what the model receives (as JSON, up to 32 KB).",
            "Function nodes must return the incoming msg (changing msg.payload), not a new object, so that the reply address is kept.",
            "Each call sends its own message, so several calls (from one or several users) can run at the same time.",
            "Errors of the flow show up in the pipeline logs; the model only learns that no reply arrived in time.",
        ],
    },
    Switch: {
        description: "Routes each message to the outputs whose rule holds for one of its fields.",

        details:
            "The Switch node reads one field of the message (the property: a path such as payload.temperature, or topic) and checks it against its rules, in order. Each rule has its own output (→ 0, → 1...). It can stop at the first rule that matches or send the message to every rule that matches, and an optional last output receives the messages no rule matched. The message goes on unchanged (also its reply address, so the node works inside the flow of an AI Tool). Numbers given as text are compared as numbers.",

        params: [
            { name: "Property", description: "Path of the field to check: payload.a.b (or just a.b), payload, or topic. Numeric segments index arrays (payload.values.0)." },
            {
                name: "Rules",
                description:
                    "==, != (numbers or text), <, <=, >, >=, between (inclusive), contains (text, or an element of a list), matches regex, is true, is false, exists, does not exist, is a number, is a text.",
            },
            { name: "When several rules match", description: "Stop at the first one, or send a copy to each." },
            { name: "Otherwise output", description: "One more output, after the rules', for the messages no rule matched." },
        ],

        inputExamples: [
            {
                label: "Rules > 80 (→ 0), between 50 and 80 (→ 1), otherwise (→ 2)",
                code: JSON.stringify({ payload: { temperature: 85.2 } }, null, 2),
            },
        ],

        notes: ["The number of outputs follows the rules: it is not set by hand."],
    },
    Deadband: {
        description: "Report by exception: lets a message through only when its fields changed enough.",

        details:
            "The Deadband node compares the fields of each message with the values of the last message it let through (not the previous one, so slow drifts are not lost). The message passes when any field changed by the band or more: an absolute amount, or a percentage of the last value. Text fields pass whenever they change, and the first message always passes. With a maximum interval, a message passes after that long even if nothing changed (a heartbeat). The key keeps one state per value (per sensor with 'topic'). It reduces what reaches IoT database, alarm or notification nodes. Optionally, a second output receives the blocked messages.",

        params: [
            { name: "Fields", description: "Paths of the fields to watch, comma separated. 'payload' watches the whole payload (any change)." },
            { name: "Band", description: "The minimum change that lets a message through: absolute, or % of the last value sent. 0: any change." },
            { name: "Maximum interval (s)", description: "Let one through after this long even if unchanged (0: never)." },
            { name: "Key", description: "Path whose value separates the states, 'topic' by default. Empty: one state for all messages." },
            { name: "Timestamp field", description: "Path of the message's time (ISO 8601 or epoch ms/s) for the maximum interval; empty: the arrival time." },
            { name: "Second output", description: "Sends the blocked messages to output 1." },
        ],

        inputExamples: [
            {
                label: "Band 0.5 on payload.value: 10 passes, 10.3 and 10.4 are blocked, 10.5 passes",
                code: JSON.stringify({ topic: "dev2pdb_1", payload: { value: 10.5 } }, null, 2),
            },
        ],

        notes: [
            "The state is kept in the digital twin's key-value store and updated atomically, so the node behaves the same with several pipelines replicas.",
            "A message with payload.reset = true clears the node's state; payload.reset = \"<key>\" clears only that key's.",
        ],
    },
    Window: {
        description: "Statistics of numeric fields over windows of messages or of time.",

        details:
            "The Window node computes statistics of one or several numeric fields over a window: of N messages, or of a duration. Fixed (tumbling) windows send their statistics when they end and then start again; time windows start on multiples of the duration (every minute, every 10 minutes...) and are sent when their end passes, even if no more messages arrive. Sliding windows send the statistics of the last N messages or seconds with every message. The key keeps one window per value (per sensor with 'topic'). Messages with a time older than a window already sent are ignored.",

        params: [
            { name: "Numeric fields", description: "Paths of the fields, comma separated. In the output each one is named by its last segment." },
            { name: "Window", description: "Of N messages or of time (seconds); fixed or sliding." },
            {
                name: "Statistics",
                description:
                    "count, sum, mean, min, max, first, last, range, RMS, std. dev. (sample, n-1) and the percentiles p50, p90, p95, p99 (linear interpolation).",
            },
            { name: "Key", description: "Path whose value separates the windows, 'topic' by default. Empty: one window for all." },
            { name: "Timestamp field", description: "Path of the message's time (ISO 8601 or epoch ms/s); empty: the arrival time." },
        ],

        outputExamples: [
            {
                label: "Window of 60 s on Eps_1 and windSpeed",
                code: JSON.stringify(
                    {
                        payload: {
                            key: "dev2pdb_1",
                            windowStart: "2026-11-03T10:00:00.000Z",
                            windowEnd: "2026-11-03T10:01:00.000Z",
                            count: 60,
                            Eps_1: { count: 60, mean: 0.00021, min: 0.00018, max: 0.00025, p95: 0.00024 },
                            windSpeed: { count: 60, mean: 12.4, min: 10.1, max: 15.8, p95: 15.2 },
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        notes: [
            "Sliding windows and percentiles keep the samples: at most 5000 per key. Beyond that the oldest are dropped and the output has \"truncated\": true.",
            "The state is kept in the digital twin's key-value store and updated atomically, so the node behaves the same with several pipelines replicas.",
            "A message with payload.reset = true clears the node's state; payload.reset = \"<key>\" clears only that key's.",
        ],
    },
    Join: {
        description: "Combines the latest value of several sources into one message.",

        details:
            "The Join node keeps the latest value (the payload, by default) of each source and sends them together. All the sources can be wired to its single input: the node does not tell them apart by the wire but by a value carried in each message, read at the key path ('topic' by default). A source is either a topic of the digital twin, which matches the messages that arrive on that topic, or a source id, which matches the messages whose key path holds that value (e.g. key path payload.sensorId and source ids S1 and S2). A message that matches no source is ignored (the logs say so). Each source is named as it appears in the output.\n\nWhen it sends: 'on every message, with the latest value of each source' sends on every message, at first with only the sources that have arrived; 'on every message, once all sources have a value' is silent until every source has a value and then sends on every message, reusing the latest value of the slower sources; 'once per complete set' sends when every source has a value and then empties, so each combination is sent once (a source that arrives again before the others keeps only its latest value). In that mode a timeout, counted from the first message of the set, sends the incomplete set with the list of the missing sources in _missing. A maximum age drops values too old to be combined, in every mode. The output is nested by name, or flat (the payloads merged, the newest wins on repeated fields), with the time of each value in _timestamps.",

        params: [
            {
                name: "Sources",
                description:
                    "Where each source comes from, and its name. 'topic dev2pdb_1': the messages of that topic of the digital twin. 'other source id…': the messages whose key path holds the id written. 'named': the name of the source in the output (empty: the topic reference or the source id).",
            },
            {
                name: "Key path",
                description:
                    "Where each message carries its source id: 'topic' (required, and set automatically, when the sources are topics) or a field such as payload.sensorId. Empty: topic.",
            },
            {
                name: "Send",
                description:
                    "'On every message, with the latest value of each source' (latest): every message, also before all the sources have arrived. 'On every message, once all sources have a value' (all): every message, but only once all have a value. 'Once per complete set' (set): once per combination, then it starts again.",
            },
            { name: "Timeout (s)", description: "Per complete set only: from the first message of a set, send what there is after this long, with _missing (0: wait)." },
            { name: "Maximum age (s)", description: "Values older than this are dropped, so they are not combined with new ones (0: kept)." },
            { name: "Output", description: "Nested by name, or flat." },
            { name: "Value", description: "What is kept of each message: 'payload' by default, or a field of it." },
        ],

        inputExamples: [
            {
                label: "Two sensors on one topic, told apart by payload.sensorId (key path payload.sensorId, sources S1 named left, S2 named right)",
                code: JSON.stringify([{ payload: { sensorId: "S1", strain: 0.00021 } }, { payload: { sensorId: "S2", strain: -0.00012 } }], null, 2),
            },
        ],

        outputExamples: [
            {
                label: "Nested (strain = dev2pdb_1, wind = dev2pdb_2)",
                code: JSON.stringify(
                    {
                        payload: {
                            strain: { Eps_1: 0.00021, Eps_2: -0.00012 },
                            wind: { windSpeed: 12.4, windDirection: 270 },
                            _timestamps: { strain: "2026-11-03T10:00:01.120Z", wind: "2026-11-03T10:00:00.010Z" },
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Messages A1, A2, B1, A3, A4, B2 (A every second, B every 3 s): what each mode sends",
                code: [
                    "arrives  latest    all       set",
                    "A1       {A1}      -         -",
                    "A2       {A2}      -         -",
                    "B1       {A2,B1}   {A2,B1}   {A2,B1}, then empties",
                    "A3       {A3,B1}   {A3,B1}   -   (has A3, waits for B)",
                    "A4       {A4,B1}   {A4,B1}   -   (A4 replaces A3)",
                    "B2       {A4,B2}   {A4,B2}   {A4,B2}, then empties",
                ].join("\n"),
            },
        ],

        notes: [
            "The sources are recognised by the value at the key path, not by the wire they come through.",
            "A node between the Listen and the Join must keep the topic: a Function that returns msg keeps it; one that returns a new object should set topic: msg.topic.",
            "Two branches that come from the same topic have the same topic: give each one a field (e.g. payload.branch) and use it as the key path.",
            "Without sources, every value of the key path is a source, named by itself (only with 'on every message, with the latest value of each source').",
            "The state is kept in the digital twin's key-value store and updated atomically, so the node behaves the same with several pipelines replicas.",
            "A message with payload.reset = true clears the node's state; payload.reset = \"<key>\" clears only that key's.",
        ],
    },
    Watchdog: {
        description: "Says when a source stops sending data, and when it comes back.",

        details:
            "The Watchdog node watches the arrival of messages. Each source (each value of the key: each topic by default) that stays silent for the timeout produces a 'lost' event on output 0, once (or again every 'repeat' seconds while it stays silent); its next message produces a 'restored' event on output 1, with how long it was silent. Expected sources (topics of the digital twin or other key values) are watched from the deployment even if they never send anything. The time a node was stopped (redeployment) is not counted as silence. Optionally, a third output lets the messages through unchanged, so the node can sit in the middle of a flow.",

        params: [
            { name: "Timeout (s)", description: "Silence that counts as lost: a few times the source's usual interval." },
            { name: "Repeat (s)", description: "Warn again every this long while the source stays silent (0: once)." },
            { name: "Key", description: "What separates the sources: 'topic' by default. Empty: the input as a whole." },
            { name: "Expected sources", description: "Sources watched even before their first message, each with a name for the events." },
            { name: "Third output", description: "Lets the messages through unchanged (output 2)." },
        ],

        outputExamples: [
            {
                label: "Output 0: a source lost",
                code: JSON.stringify(
                    {
                        payload: {
                            event: "lost",
                            key: "dev2pdb_1",
                            source: "Strains",
                            lastSeen: "2026-11-03T10:00:00.000Z",
                            silentForSeconds: 10,
                            message: "No data from Strains for 10 s",
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Output 1: back",
                code: JSON.stringify(
                    { payload: { event: "restored", key: "dev2pdb_1", source: "Strains", downtimeSeconds: 312.5, message: "Data from Strains again after 5 min without data" } },
                    null,
                    2,
                ),
            },
        ],

        notes: [
            "The state is kept in the digital twin's key-value store and updated atomically, so the node behaves the same with several pipelines replicas; the clock (timeouts, delays, periods) runs in one replica only.",
            "A message with payload.reset = true clears the node's state; payload.reset = \"<key>\" clears only that key's.",
        ],
    },
    Alarm: {
        description: "An alarm on one field, with Warning and Alarm levels, acknowledgement and shelving.",

        details:
            "The Alarm node watches one field and keeps the state of an alarm, in the spirit of ISA-18.2. The condition can be high (the value reaches or exceeds a level), low (reaches or falls below) or equals (a code, true...), with two levels, Warning and Alarm (either or both). The hysteresis keeps a level until the value is clearly back (an alarm at 25 with hysteresis 1 clears below 24), and the delays require the condition to hold a while before activating or clearing. Events are sent only on transitions: raised, escalated (Warning → Alarm), deescalated, cleared (with its duration and the highest level reached), acknowledged, shelved, unshelved. An active alarm stays unacknowledged until a message with payload.ack arrives; an alarm that clears without acknowledgement stays 'back to normal, unacknowledged'. Shelving silences an alarm for some minutes: its events are not sent and it does not count for the asset status. A latched alarm does not clear by itself: when the value is back to normal it stays 'waiting for a reset' (event latched) and keeps counting for the asset status until a user resets it (event reset, which also acknowledges it), on the Alarms page, with the node's button or with payload.rearm (true: all; a text: one key); if the value goes beyond the level again before, it is the same alarm (event reactivated). The Alarms page (home page) lists the alarms that are not normal of all the digital twins of the user's groups. Each event has a text in 'message', ready for an Email or Telegram node.",

        params: [
            { name: "Property", description: "Path of the field watched." },
            { name: "Condition", description: "high, low or equals." },
            { name: "Levels", description: "Warning and Alarm (either or both), and the units for the texts. For high, Alarm above Warning; for low, below." },
            { name: "Hysteresis", description: "How far back the value must go to leave a level (high and low)." },
            { name: "Delays (s)", description: "On: the condition must hold this long to activate or escalate. Off: to deescalate or clear." },
            { name: "Key", description: "One alarm per value (e.g. per sensor); empty: one alarm." },
            { name: "Latched", description: "Back to normal only with a reset by a user (for trips and protections)." },
            { name: "Status output", description: "Output 1: payload.state = {status, state_description} when the node's status (the worst of its keys) changes, for an Asset state node." },
            {
                name: "Update the asset status directly",
                description:
                    "The node writes the status of the digital twin's asset itself: the worst of the active alarms of all the Alarm nodes that have this option, keeping the other fields of the state. Nothing else should write the status then. Each alarm that is not normal is also listed in the state's 'alarms' (name, level, state, threshold, acknowledgement, shelving), updated when they change and not with each value, and removed when it is back to normal.",
            },
        ],

        inputExamples: [
            { label: "A reading", code: JSON.stringify({ payload: { windSpeed: 26.3 } }, null, 2) },
            { label: "Acknowledge (all keys, or payload.ack = \"<key>\")", code: JSON.stringify({ payload: { ack: true, user: "operator-01" } }, null, 2) },
            { label: "Shelve for 30 minutes (0: unshelve; payload.key: one key)", code: JSON.stringify({ payload: { shelveMinutes: 30 } }, null, 2) },
        ],

        outputExamples: [
            {
                label: "Output 0: raised",
                code: JSON.stringify(
                    {
                        payload: {
                            event: "raised",
                            alarm: "Wind cut-out",
                            level: "Alarm",
                            state: "active_unack",
                            value: 26.3,
                            threshold: "25",
                            raisedAt: "2026-11-03T10:00:00.000Z",
                            message: "ALARM: Wind cut-out, 26.3 m/s ≥ 25 m/s",
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Output 1: the status for an Asset state node",
                code: JSON.stringify({ payload: { state: { status: "Alarm", state_description: "Wind cut-out ≥ 25 m/s" } } }, null, 2),
            },
        ],

        notes: [
            "In the pipeline editor, the bell button of the node lists its alarms that are not normal (the badge counts the ones waiting for acknowledgement), to acknowledge or shelve them one by one or all at once. Only the group's administrators can, with the pipeline running; who pressed is recorded in the event (ackBy).",
            "The user who acknowledges with a message is its sender (web chat, Telegram) or payload.user.",
            "The asset status changes when an alarm changes level, not with every reading.",
            "An alarm of a node deleted from the pipeline stops counting for the asset status at the next deployment.",
            "The state is kept in the digital twin's key-value store and updated atomically, so the node behaves the same with several pipelines replicas; the clock (timeouts, delays, periods) runs in one replica only.",
            "A message with payload.reset = true clears the node's state; payload.reset = \"<key>\" clears only that key's.",
        ],
    },
    MachineState: {
        description: "The operating state of a machine, and its time in each state per day or shift.",

        details:
            "The Machine state node classifies each message with ordered rules (the first that holds sets the state, e.g. Fault, Cut-out, Producing; otherwise the default state, e.g. Stopped). A new state must hold for the minimum duration before it counts, so that signals near a threshold do not make it flicker; once accepted, it counts from when it was first seen. Without messages for the 'unknown after' time, the state becomes Unknown. The node adds up the time in each state and the number of changes per period: the calendar day, or the shifts if their start times are given, in the node's time zone or the group's. Output 0 sends each change of state; output 1 the summary of each period when it ends (and every N minutes if set), the basis of availability and OEE.",

        params: [
            { name: "States", description: "Ordered rules: a state name, a field and an operator (as in the Switch node)." },
            { name: "Otherwise", description: "The state when no rule holds." },
            { name: "Minimum duration (s)", description: "A new state must hold this long to count (against flicker)." },
            { name: "Unknown after (s)", description: "Without data this long, the state is Unknown (0: never)." },
            { name: "Shifts", description: "Start times HH:MM (e.g. 06:00, 14:00, 22:00); empty: the calendar day." },
            { name: "Summary every (min)", description: "A partial summary of the current period every N minutes (0: only at its end)." },
            { name: "Time zone", description: "Of the days and shifts (IANA name); empty: the group's (or UTC)." },
            { name: "Key", description: "One machine per value; empty: a single machine." },
            {
                name: "Show the state in the asset state",
                description:
                    "Each change of state is written in the asset state's 'machines' (state, since, previous state), where the Asset state node, Telegram and the AI agents read it, without a Function and an Asset state node. The asset's status is not changed.",
            },
        ],

        outputExamples: [
            {
                label: "Output 0: a change",
                code: JSON.stringify(
                    { payload: { event: "change", state: "Cut-out", previousState: "Producing", since: "2026-11-03T10:02:00.000Z", previousDurationSeconds: 5400, message: "Producing → Cut-out (after 1 h 30 min)" } },
                    null,
                    2,
                ),
            },
            {
                label: "Output 1: the summary of a day",
                code: JSON.stringify(
                    {
                        payload: {
                            event: "summary",
                            period: "2026-11-03",
                            final: true,
                            durations: { Producing: 61200, Stopped: 21600, "Cut-out": 3600 },
                            percent: { Producing: 70.83, Stopped: 25, "Cut-out": 4.17 },
                            transitions: 6,
                            currentState: "Producing",
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        notes: [
            "To keep the state in the asset, connect output 0 to a Function that writes it into payload.state and then to an Asset state node.",
            "The state is kept in the digital twin's key-value store and updated atomically, so the node behaves the same with several pipelines replicas; the clock (timeouts, delays, periods) runs in one replica only.",
            "A message with payload.reset = true clears the node's state; payload.reset = \"<key>\" clears only that key's.",
        ],
    },
    Rainflow: {
        description: "Counts the stress cycles of a signal (rainflow) and their fatigue damage (Miner's rule).",

        details:
            "The Rainflow node counts the cycles of a stress signal as it arrives (ASTM E1049 rainflow counting, kept between messages: no cycle is lost at the edges of a message) and adds up their Palmgren-Miner damage with an S-N curve: a DNV-RP-C203 category in air or in seawater with cathodic protection, or a custom curve of one or more lines. The field can be a number or an array of samples per message; the scale turns it into stress (e.g. 210000 MPa for a strain of steel). Each day it sends the cycles, their histogram by range and the damage of the day, with the totals since the start: total damage, life consumed, damage rate per year and remaining life at that rate. The same algorithms are available to the Function nodes as go.dsp (Rainflow, GetDNVCurve, MinerDamage...).",

        params: [
            { name: "Field", description: "Path of a number or of an array of samples." },
            { name: "Scale and units", description: "The field times the scale is the stress range unit of the S-N curve (MPa for DNV)." },
            { name: "Gate", description: "Reversals smaller than this (in stress) are ignored as noise." },
            {
                name: "S-N curve",
                description:
                    "DNV-RP-C203 (B1 to W3; in air: knee at 1e7 cycles; in seawater with cathodic protection: knee at 1e6), or custom lines log N = log a − m log S (each range takes the line that gives most cycles). 'Copy to a custom curve' starts from a DNV one.",
            },
            { name: "Corrections", description: "SCF (stress concentration), thickness t over t_ref with exponent k (the DNV one if empty), cutoff (ranges below it do no damage) and DFF (design fatigue factor)." },
            { name: "Histogram bin", description: "Width of the range bins of the histogram." },
            { name: "Design life (years)", description: "Optional: the output compares the damage rate with it (rateToDesign: 1 means on design)." },
            {
                name: "Timestamp field",
                description:
                    "Places each message in its day: by default payload.timestamp, which the Listen node always adds, so delayed or replayed data is counted in the day it belongs to. Timestamps ahead of the clock are taken as now; empty: the arrival time. The clock closes a day on its own only after the signal has been 2 minutes without messages.",
            },
        ],

        outputExamples: [
            {
                label: "Summary of a day",
                code: JSON.stringify(
                    {
                        payload: {
                            event: "summary",
                            period: "2026-11-03",
                            final: true,
                            cycles: 4321.5,
                            damage: 2.1e-6,
                            maxRange: 38.4,
                            histogram: [{ from: 0, to: 10, count: 4100 }, { from: 10, to: 20, count: 200 }],
                            curve: "DNV-RP-C203 D (seawater_cp)",
                            damageTotal: 3.4e-4,
                            lifeConsumedPercent: 0.034,
                            damageRatePerYear: 7.7e-4,
                            remainingLifeYears: 1298,
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        notes: [
            "The counting only sees the samples it gets: sample well above the structure's frequencies, or the peaks (and the damage) are underestimated.",
            "The damage rate is given after a day of data, so that one storm is not extrapolated to years.",
            "The state is kept in the digital twin's key-value store and updated atomically, so the node behaves the same with several pipelines replicas.",
            "A message with payload.reset = true clears the node's state; payload.reset = \"<key>\" clears only that key's.",
        ],
    },
    Vibration: {
        description: "Vibration features of blocks of samples: levels, impulsiveness, bands and the dominant frequency.",

        details:
            "The Vibration node computes, for each block of samples, the indicators of condition monitoring: RMS, peak, peak-to-peak, crest factor and impulse factor (impacts, e.g. early bearing damage), kurtosis (3 for random vibration, higher when the signal becomes impulsive) and skewness; from the Welch spectrum, the RMS in each band, the dominant frequency with its damping ratio (from the half-power bandwidth) and, for an acceleration, the velocity RMS of ISO 10816/20816. A block is an array of samples in one message (a burst of a vibration sensor), or a window of single values gathered by the node, every N samples (or with overlap, with a smaller step). A drift of a structure's natural frequency, followed with the dominant frequency, may point to a loss of stiffness. The same computation is available to the Function nodes as go.dsp.VibrationFeatures.",

        params: [
            { name: "Input", description: "Single values gathered into windows, or a block (array) per message." },
            { name: "Sampling rate", description: "Hz. For blocks, it can come from a field of the message." },
            { name: "Window / Step", description: "Stream: samples per window and between windows (step 0: the window, no overlap)." },
            { name: "Bands", description: "Frequency bands (Hz) whose RMS is given, by name." },
            { name: "Dominant frequency search", description: "The band where the dominant peak is searched (0: all)." },
            { name: "Velocity RMS", description: "Of an acceleration in m/s² or g, over a band (10–1000 Hz in ISO 10816), in mm/s." },
        ],

        outputExamples: [
            {
                label: "A window",
                code: JSON.stringify(
                    {
                        payload: {
                            samples: 256,
                            fs: 1,
                            rms: 0.71,
                            peak: 1.02,
                            crestFactor: 1.44,
                            kurtosis: 1.6,
                            dominantFrequency: 0.1,
                            dominantDamping: 0.012,
                            bands: { mode1: 0.69 },
                            resolutionHz: 0.0078,
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        notes: [
            "The frequencies seen go up to half the sampling rate (Nyquist): 1 Hz sampling shows up to 0.5 Hz.",
            "Streams keep at most 32768 samples per key.",
            "The state is kept in the digital twin's key-value store and updated atomically, so the node behaves the same with several pipelines replicas.",
            "A message with payload.reset = true clears the node's state; payload.reset = \"<key>\" clears only that key's.",
        ],
    },
    Anomaly: {
        description: "Flags the values that leave their recent behaviour, without a trained model.",

        details:
            "The Anomaly node judges one field of every message against a baseline learnt from the data itself, with one of three methods: Z-score (distance to the mean of the latest normal samples, in standard deviations: for spikes), EWMA control chart (an exponentially weighted mean compared with limits around the baseline learnt in the warm-up: for small persistent shifts such as drift or a lost calibration) or IQR (Tukey fences around the quartiles of the latest samples: robust with skewed data). Until the warm-up is over, nothing is judged. By default the anomalous samples do not enter the baseline, so that a fault does not become normal. Every message goes on with the verdict in payload.anomaly (isAnomaly, score, limits, baseline and, for anomalies, a text in message); an optional second output gets only the anomalies. With a key, each sensor has its own detector. The same detectors are available to the Function nodes as go.dsp.DetectAnomalies.",

        params: [
            { name: "Method", description: "Z-score, EWMA or IQR." },
            { name: "Window", description: "Z-score and IQR: the baseline, the latest normal samples (up to 5000)." },
            { name: "Threshold / L / k", description: "Z-score: |z| (3); EWMA: L sigmas of the chart (3); IQR: k (1.5, or 3 for extreme values)." },
            { name: "Lambda", description: "EWMA: weight of the newest sample; smaller values detect smaller shifts, later." },
            { name: "Baseline adaptation", description: "EWMA: how fast the baseline follows the normal samples (0: frozen after the warm-up)." },
            { name: "Warm-up", description: "Samples learnt before judging." },
        ],

        outputExamples: [
            {
                label: "An anomaly",
                code: JSON.stringify(
                    {
                        payload: {
                            Eps_1: 0.00042,
                            anomaly: {
                                method: "zscore",
                                ready: true,
                                isAnomaly: true,
                                value: 0.00042,
                                score: 7.3,
                                lower: 0.000012,
                                upper: 0.000098,
                                baseline: 0.000055,
                                message: "Anomaly in Eps_1: 0.00042, score 7.30, expected 1.2e-05..9.8e-05 (zscore)",
                            },
                        },
                    },
                    null,
                    2,
                ),
            },
        ],

        notes: [
            "An Alarm node with condition equals 'true' on payload.anomaly.isAnomaly makes an alarm of it.",
            "The state is kept in the digital twin's key-value store and updated atomically, so the node behaves the same with several pipelines replicas.",
            "A message with payload.reset = true clears the node's state; payload.reset = \"<key>\" clears only that key's.",
        ],
    },
    PoseEstimation: {
        description: "The pose of a camera with respect to a known object, from named 2D keypoints; drives the viewer's camera and moving parts.",

        details:
            "The Pose estimation node solves the Perspective-n-Point problem: from the pixels of named keypoints of an object (a YOLO-pose model run by an ML model node, the corners of ArUco markers, points clicked by hand...) and their 3D positions on the object, it finds where the camera is and where it looks. The camera is calibrated (OpenCV's camera matrix and distortion coefficients, pasted as JSON; without calibration a field of view is assumed, measured on the vertical, horizontal or longer side of the image). Wrong keypoints are left out (RANSAC on the reprojection error) and the pose is refined (Levenberg-Marquardt) and smoothed with a Kalman filter. In camera mode (a phone walked around a still object) the result is the camera's pose in the model's coordinates, and payload.camera makes the 3D viewer's camera follow it when the message is published to dtm2sim. In object mode (a camera on a tripod, the object moves) the result is the motion of the object since the first frame: position, quaternion and angles, and payload.customAnimation can move its node in the viewer. Moving parts are measured with the pose: the keypoints of a rotation (the blade tips of a rotor) give its angle around an axis, unwrapped across frames, with its angular velocity and rpm; those of a translation give a displacement along an axis. A rotor of n alike blades looks the same every 360°/n: it must turn less than half of that between frames (60° for 3 blades) unless its direction or expected speed is set, which raises the limit to 360°/n; the node warns when a part gets close.",

        params: [
            { name: "Mode", description: "camera: the camera moves around a still object; object: a still camera films a moving object." },
            { name: "Keypoints", description: "Path of the detections (payload.detections, from the YOLO-pose post-processing) or of named keypoints: {name: {x, y, conf}}, {name: [x, y, conf]} or [{name, x, y, conf}]. Detections bring their keypoints in the model's order: name them in Keypoint names." },
            { name: "Class", description: "With several classes, the detection used (the most confident of this class)." },
            { name: "Keypoint names by class", description: "JSON {class: [names]}: an object detected as several classes (a turbine and its rotor); the most confident detection of each class, its keypoints named in the model's order." },
            { name: "Minimum confidence", description: "Keypoints less confident are left out (0.5)." },
            { name: "3D points", description: "JSON: {name: [x, y, z]} in metres. In the glb's coordinates (Y up) the result is in the viewer's; from Blender (Z up) choose Blender and they are converted as the glTF exporter does." },
            { name: "Calibration", description: "JSON of OpenCV's calibration: camera_matrix (3×3) and dist_coeffs (k1, k2, p1, p2, k3), with the image size of the calibration (image_width, image_height). Frames of another size with the same aspect are scaled; rotated frames are refused." },
            { name: "Moving parts", description: "JSON list: name, type (rotation or translation), keypoints, axisOrigin (a point name or [x, y, z]), axisDirection, symmetry (number of alike blades), restAngles {keypoint: degrees} with zeroDirection instead of 3D points for the keypoints, direction (any, positive, negative: right hand around the axis), expectedSpeed (rad/s or m/s), nodeName (the name of the glb node the viewer turns or moves: the rotor group with its blades, hub and cap)." },
            { name: "Inlier threshold", description: "Pixels: a keypoint further from where the pose puts it is an outlier (8)." },
            { name: "Smoothing", description: "Kalman filter: noise of a measured pose (metres plus a fraction of the camera distance, degrees) and how fast the motion may change (accelerations); after a gap longer than Reset after, it starts again." },
            { name: "Max jump", description: "A pose further than this from the previous one (degrees, or a fraction of the camera distance) is left out, to output 1, until Frames to confirm frames agree: a flipped pose (keypoints nearly on a plane have two mirrored poses) or a close-up where the detector bunches the keypoints up does not move the viewer. After a gap, the first pose waits for a second that agrees. 0 turns the check off." },
        ],

        outputExamples: [
            {
                label: "Camera mode, with a rotor",
                code: JSON.stringify(
                    {
                        payload: {
                            pose: {
                                ok: true,
                                mode: "camera",
                                points: 11,
                                inliers: 11,
                                outliers: [],
                                reprojectionError: 0.84,
                                distance: 2.31,
                                camera: { position: [0.65, 1.13, 2.09], quaternion: [-0.07, 0.15, 0.01, 0.986], fov: 39.6 },
                                parts: {
                                    rotor: { type: "rotation", observed: 3, ready: true, angle: 212.4, angleUnwrapped: 1652.4, angularVelocity: 6.27, rpm: 59.9, stepPerFrame: 35.9, quaternion: [0, 0, -0.9, 0.43] },
                                },
                            },
                            camera: { position: [0.65, 1.13, 2.09], quaternion: [-0.07, 0.15, 0.01, 0.986], fov: 39.6, projection: "perspective", follow: true },
                            customAnimation: { Rotor: { quaternion: [0, 0, -0.9, 0.43] } },
                        },
                    },
                    null,
                    2,
                ),
            },
            {
                label: "Output 1: a frame without a pose",
                code: JSON.stringify({ payload: { pose: { ok: false, reason: "4 keypoints of the rigid body, 6 needed" } } }, null, 2),
            },
        ],

        notes: [
            "Publish output 0 to the digital twin's dtm2sim topic: the viewer's camera follows payload.camera (with a Release button) and payload.customAnimation turns the parts.",
            "The camera position is in the model's units: give the 3D points in metres, measured on the same glb the viewer shows.",
            "Keep the image in the orientation it was calibrated in (landscape or portrait).",
            "The state (the last pose, the filters) is kept in the digital twin's key-value store and updated atomically; with a key, each camera has its own.",
            "A message with payload.reset = true clears the node's state (in object mode, the next frame becomes the reference).",
        ],
    },
    Totalizer: {
        description: "Daily amounts and totals since the start of counters, rates and events.",
        details:
            "The Totalizer node turns signals into amounts per day and totals since the start. Each item reads one field in one of three modes. Counter: a cumulative reading (energy meter, piece counter of a PLC, hour meter); the amount is the increase between readings. A decrease is a rollover (when 'rollover at' is set: e.g. 4294967295 for a 32-bit counter) or a counter that restarted from zero, and an increase larger than 'max step' is taken as a meter change or a spike and not counted (the reading becomes the new reference). Rate: a rate (power, flow, speed) integrated over time with the trapezoidal rule, per second, minute, hour or day of the rate (kW per hour gives kWh); gaps longer than 'max gap' are not integrated, so no amount is made up. Events: each message adds the field's number, or 1 when the field is empty (pieces, starts, cycles). Every amount is multiplied by the item's factor. The messages are placed in their day by their timestamp (payload.timestamp by default), so delayed or replayed data goes to its own day.",
        params: [
            { name: "Items", description: "Name, unit, mode, field and factor of each amount; the counter's rollover and maximum step, and the rate's time unit and maximum gap." },
            { name: "Summary every (min)", description: "Optional partial summaries during the day, besides the final one at its end." },
            { name: "Timestamp field", description: "Places each message in its day; empty: the arrival time. The clock closes a day on its own only after 2 minutes without messages." },
            { name: "Key", description: "One total per value (e.g. per meter); empty: one for all the messages." },
        ],
        outputExamples: [
            {
                label: "End of a day",
                code: JSON.stringify(
                    {
                        payload: {
                            event: "summary",
                            period: "2026-11-03",
                            final: true,
                            since: "2026-10-01T00:00:00.000Z",
                            values: {
                                energy: { amount: 1834.5, total: 51230.2, unit: "kWh", mode: "counter", readings: 1440, lastReading: 984211.7 },
                                starts: { amount: 3, total: 87, unit: "", mode: "events", readings: 3 },
                            },
                        },
                    },
                    null,
                    2,
                ),
            },
        ],
        notes: [
            "A segment of a rate, or the increase of a counter, goes to the day of the message that closes it.",
            "The state is kept in the digital twin's key-value store and updated atomically, so the node behaves the same with several pipelines replicas.",
            "A message with payload.reset = true clears the node's state; payload.reset = \"<key>\" clears only that key's.",
        ],
    },

    OEE: {
        description: "Overall Equipment Effectiveness per shift or day: availability × performance × quality.",
        details:
            "The OEE node computes the OEE of a machine from its states and its pieces. The states come in messages with a state field: by default the change events of a Machine state node (payload.state, at the time in payload.since), so it is wired after its first output. Production states make run time; planned stop states (changeover, cleaning...) are left out of the planned production time; any other state is downtime, Unknown too unless it is set to be left out. The calendar's planned stops (daily breaks, non-working weekdays and holidays) are not a loss when the machine is stopped; if it produces, that time counts as run time. The pieces come in count fields (total, good and/or rejected; the missing one is derived), as increments or as cumulative counters, and may come in other messages than the states (e.g. from a Listen node). Availability = run / (run + downtime); Performance = ideal cycle time × total pieces / run; Quality = good / total. The times are accounted with the clock: a state lasts until it changes.",
        params: [
            { name: "Machine state", description: "Field of the state and of the time it began (payload.state and payload.since of a Machine state node)." },
            { name: "Production / planned stop states", description: "Comma separated state names; the rest are downtime." },
            { name: "Pieces", description: "Fields of the total, good and rejected pieces, and whether they are increments or cumulative counters." },
            { name: "Ideal cycle time (s)", description: "Seconds per piece at nominal speed: the reference of the performance." },
            { name: "Shifts", description: "Start times of the shifts (as in the Machine state node); empty: the calendar day." },
            { name: "Breaks, non-working days, holidays", description: "The planned stops of the calendar." },
        ],
        outputExamples: [
            {
                label: "End of a shift",
                code: JSON.stringify(
                    {
                        payload: {
                            event: "summary",
                            period: "2026-11-03 06:00",
                            final: true,
                            oee: 67.86,
                            availability: 78.57,
                            performance: 90.91,
                            quality: 95,
                            times: { run: 19800, downtime: 5400, plannedStop: 1800, calendarStop: 1800, excluded: 0, plannedProductionTime: 25200 },
                            downtimeByState: { Stopped: 5400 },
                            counts: { total: 600, good: 570, reject: 30 },
                            losses: { availabilitySeconds: 5400, performanceSeconds: 1800, qualityPieces: 30 },
                            currentState: "Running",
                        },
                    },
                    null,
                    2,
                ),
            },
        ],
        notes: [
            "The ratios are percentages; a ratio without data (e.g. no run time) is left out, and then so is the OEE.",
            "A performance above 100 % means the ideal cycle time is too long.",
            "A message with payload.reset = true clears the node's state; payload.reset = \"<key>\" clears only that key's.",
        ],
    },

    Degradation: {
        description: "Trend of a health indicator and its remaining useful life (RUL) to a failure threshold.",
        details:
            "The Degradation node follows a health indicator over weeks or months (the RMS of a Vibration node, a bearing temperature over ambient, the efficiency of a pump, the damage of a Rainflow node...) and estimates the time until its trend reaches a failure threshold. The samples are averaged per hour or per day (up to 5000 buckets per key are kept, so the history can be longer than the IoT database's retention). Each time a bucket closes, a linear or exponential trend is fitted on the buckets of the trend window and an estimate is sent: the remaining useful life in days with a band from the uncertainty of the slope (about 95 %), the date it is reached and a health index from 100 % at the healthy value to 0 % at the threshold. A flat or improving trend gives the status 'stable'. At start, it can load the history of the indicator from the IoT database: the stored messages of a topic of the asset (dev2pdb) or of the digital twin (dtm2pdb), over the trend window but never beyond the data retention, once. The same fit is available to the Function nodes as go.dsp.EstimateRUL.",
        params: [
            { name: "Health indicator", description: "Path of the number that gets worse with wear." },
            { name: "Failure threshold", description: "The value at which the part is due, and whether the indicator rises or falls towards it." },
            { name: "Healthy value", description: "100 % of the health index; empty: the oldest value kept." },
            { name: "Trend", description: "Linear, or exponential (all the values must be > 0), on the means per hour or per day." },
            { name: "Trend window (days)", description: "The latest days the trend is fitted on." },
            { name: "Minimum points", description: "Buckets needed for an estimate; before that the status is 'insufficient'." },
            { name: "History at start", description: "Topic and field of the stored messages loaded once at start. After a reset (e.g. the part was replaced) it is not loaded again." },
        ],
        outputExamples: [
            {
                label: "Estimate",
                code: JSON.stringify(
                    {
                        payload: {
                            event: "estimate",
                            at: "2026-11-04T00:00:00.000Z",
                            value: 3.95,
                            fitted: 3.93,
                            model: "linear",
                            status: "degrading",
                            slopePerDay: 0.05,
                            r2: 0.98,
                            points: 30,
                            rulDays: 63.4,
                            rulLowDays: 58.2,
                            rulHighDays: 69.6,
                            failureDate: "2027-01-06T09:36:00.000Z",
                            healthPercent: 62.2,
                            threshold: 7.1,
                            message: "Remaining useful life 63.4 days (58.2 to 69.6)",
                        },
                    },
                    null,
                    2,
                ),
            },
        ],
        notes: [
            "An Alarm node on payload.rulDays (e.g. below 30) gives an early warning by Email or Telegram.",
            "It is a trend extrapolation, not a trained model: for that, use the ML model node.",
            "A message with payload.reset = true clears the node's state (e.g. after replacing the part); payload.reset = \"<key>\" clears only that key's.",
        ],
    },

    Approval: {
        description: "Holds a message until a group administrator approves or rejects it, on the Approvals page or in Telegram.",
        details:
            "The Approval node puts a person in the loop before an action, such as a command to a PLC or a device (dtm2dev), a change of setpoint or an action proposed by an AI agent. Each message becomes a pending request and waits until it is approved or rejected, or until it expires. Only the administrators of the digital twin's group (and those of its organization and the platform) can decide. On the Approvals page (from the home page), the group's administrators see the pending requests of all the digital twins of their groups, by asset, with Approve and Reject and an optional comment: the decision goes on the user's own NATS subject, so pipelines knows who decided. In Telegram, each request is sent to the chat with Approve and Reject buttons; only administrators who have linked their Telegram account in their profile (a code sent to the organization's bot as /link <code>) can decide, and the message then shows the decision. The pending requests are kept in the digital twin's key-value store: any pipelines replica can take a decision and only the first one counts.",
        params: [
            { name: "Decided from", description: "The Approvals page (home page), Telegram, or both." },
            { name: "Telegram chat id", description: "Where the requests are sent (negative for groups); the organization must have Telegram enabled." },
            { name: "Title and detail field", description: "What is asked, and a field of the message shown with it (e.g. the command)." },
            { name: "Expires after (min)", description: "A request not decided by then goes to output 2; 0: never." },
        ],
        outputExamples: [
            {
                label: "Approved (output 0)",
                code: JSON.stringify(
                    {
                        payload: {
                            setpoint: 42,
                            approval: {
                                requestId: "K7PX2MQA9R",
                                decision: "approved",
                                title: "New setpoint",
                                requested: "2026-11-03T10:00:00.000Z",
                                decided: "2026-11-03T10:04:12.000Z",
                                by: "ana",
                                via: "telegram",
                            },
                        },
                    },
                    null,
                    2,
                ),
            },
        ],
        notes: [
            "Outputs: 0 approved, 1 rejected, 2 expired (the original message with payload.approval), 3 a notice of each new request, to wire to an Email or Telegram node.",
            "At most 100 requests wait at a time; more are rejected at once.",
            "A Telegram account is linked from the user's profile in the platform.",
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
                    "The model used to perform the translation, among the models of the organization's LLM provider. When none is chosen, the organization's first allowed model is used, or gpt-4o-mini.",
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
            "The charts of the message ('payload.charts', which an AiAgent node adds to its answer) are shown after the text, each with its title; they go inside the email, so they are seen without loading anything.",
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
            "The charts of the message ('payload.charts', which an AiAgent node adds to its answer) are sent after the text as photos (an album when there are several), each with its title as caption.",
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
            "The AssetState node manages asset state information in the IoT DB (the asset state table of the platform's time-series database), where the TelegramListen node reads it too. It supports three actions. 'Set or update state of current asset' stores the current asset state, and sends a message on its output only when the status changes (with status, previousStatus, the state and a text in 'message'), so that any change of status can be notified by an Email or Telegram node, whoever sets it. In that mode, the state can come from a custom JSON object configured in the node or from 'msg.payload.state', and it replaces the stored one except its 'alarms' and 'machines', which the Alarm and Machine state nodes write. 'Get state of current asset' reads the current asset state and adds it to the outgoing payload under 'state', together with 'state_description'. 'Get states of assets in current group' reads the states of all assets in the current group and adds them to the outgoing payload under 'assetStates'. An asset whose state has never been set has the status 'Unknown'. When reading state data, the node ensures that 'status' is always present, defaulting to 'Unknown' if missing. It also ensures that 'state_description' is present when returning state information.",

        params: [
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
