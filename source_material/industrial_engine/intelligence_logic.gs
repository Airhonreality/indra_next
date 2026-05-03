/**
 * =============================================================================
 * ARTEFACTO: 2_providers/provider_intelligence.gs
 * RESPONSABILIDAD: El Oráculo del Core. Bridge hacia modelos de lenguaje (LLMs).
 * DHARMA: 
 *   - Universalidad: Soporta cualquier API compatible con OpenAI.
 *   - Sinceridad: Traduce el lenguaje natural a directivas MCEP sinceras.
 * =============================================================================
 */

/**
 * =============================================================================
 * SOBERANO: IntelligenceSovereign (v21.0 — Soberanía Declarativa)
 * =============================================================================
 */
const IntelligenceSovereign = (function() {

  const JURISDICTION = Object.freeze({
    id:       'intelligence',
    label:    'Indra Intelligence',
    class:    'COGNITIVE_ENGINE',
    version:  '21.0',
    config_schema: Object.freeze([
      { id: 'default_provider', label: 'Proveedor por Defecto', type: 'TEXT', default: 'gemini' },
      { id: 'custom_base_url',  label: 'URL Base (OpenAI Compatible)', type: 'TEXT' }
    ]),
    protocols: Object.freeze([
      'INTELLIGENCE_CHAT',
      'INTELLIGENCE_DISCOVERY',
      'GETMCEPMANIFEST'
    ])
  });

  function handle(uqo) { return handleIntelligence(uqo); }
  function declare()   { return JURISDICTION; }

  return { handle, declare };
})();

/**
 * Router de Segundo Nivel para Inteligencia.
 */
function handleIntelligence(uqo) {
  const protocol = (uqo.protocol || '').toUpperCase();
  
  if (protocol === 'INTELLIGENCE_CHAT') return _ai_handleChat(uqo);
  if (protocol === 'INTELLIGENCE_DISCOVERY') return _ai_handleDiscovery(uqo);
  if (protocol === 'GETMCEPMANIFEST') return _ai_handleDiscovery(uqo); // Alias para el frontend

  throw createError('PROTOCOL_NOT_FOUND', `Intelligence no soporta: ${protocol}`);
}

/**
 * INTELLIGENCE_CHAT: Bridge hacia LLMs.
 */
function _ai_handleChat(uqo) {
  const data = uqo.data || {};
  const { prompt, history = [], systemInstruction, model, provider, credentials, baseUrl, tools = [] } = data;

  if (!prompt) throw createError('INVALID_INPUT', 'Falta el prompt para la IA.');

  const targetProvider = provider || 'gemini';
  const apiKey = credentials || readProviderApiKey('intelligence', 'default');

  try {
    let resultPayload;
    
    if (targetProvider === 'gemini') {
        resultPayload = _chatGemini(prompt, history, systemInstruction, apiKey, model, tools);
    } else if (targetProvider === 'groq' || targetProvider === 'grok' || targetProvider === 'openai' || targetProvider === 'custom') {
        const effectiveBaseUrl = baseUrl || (targetProvider === 'groq' ? 'https://api.groq.com/openai/v1' : 
                                            targetProvider === 'grok' ? 'https://api.x.ai/v1' : 
                                            targetProvider === 'openai' ? 'https://api.openai.com/v1' : null);
        resultPayload = _chatOpenAICompatible(prompt, history, systemInstruction, apiKey, model, effectiveBaseUrl, tools);
    } else {
        throw createError('PROVIDER_NOT_SUPPORTED', `Proveedor de IA no soportado: ${targetProvider}`);
    }

    return {
      items: [{
        id: `ai_${Date.now()}`,
        handle: { ns: 'com.indra.ai.response', alias: 'chat_response', label: 'Respuesta de IA' },
        class: 'AI_MESSAGE',
        protocols: ['ATOM_READ'],
        response: resultPayload.text || '', // legacy fallback
        payload: resultPayload
      }],
      metadata: { status: 'OK', response: resultPayload }
    };

  } catch (e) {
    logError(`[intelligence] Fallo en chat (${targetProvider}):`, e);
    throw e;
  }
}

/**
 * INTELLIGENCE_DISCOVERY: Genera el mapa de capacidades para el Agente.
 */
