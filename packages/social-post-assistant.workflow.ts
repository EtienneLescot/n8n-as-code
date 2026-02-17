import { workflow, node, links } from '@n8n-as-code/transformer';

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'Sf2QL3dOmki36AUn',
    name: 'Social Post Assistant',
    active: false,
    settings: { timeSavedMode: 'fixed' },
})
export class SocialPostAssistantWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        name: '🎯 Webhook: Message Reçu',
        type: 'n8n-nodes-base.webhook',
        version: 2,
        position: [-2320, -544],
    })
    WebhookMessageReu = {
        httpMethod: 'POST',
        path: 'discord-bot-intelligent',
        options: {},
    };

    @node({
        name: '💬 Discord: Accusé',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [-2096, -544],
        credentials: { discordBotApi: { id: 'YssgTWUIvCzBECMT', name: 'Discord Bot account' } },
    })
    DiscordAccus = {
        resource: 'message',
        operation: 'sendAndWait',
        guildId: {
            __rl: true,
            value: '1451176310788460624',
            mode: 'list',
            cachedResultName: 'Stimm',
            cachedResultUrl: 'https://discord.com/channels/1451176310788460624',
        },
        channelId: {
            __rl: true,
            value: '1451176311484846264',
            mode: 'list',
            cachedResultName: 'général',
            cachedResultUrl: 'https://discord.com/channels/1451176310788460624/1451176311484846264',
        },
        message: 'Bienvenue, cliquez sur le lien pour accéder au formulaire de création de post',
        responseType: 'customForm',
        formFields: {
            values: [
                {
                    fieldLabel: 'Social post brief',
                    fieldType: 'textarea',
                    placeholder: '📌 **Sujet:**  🎭 **Ton:**  👥 **Audience:**  🎯 **Objectif:**  📱 **Plateforme:**',
                },
            ],
        },
        options: {},
    };

    @node({
        name: '🧠 Agent Orchestrateur',
        type: '@n8n/n8n-nodes-langchain.agent',
        version: 3,
        position: [-1872, -544],
    })
    AgentOrchestrateur = {
        promptType: 'define',
        text: "={{ $json.data['Social post brief'] }}",
        hasOutputParser: true,
        options: {
            systemMessage:
                'You are the Orchestrator Agent.\n\n## Task\nAnalyze the user’s message and the conversation history. Determine whether you have enough information to deduce the following five elements:\n- **Topic** (main subject of the post)\n- **Platform** (social media platform: LinkedIn, X/Twitter, Facebook, Instagram, Reddit, YouTube, etc.)\n- **Audience** (target audience demographics/interests)\n- **Tone** (professional, casual, humorous, persuasive, etc.)\n- **Objective** (educate, promote, engage, sell, inform, etc.)\n\n## Decision Rules\n- If you can deduce **a majority (3 or more)** of the elements, you may infer the missing ones based on context.\n- If the user explicitly asks you to find elements yourself, do so (e.g., “find a good topic about X”).\n- If you have **all five elements** (either provided or deduced), set needs_details to false.\n- Otherwise, set needs_details to true and await clarification.\n\n## Output\nReturn a JSON object with the five elements (filled or empty) and the needs_details boolean.',
            maxIterations: 5,
        },
    };

    @node({
        name: '💾 Mémoire',
        type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
        version: 1.3,
        position: [-1792, -320],
    })
    Mmoire = {
        sessionIdType: 'customKey',
        sessionKey: '=orch_{{ $execution.id }}',
        contextWindowLength: 15,
    };

    @node({
        name: '✅ Infos Complètes ?',
        type: 'n8n-nodes-base.switch',
        version: 3.2,
        position: [-1296, -608],
    })
    InfosCompltes = {
        rules: {
            values: [
                {
                    conditions: {
                        options: {
                            caseSensitive: true,
                            leftValue: '',
                            typeValidation: 'strict',
                            version: 2,
                        },
                        conditions: [
                            {
                                leftValue: '={{ $json.output.needs_details }}',
                                rightValue: 'f',
                                operator: {
                                    type: 'boolean',
                                    operation: 'false',
                                    singleValue: true,
                                },
                                id: 'cc7e24a5-bb1a-4c6c-a6f2-798b8d0f88df',
                            },
                        ],
                        combinator: 'and',
                    },
                },
                {
                    conditions: {
                        options: {
                            caseSensitive: true,
                            leftValue: '',
                            typeValidation: 'strict',
                            version: 2,
                        },
                        conditions: [
                            {
                                id: 'e72887f2-51f1-4546-91e4-b703d13b84ab',
                                leftValue: '={{ $json.output.needs_details }}',
                                rightValue: 'true',
                                operator: {
                                    type: 'boolean',
                                    operation: 'false',
                                    singleValue: true,
                                },
                            },
                        ],
                        combinator: 'and',
                    },
                },
            ],
        },
        options: {
            fallbackOutput: 1,
        },
    };

    @node({
        name: '📋 Discord: Demander Validation',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [-1072, -656],
        credentials: { discordBotApi: { id: 'YssgTWUIvCzBECMT', name: 'Discord Bot account' } },
    })
    DiscordDemanderValidation = {
        resource: 'message',
        operation: 'sendAndWait',
        guildId: {
            __rl: true,
            value: '1451176310788460624',
            mode: 'list',
            cachedResultName: 'Stimm',
            cachedResultUrl: 'https://discord.com/channels/1451176310788460624',
        },
        channelId: {
            __rl: true,
            value: '1451176311484846264',
            mode: 'id',
        },
        message:
            '=✅ **Infos collectées !**\n\n📌 **Sujet:** {{ $json.output.Sujet }}\n🎭 **Ton:** {{ $json.output.Ton }}\n👥 **Audience:** {{ $json.output.Audience }}\n🎯 **Objectif:** {{ $json.output.Objectif }}\n📱 **Plateforme:** {{ $json.output.Plateforme }}\n\n👍 **Confirmez-vous ?** (répondez oui pour générer)',
        options: {},
    };

    @node({
        name: '❓ Discord: Poser Question',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [-1072, -448],
        credentials: { discordBotApi: { id: 'YssgTWUIvCzBECMT', name: 'Discord Bot account' } },
    })
    DiscordPoserQuestion = {
        resource: 'message',
        operation: 'sendAndWait',
        guildId: {
            __rl: true,
            value: '1451176310788460624',
            mode: 'list',
            cachedResultName: 'Stimm',
            cachedResultUrl: 'https://discord.com/channels/1451176310788460624',
        },
        channelId: {
            __rl: true,
            value: '1451176311484846264',
            mode: 'id',
        },
        message:
            '=✅ **Merci de donner des informations supplémentaires !**\n\n📌 **Sujet:** \n🎭 **Ton:** \n👥 **Audience:** \n🎯 **Objectif:** \n📱 **Plateforme:**',
        responseType: 'customForm',
        formFields: {
            values: [
                {
                    fieldLabel: 'Social post brief',
                    fieldType: 'textarea',
                    placeholder: '📌 **Sujet:**  🎭 **Ton:**  👥 **Audience:**  🎯 **Objectif:**  📱 **Plateforme:**',
                },
            ],
        },
        options: {},
    };

    @node({
        name: '💭 Discord: Génération',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [-848, -656],
        credentials: { discordBotApi: { id: 'YssgTWUIvCzBECMT', name: 'Discord Bot account' } },
    })
    DiscordGnration = {
        resource: 'message',
        guildId: {
            __rl: true,
            value: '1451176310788460624',
            mode: 'list',
            cachedResultName: 'Stimm',
            cachedResultUrl: 'https://discord.com/channels/1451176310788460624',
        },
        channelId: {
            __rl: true,
            value: '1451176311484846264',
            mode: 'id',
        },
        content: '⏳ Génération du post en cours...',
        options: {},
    };

    @node({
        name: '✍️ Agent Rédacteur',
        type: '@n8n/n8n-nodes-langchain.agent',
        version: 3,
        position: [-288, -656],
    })
    AgentRdacteur = {
        promptType: 'define',
        text: '=Crée un post selon le brief suivant :\n\n{{ $json.output }}',
        hasOutputParser: true,
        options: {
            systemMessage:
                "=You are a social media writer. Current date: {{ $now.format('DDD') }}. Follow this workflow: (1) Use NewsTool to research current facts and data, (2) Use CreativityTool to generate hooks and angles, (3) Draft the post combining research and creativity, (4) Use FactCheckerTool to verify all claims, (5) Finalize the post with any corrections. Create engaging, accurate content matching the platform, tone, and audience. MANDATORY: Always use the context and only the context written by your tools to redact the post. Never invent facts or sources. At the end of your final post, include a 'Sources:' section with ALL URLs collected from NewsTool, CreativityTool, and FactCheckerTool. Use clickable markdown links format [Source Name](URL).",
            maxIterations: 12,
        },
    };

    @node({
        name: '🎉 Discord: Post Final',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [1008, -784],
        credentials: { discordBotApi: { id: 'YssgTWUIvCzBECMT', name: 'Discord Bot account' } },
    })
    DiscordPostFinal = {
        resource: 'message',
        operation: 'sendAndWait',
        guildId: {
            __rl: true,
            value: '1451176310788460624',
            mode: 'list',
            cachedResultName: 'Stimm',
            cachedResultUrl: 'https://discord.com/channels/1451176310788460624',
        },
        channelId: {
            __rl: true,
            value: '1451176311484846264',
            mode: 'id',
        },
        message: '=Votre post est prêt :\n\n{{ $json.output }}',
        responseType: 'customForm',
        formFields: {
            values: [
                {
                    fieldLabel: 'Que pensez-vous de ce post ?',
                    fieldType: 'textarea',
                },
            ],
        },
        options: {},
    };

    @node({
        name: '💾 Mémoire2',
        type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
        version: 1.3,
        position: [-256, -432],
    })
    Mmoire2 = {
        sessionIdType: 'customKey',
        sessionKey: '=redac_{{ $execution.id }}',
        contextWindowLength: 15,
    };

    @node({
        name: '✅ Infos Complètes ?1',
        type: 'n8n-nodes-base.switch',
        version: 3.2,
        position: [1584, -784],
    })
    InfosCompltes1 = {
        rules: {
            values: [
                {
                    conditions: {
                        options: {
                            caseSensitive: true,
                            leftValue: '',
                            typeValidation: 'strict',
                            version: 2,
                        },
                        conditions: [
                            {
                                leftValue: '={{ $json.output.approved }}',
                                rightValue: 'f',
                                operator: {
                                    type: 'boolean',
                                    operation: 'true',
                                    singleValue: true,
                                },
                                id: 'cc7e24a5-bb1a-4c6c-a6f2-798b8d0f88df',
                            },
                        ],
                        combinator: 'and',
                    },
                },
                {
                    conditions: {
                        options: {
                            caseSensitive: true,
                            leftValue: '',
                            typeValidation: 'strict',
                            version: 2,
                        },
                        conditions: [
                            {
                                id: 'e72887f2-51f1-4546-91e4-b703d13b84ab',
                                leftValue: '={{ $json.output.approved }}',
                                rightValue: 'true',
                                operator: {
                                    type: 'boolean',
                                    operation: 'false',
                                    singleValue: true,
                                },
                            },
                        ],
                        combinator: 'and',
                    },
                },
            ],
        },
        options: {
            fallbackOutput: 'none',
        },
    };

    @node({
        name: '🎉 Discord: Post Final1',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [1808, -544],
        credentials: { discordBotApi: { id: 'YssgTWUIvCzBECMT', name: 'Discord Bot account' } },
    })
    DiscordPostFinal1 = {
        resource: 'message',
        operation: 'sendAndWait',
        guildId: {
            __rl: true,
            value: '1451176310788460624',
            mode: 'list',
            cachedResultName: 'Stimm',
            cachedResultUrl: 'https://discord.com/channels/1451176310788460624',
        },
        channelId: {
            __rl: true,
            value: '1451176311484846264',
            mode: 'id',
        },
        message:
            'Votre post a été validé ! Souhaitez-vous une illustration pour celui-ci ?\nrépondez par oui ou non ou indiquez vos instructions pour la création de cette image si vous en avez.',
        responseType: 'customForm',
        formFields: {
            values: [
                {
                    fieldLabel: 'image answer',
                    fieldType: 'textarea',
                    placeholder: "Répondez par oui, non, ou donnez vos instructions pour l'image désirée.",
                },
            ],
        },
        options: {},
    };

    @node({
        name: '🧠 Agent: Illustration Decision',
        type: '@n8n/n8n-nodes-langchain.agent',
        version: 3.1,
        position: [2032, -544],
    })
    AgentIllustrationDecision = {
        promptType: 'define',
        text: "={{ $json.data['image answer'] }}",
        hasOutputParser: true,
        options: {
            systemMessage:
                "Analyze the user's response about the illustration request. Return a JSON with illustration (boolean) and illustration_instructions (string).",
        },
    };

    @node({
        name: '🧭 Illustration Routing',
        type: 'n8n-nodes-base.switch',
        version: 3.2,
        position: [2384, -320],
    })
    IllustrationRouting = {
        rules: {
            values: [
                {
                    conditions: {
                        options: {
                            caseSensitive: true,
                            leftValue: '',
                            typeValidation: 'strict',
                            version: 2,
                        },
                        conditions: [
                            {
                                leftValue: '={{ $json.output.illustration }}',
                                rightValue: 'f',
                                operator: {
                                    type: 'boolean',
                                    operation: 'true',
                                    singleValue: true,
                                },
                                id: 'illustration-true',
                            },
                        ],
                        combinator: 'and',
                    },
                },
                {
                    conditions: {
                        options: {
                            caseSensitive: true,
                            leftValue: '',
                            typeValidation: 'strict',
                            version: 2,
                        },
                        conditions: [
                            {
                                leftValue: '={{ $json.output.illustration }}',
                                rightValue: 'true',
                                operator: {
                                    type: 'boolean',
                                    operation: 'false',
                                    singleValue: true,
                                },
                                id: 'illustration-false',
                            },
                        ],
                        combinator: 'and',
                    },
                },
            ],
        },
        options: {
            fallbackOutput: 'none',
        },
    };

    @node({
        name: 'Structured Output Parser5',
        type: '@n8n/n8n-nodes-langchain.outputParserStructured',
        version: 1.3,
        position: [2112, -320],
    })
    StructuredOutputParser5 = {
        schemaType: 'manual',
        inputSchema:
            '{\n  "type": "object",\n  "properties": {\n    "illustration": {\n      "type": "boolean",\n      "description": "Indique si l\'utilisateur souhaite une illustration"\n    },\n    "illustration_instructions": {\n      "type": "string",\n      "description": "Instructions supplémentaires pour l\'illustration"\n    }\n  },\n  "required": [\n    "illustration",\n    "illustration_instructions"\n  ]\n}',
    };

    @node({
        name: 'If',
        type: 'n8n-nodes-base.if',
        version: 2.3,
        position: [1808, -928],
    })
    If_ = {
        conditions: {
            options: {
                caseSensitive: true,
                leftValue: '',
                typeValidation: 'strict',
                version: 3,
            },
            conditions: [
                {
                    id: '935670f7-34a5-4a3d-986d-2a96ea96e03b',
                    leftValue: '={{ $json.output.comments }}',
                    rightValue: '',
                    operator: {
                        type: 'string',
                        operation: 'empty',
                        singleValue: true,
                    },
                },
                {
                    id: '9973e046-a95e-484c-b025-12db6d60c008',
                    leftValue: '={{ $json.output.comments }}',
                    rightValue: '',
                    operator: {
                        type: 'string',
                        operation: 'notExists',
                        singleValue: true,
                    },
                },
            ],
            combinator: 'or',
        },
        options: {},
    };

    @node({
        name: 'Structured Output Parser2',
        type: '@n8n/n8n-nodes-langchain.outputParserStructured',
        version: 1.3,
        position: [1376, -560],
    })
    StructuredOutputParser2 = {
        schemaType: 'manual',
        inputSchema:
            '{\n  "type": "object",\n  "properties": {\n    "approved": {\n      "type": "boolean",\n      "description": "Indique si l\'utilisateur a validé le post"\n    },\n    "comments": {\n      "type": "string",\n      "description": "Les demandes de modifications éventuelles de l\'utilisateur"\n    }\n  },\n  "required": [\n    "approved",\n    "comments"\n  ]\n}',
    };

    @node({
        name: 'User decision analyst',
        type: '@n8n/n8n-nodes-langchain.agent',
        version: 3.1,
        position: [1232, -784],
    })
    UserDecisionAnalyst = {
        promptType: 'define',
        text: "={{ $json.data['Que pensez-vous de ce post ?'] }}",
        hasOutputParser: true,
        options: {
            systemMessage:
                "You analyze the user's response. You must determine based on their response whether the item in question is approved, rejected, or if the user has comments.",
        },
    };

    @node({
        name: 'post brief',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [-608, -656],
    })
    PostBrief = {
        jsCode: "// Construire une phrase lisible à partir des champs du brief\n\nconst sujet = $('🧠 Agent Orchestrateur').first().json.output.Sujet || '';\nconst ton = $('🧠 Agent Orchestrateur').first().json.output.Ton || '';\nconst audience = $('🧠 Agent Orchestrateur').first().json.output.Audience || '';\nconst objectif = $('🧠 Agent Orchestrateur').first().json.output.Objectif || '';\nconst plateforme = $('🧠 Agent Orchestrateur').first().json.output.Plateforme || '';\nconst parts = [];\nif (sujet) parts.push(`le sujet du post est «${sujet}»`);\nif (ton) parts.push(`le ton du post est «${ton}»`);\nif (audience) parts.push(`l'audience du post est «${audience}»`);\nif (objectif) parts.push(`l'objectif du post est «${objectif}»`);\nif (plateforme) parts.push(`la plateforme cible du post est «${plateforme}»`);\nconst output = parts.length ? parts.join(', ') : 'Aucune information de brief fournie.';\n\nreturn [{ json: { output: output } }];",
    };

    @node({
        name: '💭 Discord: Génération1',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [2096, -832],
        credentials: { discordBotApi: { id: 'YssgTWUIvCzBECMT', name: 'Discord Bot account' } },
    })
    DiscordGnration1 = {
        resource: 'message',
        guildId: {
            __rl: true,
            value: '1451176310788460624',
            mode: 'list',
            cachedResultName: 'Stimm',
            cachedResultUrl: 'https://discord.com/channels/1451176310788460624',
        },
        channelId: {
            __rl: true,
            value: '1451176311484846264',
            mode: 'id',
        },
        content: '⏳ Modification du post en cours...',
        options: {},
    };

    @node({
        name: '🎨 Agent: Prompt Image',
        type: '@n8n/n8n-nodes-langchain.agent',
        version: 3,
        position: [2608, -448],
    })
    AgentPromptImage = {
        promptType: 'define',
        text: "=Post:\n\n{{ $('✍️ Agent Rédacteur').item.json.output }}\n\nInstructions utilisateur (si présentes): {{ $('🧠 Agent: Illustration Decision').item.json.output.illustration_instructions || '' }}",
        hasOutputParser: true,
        options: {
            systemMessage:
                'Generate a creative DALL-E prompt (max 1000 chars) that visually captures the essence and tone of the post. Be descriptive, use English, and optimize for DALL-E (style, composition, details).',
            maxIterations: 3,
        },
    };

    @node({
        name: 'Structured Output Parser3',
        type: '@n8n/n8n-nodes-langchain.outputParserStructured',
        version: 1.3,
        position: [2688, -224],
    })
    StructuredOutputParser3 = {
        schemaType: 'manual',
        inputSchema:
            '{\n  "type": "object",\n  "properties": {\n    "image_prompt": {\n      "type": "string",\n      "description": "Le prompt optimisé pour DALL-E en anglais"\n    }\n  },\n  "required": [\n    "image_prompt"\n  ]\n}',
    };

    @node({
        name: '🖼️ Gemini: Generate Image',
        type: '@n8n/n8n-nodes-langchain.googleGemini',
        version: 1.1,
        position: [2960, -448],
        credentials: { googlePalmApi: { id: 'DunK9FvUJHIlLybd', name: 'Google Gemini(PaLM) Api account' } },
    })
    GeminiGenerateImage = {
        resource: 'image',
        modelId: {
            __rl: true,
            value: 'models/gemini-2.5-flash-image',
            mode: 'list',
            cachedResultName: 'models/gemini-2.5-flash-image (Nano Banana)',
        },
        prompt: '={{ $json.output.image_prompt }}',
        options: {},
    };

    @node({
        name: '📤 Discord: Send Image',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [3184, -544],
        credentials: { discordBotApi: { id: 'YssgTWUIvCzBECMT', name: 'Discord Bot account' } },
    })
    DiscordSendImage = {
        resource: 'message',
        guildId: {
            __rl: true,
            value: '1451176310788460624',
            mode: 'list',
            cachedResultName: 'Stimm',
            cachedResultUrl: 'https://discord.com/channels/1451176310788460624',
        },
        channelId: {
            __rl: true,
            value: '1451176311484846264',
            mode: 'id',
        },
        options: {},
        files: {
            values: [{}],
        },
    };

    @node({
        name: '🎨 Discord: Image Validation',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [3408, -544],
        credentials: { discordBotApi: { id: 'YssgTWUIvCzBECMT', name: 'Discord Bot account' } },
    })
    DiscordImageValidation = {
        resource: 'message',
        operation: 'sendAndWait',
        guildId: {
            __rl: true,
            value: '1451176310788460624',
            mode: 'list',
            cachedResultName: 'Stimm',
            cachedResultUrl: 'https://discord.com/channels/1451176310788460624',
        },
        channelId: {
            __rl: true,
            value: '1451176311484846264',
            mode: 'id',
        },
        message: 'Que pensez-vous de cette image ?',
        responseType: 'customForm',
        formFields: {
            values: [
                {
                    fieldLabel: "Validation de l'image",
                    fieldType: 'textarea',
                    placeholder: 'Approuvez-vous cette image ou souhaitez-vous des modifications ?',
                },
            ],
        },
        options: {},
    };

    @node({
        name: 'Image Decision Analyst',
        type: '@n8n/n8n-nodes-langchain.agent',
        version: 3.1,
        position: [3632, -544],
    })
    ImageDecisionAnalyst = {
        promptType: 'define',
        text: "={{ $json.data['Validation de l\\'image'] }}",
        hasOutputParser: true,
        options: {
            systemMessage:
                "You analyze the user's response regarding the generated image. You must determine whether the user approves the image, rejects it, or has comments for modifications.",
        },
    };

    @node({
        name: 'Structured Output Parser4',
        type: '@n8n/n8n-nodes-langchain.outputParserStructured',
        version: 1.3,
        position: [3712, -320],
    })
    StructuredOutputParser4 = {
        schemaType: 'manual',
        inputSchema:
            '{\n  "type": "object",\n  "properties": {\n    "approved": {\n      "type": "boolean",\n      "description": "Indique si l\'utilisateur a validé l\'image"\n    },\n    "comments": {\n      "type": "string",\n      "description": "Les demandes de modifications éventuelles de l\'utilisateur pour l\'image"\n    }\n  },\n  "required": [\n    "approved",\n    "comments"\n  ]\n}',
    };

    @node({
        name: '✅ Image Approved?',
        type: 'n8n-nodes-base.switch',
        version: 3.2,
        position: [3984, -544],
    })
    ImageApproved = {
        rules: {
            values: [
                {
                    conditions: {
                        options: {
                            caseSensitive: true,
                            leftValue: '',
                            typeValidation: 'strict',
                            version: 2,
                        },
                        conditions: [
                            {
                                leftValue: '={{ $json.output.approved }}',
                                rightValue: 'f',
                                operator: {
                                    type: 'boolean',
                                    operation: 'true',
                                    singleValue: true,
                                },
                                id: 'image-approved-check',
                            },
                        ],
                        combinator: 'and',
                    },
                },
                {
                    conditions: {
                        options: {
                            caseSensitive: true,
                            leftValue: '',
                            typeValidation: 'strict',
                            version: 2,
                        },
                        conditions: [
                            {
                                id: 'image-rejected-check',
                                leftValue: '={{ $json.output.approved }}',
                                rightValue: 'true',
                                operator: {
                                    type: 'boolean',
                                    operation: 'false',
                                    singleValue: true,
                                },
                            },
                        ],
                        combinator: 'and',
                    },
                },
            ],
        },
        options: {
            fallbackOutput: 'none',
        },
    };

    @node({
        name: 'If Image Comments',
        type: 'n8n-nodes-base.if',
        version: 2.3,
        position: [4208, -592],
    })
    IfImageComments = {
        conditions: {
            options: {
                caseSensitive: true,
                leftValue: '',
                typeValidation: 'strict',
                version: 3,
            },
            conditions: [
                {
                    id: 'image-comments-empty',
                    leftValue: '={{ $json.output.comments }}',
                    rightValue: '',
                    operator: {
                        type: 'string',
                        operation: 'empty',
                        singleValue: true,
                    },
                },
                {
                    id: 'image-comments-notexists',
                    leftValue: '={{ $json.output.comments }}',
                    rightValue: '',
                    operator: {
                        type: 'string',
                        operation: 'notExists',
                        singleValue: true,
                    },
                },
            ],
            combinator: 'or',
        },
        options: {},
    };

    @node({
        name: '✅ Discord: Image Approved',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [4432, -304],
        credentials: { discordBotApi: { id: 'YssgTWUIvCzBECMT', name: 'Discord Bot account' } },
    })
    DiscordImageApproved = {
        resource: 'message',
        guildId: {
            __rl: true,
            value: '1451176310788460624',
            mode: 'list',
            cachedResultName: 'Stimm',
            cachedResultUrl: 'https://discord.com/channels/1451176310788460624',
        },
        channelId: {
            __rl: true,
            value: '1451176311484846264',
            mode: 'id',
        },
        content: '✅ Parfait ! Votre image a été validée !',
        options: {},
    };

    @node({
        name: '❌ Discord: Image Rejected',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [4432, -688],
        credentials: { discordBotApi: { id: 'YssgTWUIvCzBECMT', name: 'Discord Bot account' } },
    })
    DiscordImageRejected = {
        resource: 'message',
        operation: 'sendAndWait',
        guildId: {
            __rl: true,
            value: '1451176310788460624',
            mode: 'list',
            cachedResultName: 'Stimm',
            cachedResultUrl: 'https://discord.com/channels/1451176310788460624',
        },
        channelId: {
            __rl: true,
            value: '1451176311484846264',
            mode: 'id',
        },
        message: '❌ Image non approuvée. Aucune modification demandée.',
        responseType: 'customForm',
        formFields: {
            values: [
                {
                    fieldLabel: 'Souhaitez-vous continuer ?',
                },
            ],
        },
        options: {},
    };

    @node({
        name: '🔄 Discord: Regenerating Image',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [4432, -496],
        credentials: { discordBotApi: { id: 'YssgTWUIvCzBECMT', name: 'Discord Bot account' } },
    })
    DiscordRegeneratingImage = {
        resource: 'message',
        guildId: {
            __rl: true,
            value: '1451176310788460624',
            mode: 'list',
            cachedResultName: 'Stimm',
            cachedResultUrl: 'https://discord.com/channels/1451176310788460624',
        },
        channelId: {
            __rl: true,
            value: '1451176311484846264',
            mode: 'id',
        },
        content: "⏳ Régénération de l'image en cours avec vos modifications...",
        options: {},
    };

    @node({
        name: '🔄 Agent: Update Image Prompt',
        type: '@n8n/n8n-nodes-langchain.agent',
        version: 3,
        position: [4656, -80],
    })
    AgentUpdateImagePrompt = {
        promptType: 'define',
        text: "=Modifie le prompt d'image précédent en tenant compte des commentaires suivants:\n\n{{ $('Image Decision Analyst').first().json.output.comments }}\n\nPrompt précédent: {{ $('🎨 Agent: Prompt Image').first().json.output.image_prompt }}",
        hasOutputParser: true,
        options: {
            systemMessage:
                "Update the DALL-E prompt based on the user's comments. Keep it descriptive, visual, in English, under 1000 characters, and optimized for DALL-E.",
            maxIterations: 3,
        },
    };

    @node({
        name: 'OpenRouter Chat Model',
        type: '@n8n/n8n-nodes-langchain.lmChatOpenRouter',
        version: 1,
        position: [1248, -560],
        credentials: { openRouterApi: { id: 'GoUHMO5ztQiNeJQM', name: 'OpenRouter account' } },
    })
    OpenrouterChatModel = {
        model: 'google/gemini-3-flash-preview',
        options: {},
    };

    @node({
        name: 'post brief1',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [2384, -560],
    })
    PostBrief1 = {
        jsCode: "// Construire une phrase lisible à partir des champs du brief\n\nconst comments = $('User decision analyst').first().json.output.comments || '';\n\nreturn [{ json: { output: comments } }];",
    };

    @node({
        name: 'Brief formating',
        type: '@n8n/n8n-nodes-langchain.outputParserStructured',
        version: 1.3,
        position: [-1664, -320],
    })
    BriefFormating = {
        schemaType: 'manual',
        inputSchema:
            '{\n  "type": "object",\n  "properties": {\n    "needs_details": {\n      "type": "boolean",\n      "description": "Indique si des informations manquantes empêchent la génération du contenu."\n    },\n    "Sujet": {\n      "type": "string",\n      "description": "Le sujet principal du contenu à rédiger."\n    },\n    "Ton": {\n      "type": "string",\n      "description": "Le style ou ton employé (ex: professionnel, humoristique, persuasif)."\n    },\n    "Audience": {\n      "type": "string",\n      "description": "Le public cible visé par le message."\n    },\n    "Objectif": {\n      "type": "string",\n      "description": "Le but recherché (ex: vendre, informer, engager)."\n    },\n    "Plateforme": {\n      "type": "string",\n      "description": "Le canal de diffusion (ex: LinkedIn, Instagram, Email)."\n    }\n  },\n  "required": [\n    "needs_details",\n    "Sujet",\n    "Ton",\n    "Audience",\n    "Objectif",\n    "Platform"\n  ]\n}',
        autoFix: true,
    };

    @node({
        name: 'post action request',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [4720, -304],
        credentials: { discordBotApi: { id: 'YssgTWUIvCzBECMT', name: 'Discord Bot account' } },
    })
    PostActionRequest = {
        resource: 'message',
        operation: 'sendAndWait',
        guildId: {
            __rl: true,
            value: '1451176310788460624',
            mode: 'list',
            cachedResultName: 'Stimm',
            cachedResultUrl: 'https://discord.com/channels/1451176310788460624',
        },
        channelId: {
            __rl: true,
            value: '1451176311484846264',
            mode: 'id',
        },
        message: 'Souhaitez-vous publier ce post ?',
        approvalOptions: {
            values: {
                approvalType: 'double',
            },
        },
        options: {},
    };

    @node({
        name: '🧠 Agent: Post Action Decision',
        type: '@n8n/n8n-nodes-langchain.agent',
        version: 3.1,
        position: [5008, -304],
    })
    AgentPostActionDecision = {
        promptType: 'define',
        text: "=Decision: {{ $json.data.approved }}\nPlatform: {{ $('🧠 Agent Orchestrateur').item.json.output.Plateforme }}",
        hasOutputParser: true,
        options: {
            systemMessage:
                'Analyze the publication decision and return JSON with post (boolean) and platform (canonical value: linkedin, x, facebook, instagram, reddit, or youtube). Map synonyms appropriately.',
        },
    };

    @node({
        name: 'Structured Output Parser6',
        type: '@n8n/n8n-nodes-langchain.outputParserStructured',
        version: 1.3,
        position: [5088, -80],
    })
    StructuredOutputParser6 = {
        schemaType: 'manual',
        inputSchema:
            '{\n  "type": "object",\n  "properties": {\n    "post": {\n      "type": "boolean",\n      "description": "Indique si l\'utilisateur veut publier"\n    },\n    "platform": {\n      "type": "string",\n      "description": "Plateforme cible canonique"\n    }\n  },\n  "required": [\n    "post",\n    "platform"\n  ]\n}',
    };

    @node({
        name: '🧭 Post Action Routing',
        type: 'n8n-nodes-base.switch',
        version: 3.2,
        position: [5360, -304],
    })
    PostActionRouting = {
        rules: {
            values: [
                {
                    conditions: {
                        options: {
                            caseSensitive: true,
                            leftValue: '',
                            typeValidation: 'strict',
                            version: 2,
                        },
                        conditions: [
                            {
                                leftValue: "={{ $json.output.post ? 'yes' : 'no' }}",
                                rightValue: 'no',
                                operator: {
                                    type: 'string',
                                    operation: 'equals',
                                    singleValue: true,
                                },
                                id: 'post-declined',
                            },
                        ],
                        combinator: 'and',
                    },
                },
                {
                    conditions: {
                        options: {
                            caseSensitive: true,
                            leftValue: '',
                            typeValidation: 'strict',
                            version: 2,
                        },
                        conditions: [
                            {
                                leftValue: "={{ $json.output.post ? 'yes' : 'no' }}",
                                rightValue: 'yes',
                                operator: {
                                    type: 'string',
                                    operation: 'equals',
                                    singleValue: true,
                                },
                                id: 'post-accepted',
                            },
                        ],
                        combinator: 'and',
                    },
                },
            ],
        },
        options: {
            fallbackOutput: 'none',
        },
    };

    @node({
        name: '🧭 Platform Routing',
        type: 'n8n-nodes-base.switch',
        version: 3.2,
        position: [5584, -256],
    })
    PlatformRouting = {
        rules: {
            values: [
                {
                    conditions: {
                        options: {
                            caseSensitive: true,
                            leftValue: '',
                            typeValidation: 'strict',
                            version: 2,
                        },
                        conditions: [
                            {
                                leftValue: '={{ $json.output.platform }}',
                                rightValue: 'linkedin',
                                operator: {
                                    type: 'string',
                                    operation: 'equals',
                                    singleValue: true,
                                },
                                id: 'platform-linkedin',
                            },
                        ],
                        combinator: 'and',
                    },
                },
                {
                    conditions: {
                        options: {
                            caseSensitive: true,
                            leftValue: '',
                            typeValidation: 'strict',
                            version: 2,
                        },
                        conditions: [
                            {
                                leftValue: '={{ $json.output.platform }}',
                                rightValue: 'x',
                                operator: {
                                    type: 'string',
                                    operation: 'equals',
                                    singleValue: true,
                                },
                                id: 'platform-x',
                            },
                        ],
                        combinator: 'and',
                    },
                },
                {
                    conditions: {
                        options: {
                            caseSensitive: true,
                            leftValue: '',
                            typeValidation: 'strict',
                            version: 2,
                        },
                        conditions: [
                            {
                                leftValue: '={{ $json.output.platform }}',
                                rightValue: 'facebook',
                                operator: {
                                    type: 'string',
                                    operation: 'equals',
                                    singleValue: true,
                                },
                                id: 'platform-facebook',
                            },
                        ],
                        combinator: 'and',
                    },
                },
                {
                    conditions: {
                        options: {
                            caseSensitive: true,
                            leftValue: '',
                            typeValidation: 'strict',
                            version: 2,
                        },
                        conditions: [
                            {
                                leftValue: '={{ $json.output.platform }}',
                                rightValue: 'instagram',
                                operator: {
                                    type: 'string',
                                    operation: 'equals',
                                    singleValue: true,
                                },
                                id: 'platform-instagram',
                            },
                        ],
                        combinator: 'and',
                    },
                },
                {
                    conditions: {
                        options: {
                            caseSensitive: true,
                            leftValue: '',
                            typeValidation: 'strict',
                            version: 2,
                        },
                        conditions: [
                            {
                                leftValue: '={{ $json.output.platform }}',
                                rightValue: 'reddit',
                                operator: {
                                    type: 'string',
                                    operation: 'equals',
                                    singleValue: true,
                                },
                                id: 'platform-reddit',
                            },
                        ],
                        combinator: 'and',
                    },
                },
                {
                    conditions: {
                        options: {
                            caseSensitive: true,
                            leftValue: '',
                            typeValidation: 'strict',
                            version: 2,
                        },
                        conditions: [
                            {
                                leftValue: '={{ $json.output.platform }}',
                                rightValue: 'youtube',
                                operator: {
                                    type: 'string',
                                    operation: 'equals',
                                    singleValue: true,
                                },
                                id: 'platform-youtube',
                            },
                        ],
                        combinator: 'and',
                    },
                },
            ],
        },
        options: {
            fallbackOutput: 'extra',
        },
    };

    @node({
        name: '📣 LinkedIn: Create Post',
        type: 'n8n-nodes-base.linkedIn',
        version: 1,
        position: [5808, -464],
        credentials: { linkedInOAuth2Api: { id: 'uaT0xHl72rwxthwS', name: 'LinkedIn account' } },
    })
    LinkedinCreatePost = {
        postAs: 'organization',
        organization: '110149792',
        text: "={{ $('✍️ Agent Rédacteur').item.json.output.final_post }}",
        additionalFields: {},
    };

    @node({
        name: '📣 X: Create Tweet',
        type: 'n8n-nodes-base.twitter',
        version: 2,
        position: [5808, -272],
    })
    XCreateTweet = {
        text: "={{ $('✍️ Agent Rédacteur').item.json.output.final_post }}",
        additionalFields: {},
    };

    @node({
        name: '📣 Facebook/Instagram: Publish',
        type: 'n8n-nodes-base.facebookGraphApi',
        version: 1,
        position: [5808, -80],
    })
    FacebookinstagramPublish = {
        httpRequestMethod: 'POST',
        graphApiVersion: 'v23.0',
        node: "={{ $json.facebookNodeId || 'me' }}",
        edge: 'feed',
        options: {
            queryParameters: {
                parameter: [
                    {
                        name: 'message',
                        value: "={{ $('✍️ Agent Rédacteur').item.json.output.final_post }}",
                    },
                ],
            },
        },
    };

    @node({
        name: '📣 Reddit: Create Post',
        type: 'n8n-nodes-base.reddit',
        version: 1,
        position: [5808, 112],
    })
    RedditCreatePost = {
        subreddit: '={{ $json.redditSubreddit }}',
        title: "={{ $('🧠 Agent Orchestrateur').item.json.output.Sujet || 'Nouveau post' }}",
        text: "={{ $('✍️ Agent Rédacteur').item.json.output.final_post }}",
    };

    @node({
        name: '📣 YouTube: Upload Video',
        type: 'n8n-nodes-base.youTube',
        version: 1,
        position: [5808, 304],
    })
    YoutubeUploadVideo = {
        resource: 'video',
        operation: 'upload',
        title: "={{ $json.youtubeTitle || $('🧠 Agent Orchestrateur').item.json.output.Sujet || 'Social Post' }}",
        options: {
            description: "={{ $('✍️ Agent Rédacteur').item.json.output.final_post }}",
        },
    };

    @node({
        name: '✅ Discord: no Image',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [4432, 96],
        credentials: { discordBotApi: { id: 'YssgTWUIvCzBECMT', name: 'Discord Bot account' } },
    })
    DiscordNoImage = {
        resource: 'message',
        guildId: {
            __rl: true,
            value: '1451176310788460624',
            mode: 'list',
            cachedResultName: 'Stimm',
            cachedResultUrl: 'https://discord.com/channels/1451176310788460624',
        },
        channelId: {
            __rl: true,
            value: '1451176311484846264',
            mode: 'id',
        },
        content: "✅ Ok, pas besoin d'image",
        options: {},
    };

    @node({
        name: '🎉 Discord: Rejected Post',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [2096, -1024],
        credentials: { discordBotApi: { id: 'YssgTWUIvCzBECMT', name: 'Discord Bot account' } },
    })
    DiscordRejectedPost = {
        resource: 'message',
        guildId: {
            __rl: true,
            value: '1451176310788460624',
            mode: 'list',
            cachedResultName: 'Stimm',
            cachedResultUrl: 'https://discord.com/channels/1451176310788460624',
        },
        channelId: {
            __rl: true,
            value: '1451176311484846264',
            mode: 'id',
        },
        content: "Vous n'avez pas approuvé ce post",
        options: {},
    };

    @node({
        name: '🎉 Discord: Cancelled publication',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [5584, -448],
        credentials: { discordBotApi: { id: 'YssgTWUIvCzBECMT', name: 'Discord Bot account' } },
    })
    DiscordCancelledPublication = {
        resource: 'message',
        guildId: {
            __rl: true,
            value: '1451176310788460624',
            mode: 'list',
            cachedResultName: 'Stimm',
            cachedResultUrl: 'https://discord.com/channels/1451176310788460624',
        },
        channelId: {
            __rl: true,
            value: '1451176311484846264',
            mode: 'id',
        },
        content: "Vous n'avez pas approuvé ce post",
        options: {},
    };

    @node({
        name: '🎉 Discord: Cancelled publication1',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [5808, -656],
        credentials: { discordBotApi: { id: 'YssgTWUIvCzBECMT', name: 'Discord Bot account' } },
    })
    DiscordCancelledPublication1 = {
        resource: 'message',
        guildId: {
            __rl: true,
            value: '1451176310788460624',
            mode: 'list',
            cachedResultName: 'Stimm',
            cachedResultUrl: 'https://discord.com/channels/1451176310788460624',
        },
        channelId: {
            __rl: true,
            value: '1451176311484846264',
            mode: 'id',
        },
        content: 'Nous ne pouvons pas encore publier sur cette plate-forme.',
        options: {},
    };

    @node({
        name: 'OpenRouter Chat Model2',
        type: '@n8n/n8n-nodes-langchain.lmChatOpenRouter',
        version: 1,
        position: [-1728, -112],
        credentials: { openRouterApi: { id: 'GoUHMO5ztQiNeJQM', name: 'OpenRouter account' } },
    })
    OpenrouterChatModel2 = {
        model: 'google/gemini-3-flash-preview',
        options: {},
    };

    @node({
        name: 'OpenRouter Chat Model3',
        type: '@n8n/n8n-nodes-langchain.lmChatOpenRouter',
        version: 1,
        position: [-384, -432],
        credentials: { openRouterApi: { id: 'GoUHMO5ztQiNeJQM', name: 'OpenRouter account' } },
    })
    OpenrouterChatModel3 = {
        model: 'google/gemini-3-flash-preview',
        options: {},
    };

    @node({
        name: 'Google search in SerpApi',
        type: 'n8n-nodes-serpapi.serpApiTool',
        version: 1,
        position: [112, -224],
        credentials: { serpApi: { id: 'lcQXp2UA6WQF6FkU', name: 'SerpApi account' } },
    })
    GoogleSearchInSerpapi = {
        q: "={{ /*n8n-auto-generated-fromAI-override*/ $fromAI('Search_Query__q_', ``, 'string') }}",
        location: '585069a6ee19ad271e9b5e0e',
        additionalFields: {},
        requestOptions: {},
    };

    @node({
        name: 'Fetch Page Content',
        type: 'n8n-nodes-base.jinaAiTool',
        version: 1,
        position: [240, -224],
        credentials: { jinaAiApi: { id: 'YmIMq9jd5lNUfwOe', name: 'Jina AI account' } },
    })
    FetchPageContent = {
        url: "={{ /*n8n-auto-generated-fromAI-override*/ $fromAI('URL', ``, 'string') }}",
        options: {},
        requestOptions: {},
    };

    @node({
        name: 'Structured Output Parser',
        type: '@n8n/n8n-nodes-langchain.outputParserStructured',
        version: 1.3,
        position: [368, -224],
    })
    StructuredOutputParser = {
        schemaType: 'manual',
        inputSchema:
            '{\n\t"type": "object",\n\t"properties": {\n\t\t"query": {\n\t\t\t"type": "string",\n\t\t\t"description": "The original search query"\n\t\t},\n\t\t"searchResults": {\n\t\t\t"type": "array",\n\t\t\t"description": "List of web pages fetched and their content",\n\t\t\t"items": {\n\t\t\t\t"type": "object",\n\t\t\t\t"properties": {\n\t\t\t\t\t"url": {\n\t\t\t\t\t\t"type": "string",\n\t\t\t\t\t\t"description": "The URL of the source page"\n\t\t\t\t\t},\n\t\t\t\t\t"title": {\n\t\t\t\t\t\t"type": "string",\n\t\t\t\t\t\t"description": "The title of the page from search results"\n\t\t\t\t\t},\n\t\t\t\t\t"content": {\n\t\t\t\t\t\t"type": "string",\n\t\t\t\t\t\t"description": "The full extracted content from the page"\n\t\t\t\t\t}\n\t\t\t\t},\n\t\t\t\t"required": ["url", "content"]\n\t\t\t}\n\t\t}\n\t},\n\t"required": ["query", "searchResults"]\n}',
    };

    @node({
        name: 'OpenRouter Chat Model1',
        type: '@n8n/n8n-nodes-langchain.lmChatOpenRouter',
        version: 1,
        position: [-160, -224],
        credentials: { openRouterApi: { id: 'GoUHMO5ztQiNeJQM', name: 'OpenRouter account' } },
    })
    OpenrouterChatModel1 = {
        model: 'google/gemini-3-flash-preview',
        options: {},
    };

    @node({
        name: '💾 Mémoire3',
        type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
        version: 1.3,
        position: [-32, -224],
    })
    Mmoire3 = {
        sessionIdType: 'customKey',
        sessionKey: '=tool1_{{ $execution.id }}',
        contextWindowLength: 15,
    };

    @node({
        name: '💾 Mémoire4',
        type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
        version: 1.3,
        position: [496, -224],
    })
    Mmoire4 = {
        sessionIdType: 'customKey',
        sessionKey: '=tool2_{{ $execution.id }}',
        contextWindowLength: 15,
    };

    @node({
        name: '💾 Mémoire5',
        type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
        version: 1.3,
        position: [704, -224],
    })
    Mmoire5 = {
        sessionIdType: 'customKey',
        sessionKey: '=tool3_{{ $execution.id }}',
        contextWindowLength: 15,
    };

    @node({
        name: 'NewsTool',
        type: '@n8n/n8n-nodes-langchain.agentTool',
        version: 3,
        position: [-128, -432],
    })
    Newstool = {
        toolDescription: 'News agent that you must use to get latest news about a given subject',
        text: "={{ /*n8n-auto-generated-fromAI-override*/ $fromAI('Prompt__User_Message_', ``, 'string') }}",
        hasOutputParser: true,
        options: {
            systemMessage:
                "=You are a web research data collector. Current date: {{ $now.format('DDD') }}. Your role is to fetch and return raw research data, NOT to summarize or synthesize. Process: (1) Use 'Google search in SerpApi' to find relevant sources, (2) Use 'Fetch Page Content' on 2-3 of the most relevant URLs to extract full page content, (3) Return the original query alongside each fetched page's URL and its complete extracted content. DO NOT summarize, simplify, or interpret the content - return it as-is from the fetching tool.",
        },
    };

    @node({
        name: 'CreativityTool',
        type: '@n8n/n8n-nodes-langchain.agentTool',
        version: 3,
        position: [240, -432],
    })
    Creativitytool = {
        toolDescription:
            'creativity agent that you must use to get latest trends on how to make a successfull post on a given platform',
        text: "={{ /*n8n-auto-generated-fromAI-override*/ $fromAI('Prompt__User_Message_', ``, 'string') }}",
        hasOutputParser: true,
        options: {
            systemMessage:
                "=You are a web research data collector. Current date: {{ $now.format('DDD') }}. Your role is to fetch and return raw research data, NOT to summarize or synthesize. Process: (1) Use 'Google search in SerpApi' to find relevant sources, (2) Use 'Fetch Page Content' on 2-3 of the most relevant URLs to extract full page content, (3) Return the original query alongside each fetched page's URL and its complete extracted content. DO NOT summarize, simplify, or interpret the content - return it as-is from the fetching tool.",
        },
    };

    @node({
        name: 'FactCheckerTool',
        type: '@n8n/n8n-nodes-langchain.agentTool',
        version: 3,
        position: [640, -432],
    })
    Factcheckertool = {
        toolDescription: 'Fact Checker agent that you must use to fact check your post draft',
        text: "={{ /*n8n-auto-generated-fromAI-override*/ $fromAI('Prompt__User_Message_', ``, 'string') }}",
        hasOutputParser: true,
        options: {
            systemMessage:
                "=You are a web research data collector. Current date: {{ $now.format('DDD') }}. Your role is to fetch and return raw research data, NOT to summarize or synthesize. Process: (1) Use 'Google search in SerpApi' to find relevant sources, (2) Use 'Fetch Page Content' on 2-3 of the most relevant URLs to extract full page content, (3) Return the original query alongside each fetched page's URL and its complete extracted content. DO NOT summarize, simplify, or interpret the content - return it as-is from the fetching tool.",
        },
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.WebhookMessageReu.out(0).to(this.DiscordAccus.in(0));
        this.DiscordAccus.out(0).to(this.AgentOrchestrateur.in(0));
        this.AgentOrchestrateur.out(0).to(this.InfosCompltes.in(0));
        this.Mmoire.out(0).to(this.AgentOrchestrateur.in(0));
        this.InfosCompltes.out(0).to(this.DiscordDemanderValidation.in(0));
        this.InfosCompltes.out(1).to(this.DiscordPoserQuestion.in(0));
        this.DiscordDemanderValidation.out(0).to(this.DiscordGnration.in(0));
        this.DiscordPoserQuestion.out(0).to(this.AgentOrchestrateur.in(0));
        this.DiscordGnration.out(0).to(this.PostBrief.in(0));
        this.AgentRdacteur.out(0).to(this.DiscordPostFinal.in(0));
        this.DiscordPostFinal.out(0).to(this.UserDecisionAnalyst.in(0));
        this.Mmoire2.out(0).to(this.AgentRdacteur.in(0));
        this.InfosCompltes1.out(0).to(this.DiscordPostFinal1.in(0));
        this.InfosCompltes1.out(1).to(this.If_.in(0));
        this.If_.out(0).to(this.DiscordRejectedPost.in(0));
        this.If_.out(1).to(this.DiscordGnration1.in(0));
        this.StructuredOutputParser2.out(0).to(this.UserDecisionAnalyst.in(0));
        this.UserDecisionAnalyst.out(0).to(this.InfosCompltes1.in(0));
        this.PostBrief.out(0).to(this.AgentRdacteur.in(0));
        this.DiscordGnration1.out(0).to(this.PostBrief1.in(0));
        this.DiscordPostFinal1.out(0).to(this.AgentIllustrationDecision.in(0));
        this.AgentIllustrationDecision.out(0).to(this.IllustrationRouting.in(0));
        this.IllustrationRouting.out(0).to(this.AgentPromptImage.in(0));
        this.IllustrationRouting.out(1).to(this.DiscordNoImage.in(0));
        this.AgentPromptImage.out(0).to(this.GeminiGenerateImage.in(0));
        this.GeminiGenerateImage.out(0).to(this.DiscordSendImage.in(0));
        this.DiscordSendImage.out(0).to(this.DiscordImageValidation.in(0));
        this.DiscordImageValidation.out(0).to(this.ImageDecisionAnalyst.in(0));
        this.ImageDecisionAnalyst.out(0).to(this.ImageApproved.in(0));
        this.ImageApproved.out(0).to(this.DiscordImageApproved.in(0));
        this.ImageApproved.out(1).to(this.IfImageComments.in(0));
        this.IfImageComments.out(0).to(this.DiscordImageRejected.in(0));
        this.IfImageComments.out(1).to(this.DiscordRegeneratingImage.in(0));
        this.DiscordRegeneratingImage.out(0).to(this.AgentUpdateImagePrompt.in(0));
        this.AgentUpdateImagePrompt.out(0).to(this.GeminiGenerateImage.in(0));
        this.StructuredOutputParser3.out(0).to(this.AgentPromptImage.in(0));
        this.StructuredOutputParser3.out(0).to(this.AgentUpdateImagePrompt.in(0));
        this.StructuredOutputParser4.out(0).to(this.ImageDecisionAnalyst.in(0));
        this.StructuredOutputParser5.out(0).to(this.AgentIllustrationDecision.in(0));
        this.OpenrouterChatModel.out(0).to(this.AgentUpdateImagePrompt.in(0));
        this.OpenrouterChatModel.out(0).to(this.ImageDecisionAnalyst.in(0));
        this.OpenrouterChatModel.out(0).to(this.AgentPromptImage.in(0));
        this.OpenrouterChatModel.out(0).to(this.AgentIllustrationDecision.in(0));
        this.OpenrouterChatModel.out(0).to(this.UserDecisionAnalyst.in(0));
        this.OpenrouterChatModel.out(0).to(this.AgentPostActionDecision.in(0));
        this.PostBrief1.out(0).to(this.AgentRdacteur.in(0));
        this.BriefFormating.out(0).to(this.AgentOrchestrateur.in(0));
        this.DiscordImageApproved.out(0).to(this.PostActionRequest.in(0));
        this.DiscordImageRejected.out(0).to(this.PostActionRequest.in(0));
        this.DiscordNoImage.out(0).to(this.PostActionRequest.in(0));
        this.PostActionRequest.out(0).to(this.AgentPostActionDecision.in(0));
        this.AgentPostActionDecision.out(0).to(this.PostActionRouting.in(0));
        this.StructuredOutputParser6.out(0).to(this.AgentPostActionDecision.in(0));
        this.PostActionRouting.out(0).to(this.DiscordCancelledPublication.in(0));
        this.PostActionRouting.out(1).to(this.PlatformRouting.in(0));
        this.PlatformRouting.out(0).to(this.LinkedinCreatePost.in(0));
        this.PlatformRouting.out(1).to(this.XCreateTweet.in(0));
        this.PlatformRouting.out(2).to(this.FacebookinstagramPublish.in(0));
        this.PlatformRouting.out(3).to(this.FacebookinstagramPublish.in(0));
        this.PlatformRouting.out(4).to(this.RedditCreatePost.in(0));
        this.PlatformRouting.out(5).to(this.YoutubeUploadVideo.in(0));
        this.PlatformRouting.out(6).to(this.DiscordCancelledPublication1.in(0));
        this.OpenrouterChatModel2.out(0).to(this.BriefFormating.in(0));
        this.OpenrouterChatModel2.out(0).to(this.AgentOrchestrateur.in(0));
        this.OpenrouterChatModel3.out(0).to(this.AgentRdacteur.in(0));
        this.GoogleSearchInSerpapi.out(0).to(this.Factcheckertool.in(0));
        this.GoogleSearchInSerpapi.out(0).to(this.Creativitytool.in(0));
        this.GoogleSearchInSerpapi.out(0).to(this.Newstool.in(0));
        this.FetchPageContent.out(0).to(this.Factcheckertool.in(0));
        this.FetchPageContent.out(0).to(this.Creativitytool.in(0));
        this.FetchPageContent.out(0).to(this.Newstool.in(0));
        this.StructuredOutputParser.out(0).to(this.Factcheckertool.in(0));
        this.StructuredOutputParser.out(0).to(this.Creativitytool.in(0));
        this.StructuredOutputParser.out(0).to(this.Newstool.in(0));
        this.OpenrouterChatModel1.out(0).to(this.Newstool.in(0));
        this.OpenrouterChatModel1.out(0).to(this.Creativitytool.in(0));
        this.OpenrouterChatModel1.out(0).to(this.Factcheckertool.in(0));
        this.Mmoire3.out(0).to(this.Newstool.in(0));
        this.Mmoire4.out(0).to(this.Creativitytool.in(0));
        this.Mmoire5.out(0).to(this.Factcheckertool.in(0));
        this.Newstool.out(0).to(this.AgentRdacteur.in(0));
        this.Creativitytool.out(0).to(this.AgentRdacteur.in(0));
        this.Factcheckertool.out(0).to(this.AgentRdacteur.in(0));
    }
}
