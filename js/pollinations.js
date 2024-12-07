// pollinations.js
// A standalone library for interacting with Pollinations endpoints.
// Supports text generation, model listing, image generation, prompt enhancement, and specialized searches.
//
// Can be used in browsers, Node.js, or other JavaScript runtimes that support fetch and ES modules.
// For Node.js < v18, install a fetch polyfill such as 'node-fetch'.

const POLLINATIONS_TEXT_ENDPOINT = "https://text.pollinations.ai/";
const POLLINATIONS_MODELS_ENDPOINT = "https://text.pollinations.ai/models";
const POLLINATIONS_IMAGE_BASE_URL = "https://image.pollinations.ai/prompt/";

// In-memory cache for avatars (no window/localStorage dependencies)
const avatarCache = {};

/**
 * Fetch the list of models from Pollinations.
 * @returns {Promise<Array>} Array of model objects.
 */
export async function fetchModelsFromPollinations() {
  const response = await fetch(POLLINATIONS_MODELS_ENDPOINT);
  if (!response.ok) {
    throw new Error("Failed to fetch models from Pollinations");
  }
  return await response.json();
}

/**
 * Send a text generation request to Pollinations.
 * @param {Array} messages - Array of message objects: {role: "user"|"assistant"|"system", content: string}.
 * @param {string} modelName - The model to use (e.g. "unity", "openai").
 * @param {boolean} [stream=false] - Whether to request a streaming response (for non-openai models).
 * @param {number|null} [seed=null] - Optional seed for deterministic generation.
 * @returns {Promise<ReadableStream>} A ReadableStream of the response.
 */