function _ai_handleDiscovery(uqo) {
  const mode = uqo.data?.mode || 'RAW_MAP';
  const registry = buildManifest(); // Obtiene todos los providers registrados
  const capabilities = {};

  registry.items.forEach(item => {
    const providerId = item.provider_base;
    if (capabilities[providerId]) return;

    const conf = getProviderConf(providerId);
    if (!conf) return;

    capabilities[providerId] = {
      label: conf.handle?.label || providerId,
      description: conf.description || `Módulo de ${providerId}`,
      tools: {}
    };

    // Mapear protocolos a herramientas para el LLM
    Object.keys(conf.implements || {}).forEach(proto => {
        const cap = conf.capabilities && conf.capabilities[proto];
        if (cap && cap.exposure === 'internal') return; // No exponer herramientas internas

        capabilities[providerId].tools[proto] = {
            desc: (conf.protocol_meta && conf.protocol_meta[proto]?.desc) || `Ejecuta el protocolo ${proto} en el motor ${providerId}.`,
            inputs: (conf.protocol_meta && conf.protocol_meta[proto]?.inputs) || {}
        };
    });
  });

  return {
    items: [],
    metadata: { 
        status: 'OK', 
        capabilities: capabilities 
    }
  };
}

/**
 * Connector: Google Gemini
 */
function _chatGemini(prompt, history, systemInstruction, apiKey, model, tools) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash'}:generateContent?key=${apiKey}`;

  // Normalizar historial al formato Gemini: { role: 'user'|'model', parts: [{text}] }
  const historyContents = (history || []).map(msg => {
    if (msg.role === 'tool') {
       return { role: 'user', parts: [{ text: `[SYSTEM_RESULT_FOR_${msg.name}]: ${msg.content}` }] }; // Mocking tool responses for Gemini simplicity
    }
    const text = msg.content || msg.text || (msg.parts && msg.parts[0]?.text) || '';
    const role = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
    return { role, parts: [{ text }] };
  }).filter(m => m.parts && m.parts[0] && m.parts[0].text && m.parts[0].text.trim() !== '');

  const contents = [
    ...historyContents,
    { role: 'user', parts: [{ text: prompt }] }
  ];

  const body = {
    contents,
    generationConfig: { maxOutputTokens: 2048, temperature: 0.7 }
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  // Inject Native Tools if provided
  if (tools && tools.length > 0) {
    body.tools = [{
      functionDeclarations: tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: {
          type: "OBJECT",
          properties: t.function.parameters.properties || {},
          required: t.function.parameters.required || []
        }
      }))
    }];
  }

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(response.getContentText());

  if (json.error) {
    throw new Error(`Gemini API Error: ${json.error.message}`);
  }

  const part = json.candidates[0].content.parts[0];
  
  if (part.functionCall) {
     return {
         type: 'tool_calls',
         calls: [{
             name: part.functionCall.name,
             arguments: part.functionCall.args || {}
         }]
     };
  }

  return { type: 'message', text: part.text || '' };
}

/**
 * Connector: OpenAI Compatible (Groq, Grok, etc)
 */
function _chatOpenAICompatible(prompt, history, systemInstruction, apiKey, model, baseUrl, tools) {
  if (!baseUrl) throw new Error('Missing baseUrl for OpenAI compatible provider.');

  const url = `${baseUrl}/chat/completions`;
  const messages = [];

  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }

  // Normalizar historial al formato OpenAI: { role: 'user'|'assistant'|'tool', content: string }
  (history || []).forEach(msg => {
    if (msg.role === 'tool') {
        messages.push({ role: 'user', content: `[SYSTEM_RESULT_FOR_${msg.name}]: ${msg.content}` }); // Simplified tool response tracking
        return;
    }
    const text = msg.content || msg.text || (msg.parts && msg.parts[0]?.text) || '';
    if (!text.trim()) return;
    const role = (msg.role === 'model' || msg.role === 'assistant') ? 'assistant' : 'user';
    messages.push({ role, content: text });
  });

  messages.push({ role: 'user', content: prompt });

  const payload = {
    model: model || 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.7
  };

  if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = "auto";
  }

  const options = {
    method: 'post',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(response.getContentText());

  if (json.error) {
    throw new Error(`AI API Error: ${json.error.message || JSON.stringify(json.error)}`);
  }

  const message = json.choices[0].message;

  if (message.tool_calls && message.tool_calls.length > 0) {
      return {
          type: 'tool_calls',
          calls: message.tool_calls.map(tc => {
              let args = {};
              try { args = JSON.parse(tc.function.arguments); } catch(e) {}
              return {
                  name: tc.function.name,
                  arguments: args
              };
          })
      };
  }

  return { type: 'message', text: message.content || '' };
}