export async function sendTextRequestToPollinations(messages, modelName, stream = false, seed = null) {
  const requestBody = {
    messages: messages,
    model: modelName,
  };

  // For non-openai models, enable streaming and provide a seed
  if (modelName !== "openai") {
    requestBody.stream = true;
    requestBody.seed = seed !== null ? seed : Math.floor(Math.random() * 1000000);
  } else {
    // For openai, we do not force stream, it might return all at once
    // The variable 'stream' isn't used directly since openai returns full response anyway
  }

  const response = await fetch(POLLINATIONS_TEXT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Text request failed with status ${response.status}`);
  }

  return response.body; // Returns a ReadableStream
}

/**
 * Get an image description by sending the image to Pollinations (OpenAI model).
 * @param {string} imageUrl - The URL of the image to describe.
 * @returns {Promise<string>} The image description.
 */
export async function getImageDescriptionFromPollinations(imageUrl) {
  const requestBody = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Describe the image exactly as you see it." },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    model: "openai",
    jsonMode: false,
  };

  const response = await fetch(POLLINATIONS_TEXT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error("Failed to get image description from Pollinations");
  }

  const text = await readFullResponse(response.body);
  return text;
}

/**
 * Construct a full image URL for Pollinations image generation based on a prompt part.
 * @param {string} promptPart - The prompt to generate an image from.
 * @returns {string|null} The generated image URL or null if invalid promptPart.
 */
export function constructPollinationsImageUrl(promptPart) {
  const IMAGE_PARAMETERS = "?nologo=true&private=true&width=1920&height=1080&enhance=false";
  if (!promptPart) {
    console.error("Invalid prompt part for image generation:", promptPart);
    return null;
  }
  return `${POLLINATIONS_IMAGE_BASE_URL}${promptPart}${IMAGE_PARAMETERS}&seed=${Math.floor(Math.random() * 1000000)}`;
}

/**
 * Get a model avatar image URL from Pollinations. Uses an internal prompt map.
 * Avatars are cached in-memory.
 * @param {string} [modelName="unity"] - The model name to get an avatar for.
 * @returns {Promise<string>} The avatar image URL.
 */
export async function getModelAvatarFromPollinations(modelName = "unity") {
  const storageKey = `${modelName}Avatar`;
  if (avatarCache[storageKey]) {
    return avatarCache[storageKey];
  }

  const prompts = {
    unity: "close_face_portrait_black_hair_emo_goth_female_age_25",
    evil: "dark_sinister_demon_face_with_glowing_red_eyes",
    midijourney: "musical_portrait_artistic_composer_with_headphones",
    openai: "futuristic_ai_robot_face_with_glowing_circuits",
    mistral: "mystical_wind_spirit_face_ethereal_portrait",
    "mistral-large": "majestic_cosmic_being_portrait_stellar_background",
    llama: "wise_llama_face_wearing_glasses_professor",
    p1: "advanced_ai_entity_portrait_digital_interface",
    "qwen-coder": "cyberpunk_programmer_portrait_neon_lights",
    searchgpt: "futuristic_librarian_hologram_assistant",
  };

  const prompt = prompts[modelName] || "artificial_intelligence_portrait_digital";
  const seed = Math.floor(Date.now() / (1000 * 60 * 60));
  const avatarUrl = `${POLLINATIONS_IMAGE_BASE_URL}${prompt}?width=512&height=512&model=flux&nologo=true&seed=${seed}`;

  avatarCache[storageKey] = avatarUrl;
  return avatarUrl;
}

/**
 * A helper function to get a "unity" avatar specifically.
 * @returns {Promise<string>} The unity avatar image URL.
 */
export async function getUnityAvatarFromPollinations() {
  return await getModelAvatarFromPollinations("unity");
}

/**
 * Use the "searchgpt" model to handle specialized search queries.
 * @param {string} query - The query to search.
 * @returns {Promise<string>} The response text from the model.
 */
export async function searchWithChatGPT(query) {
  const messages = [{ role: "user", content: query }];
  const responseStream = await sendTextRequestToPollinations(messages, "searchgpt", false);
  const responseText = await readFullResponse(responseStream);
  return responseText;
}

/**
 * Enhance a given prompt by sending it to an LLM (OpenAI) with a system prompt that instructs it to improve the prompt.
 * @param {string} originalPrompt - The original prompt to enhance.
 * @returns {Promise<string>} The enhanced prompt.
 */
export async function enhancePrompt(originalPrompt) {
  const messages = [
    {
      role: "system",
      content: "You are a prompt-enhancement assistant. The user will provide a prompt for an LLM. Your job is to rewrite it into a better, more detailed, and more effective prompt. Keep it concise and focused.",
    },
    {
      role: "user",
      content: originalPrompt,
    },
  ];

  // Using openai model which returns a full response (not streaming)
  const responseStream = await sendTextRequestToPollinations(messages, "openai", false);
  const responseText = await readFullResponse(responseStream);
  return responseText.trim();
}

/**
 * Reads a streaming response fully and returns its text content.
 * Works in both browser and Node.js (v18+) environments that support web streams.
 * @param {ReadableStream} stream - The readable stream from fetch's response.body.
 * @returns {Promise<string>} The full response text.
 */
async function readFullResponse(stream) {
  const reader = stream.getReader();
  let fullText = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fullText += new TextDecoder().decode(value);
  }
  return fullText;
}

/*
Usage Examples:

In a Browser (ESM):
<script type="module">
  import { fetchModelsFromPollinations, searchWithChatGPT } from './pollinations.js';

  async function runExample() {
    const models = await fetchModelsFromPollinations();
    console.log("Models:", models);

    const result = await searchWithChatGPT("What is the capital of France?");
    console.log("Search result:", result);
  }

  runExample();
</script>

In a Node.js (v18+) environment:
import { fetchModelsFromPollinations, enhancePrompt } from './pollinations.js';

async function main() {
  const models = await fetchModelsFromPollinations();
  console.log("Models:", models);

  const originalPrompt = "Tell me about quantum computing.";
  const enhanced = await enhancePrompt(originalPrompt);
  console.log("Enhanced Prompt:", enhanced);
}

main();

In a Node.js Environment (older versions):
// If Node.js < v18, you need a fetch polyfill
import fetch from 'node-fetch';
global.fetch = fetch; // makes fetch available globally

import { searchWithChatGPT } from './pollinations.js';

async function main() {
  const response = await searchWithChatGPT("What's the weather in Berlin?");
  console.log("Response:", response);
}

main();

*/

