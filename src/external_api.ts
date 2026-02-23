import axios from 'axios';
import { IdentityManager } from './identity_manager';
import { TraceEvent } from './kernel/tool_registry';

export class ExternalAPIManager {
    private identityManager: IdentityManager;

    constructor(identityManager: IdentityManager) {
        this.identityManager = identityManager;
    }

    async generateImage(provider: string, prompt: string, onProgress?: (event: TraceEvent) => void): Promise<string> {
        const stepTimers: Record<string, number> = {};
        const emit = (step: string, status: TraceEvent['status'], details?: string) => {
            let durationMs: number | undefined;
            if (status === 'running') {
                stepTimers[step] = Date.now();
            } else if (status === 'completed' || status === 'error') {
                if (stepTimers[step]) durationMs = Date.now() - stepTimers[step];
                else durationMs = 0;
            }
            if (onProgress) onProgress({ step, status, details, durationMs });
        };

        emit('Pre-flight Validation', 'running', `Validating input for provider: ${provider}`);
        if (provider === 'mock') {
            emit('Pre-flight Validation', 'completed', 'Provider is mock.');
            emit('Image Generation', 'running', 'Simulating generation time...');
            await new Promise(r => setTimeout(r, 1000));
            emit('Image Generation', 'completed', 'Mock image ready.');
            return "https://placehold.co/1024x1024/21262d/white?text=AI+Generated+Image";
        }

        const key = await this.identityManager.getKey(provider);
        if (!key) {
            emit('Pre-flight Validation', 'error', `API Key for ${provider} not found.`);
            throw new Error(`API Key for ${provider} not found.`);
        }
        emit('Pre-flight Validation', 'completed', 'Keys validated.');

        if (provider === 'openai') {
            try {
                emit('Image Generation (DALL-E)', 'running', 'Sending prompt to OpenAI API...');
                const response = await axios.post('https://api.openai.com/v1/images/generations', {
                    model: "dall-e-3",
                    prompt: prompt,
                    n: 1,
                    size: "1024x1024"
                }, {
                    headers: { 'Authorization': `Bearer ${key}` }
                });

                emit('Image Generation (DALL-E)', 'completed', 'Received image URL from OpenAI.');
                return response.data.data[0].url;
            } catch (error: any) {
                const msg = error.response?.data?.error?.message || error.message;
                console.error('OpenAI Image Error:', error.response?.data || error.message);
                emit('Image Generation (DALL-E)', 'error', msg);
                throw new Error(`OpenAI Error: ${msg}`);
            }
        }

        if (provider === 'google') {
            try {
                emit('Image Generation (Imagen 3)', 'running', 'Sending prompt to Google API...');
                const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generateImages-001:predict?key=${key}`;
                const response = await axios.post(url, {
                    instances: [
                        { prompt: prompt }
                    ],
                    parameters: {
                        sampleCount: 1
                    }
                });

                // Google returns base64
                // content.predictions[0].bytesBase64Encoded
                if (response.data.predictions && response.data.predictions.length > 0) {
                    const b64 = response.data.predictions[0].bytesBase64Encoded;
                    emit('Image Generation (Imagen 3)', 'completed', 'Received image URL from Google.');
                    return `data:image/png;base64,${b64}`;
                } else {
                    emit('Image Generation (Imagen 3)', 'error', 'No image returned from Google.');
                    throw new Error('No image returned from Google.');
                }
            } catch (error: any) {
                let msg = error.response?.data?.error?.message || error.message;
                if (msg.includes('not found') || msg.includes('not supported')) {
                    msg = "Imagen 3 model not found for your key. It may require whitelisting. Try using Mock provider.";
                }
                console.error('Google Image Error:', error.response?.data || error.message);
                emit('Image Generation (Imagen 3)', 'error', msg);
                throw new Error(`Google Error: ${msg}`);
            }
        }

        // Mock fallback for others or if implemented
        throw new Error(`Provider ${provider} not supported for image generation.`);
    }

    async generateGraph(provider: string, prompt: string, onProgress?: (event: TraceEvent) => void): Promise<string> {
        const stepTimers: Record<string, number> = {};
        const emit = (step: string, status: TraceEvent['status'], details?: string) => {
            let durationMs: number | undefined;
            if (status === 'running') stepTimers[step] = Date.now();
            else if (status === 'completed' || status === 'error') {
                durationMs = stepTimers[step] ? Date.now() - stepTimers[step] : 0;
            }
            if (onProgress) onProgress({ step, status, details, durationMs });
        };

        emit('Pre-flight Validation', 'running', `Validating input for provider: ${provider}`);
        if (provider === 'mock') {
            emit('Pre-flight Validation', 'completed', 'Provider is mock.');
            emit('Graph Generation', 'running', 'Simulating generation time...');
            // Simulating generation time
            await new Promise(r => setTimeout(r, 1000));
            emit('Graph Generation', 'completed', 'Mock graph ready.');
            return `graph TD
    A[Mock] --> B{Is it working?}
    B -- Yes --> C[Great!]
    B -- No --> D[Debug more]`;
        }

        const key = await this.identityManager.getKey(provider);
        if (!key) {
            emit('Pre-flight Validation', 'error', `API Key for ${provider} not found.`);
            throw new Error(`API Key for ${provider} not found.`);
        }
        emit('Pre-flight Validation', 'completed', 'Keys validated.');

        const systemPrompt = "You are a helper that generates Mermaid.js diagram code. Return ONLY the mermaid code, no markdown ticks, no commentary. Starts with 'graph' or 'sequenceDiagram'.";

        if (provider === 'openai') {
            try {
                emit('Graph Generation (GPT-4o)', 'running', 'Sending prompt to OpenAI API...');
                const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                    model: "gpt-4o",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: `Create a diagram for: ${prompt}` }
                    ]
                }, {
                    headers: { 'Authorization': `Bearer ${key}` }
                });
                let content = response.data.choices[0].message.content;
                content = content.replace(/```mermaid/g, '').replace(/```/g, '').trim();
                emit('Graph Generation (GPT-4o)', 'completed', 'Received graph logic from OpenAI.');
                return content;
            } catch (error: any) {
                console.error('OpenAI Graph Error:', error.response?.data || error.message);
                emit('Graph Generation (GPT-4o)', 'error', 'Failed to generate graph with OpenAI');
                throw new Error('Failed to generate graph with OpenAI');
            }
        } else if (provider === 'google') {
            try {
                emit('Graph Generation (Gemini)', 'running', 'Sending prompt to Google Gemini API...');
                let url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
                try {
                    const response = await axios.post(url, {
                        contents: [{ parts: [{ text: `${systemPrompt}\n\nTask: ${prompt}` }] }]
                    });
                    let content = response.data.candidates[0].content.parts[0].text;
                    content = content.replace(/```mermaid/g, '').replace(/```/g, '').trim();
                    emit('Graph Generation (Gemini)', 'completed', 'Received graph logic from Google.');
                    return content;
                } catch (e: any) {
                    if (e.response?.status === 404) {
                        console.log('Gemini 1.5 Flash not found, trying Gemini Pro...');
                        url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${key}`;
                        const response = await axios.post(url, {
                            contents: [{ parts: [{ text: `${systemPrompt}\n\nTask: ${prompt}` }] }]
                        });
                        let content = response.data.candidates[0].content.parts[0].text;
                        content = content.replace(/```mermaid/g, '').replace(/```/g, '').trim();
                        return content;
                    }
                    throw e; // rethrow if not 404 or retry failed
                }
            } catch (error: any) {
                console.error('Google Graph Error:', error.response?.data || error.message);
                throw new Error('Failed to generate graph with Google (Gemini 1.5/Pro)');
            }
        }

        throw new Error(`Provider ${provider} not supported for graph generation.`);
    }

    async verifyKey(provider: string): Promise<boolean> {
        const key = await this.identityManager.getKey(provider);
        if (!key) throw new Error(`API Key for ${provider} not found.`);

        try {
            if (provider === 'openai') {
                // OpenAI: List Models as a cheap check
                // https://api.openai.com/v1/models
                await axios.get('https://api.openai.com/v1/models', {
                    headers: { 'Authorization': `Bearer ${key}` }
                });
                return true;
            } else if (provider === 'google') {
                // Google Gemini: List Models
                // https://generativelanguage.googleapis.com/v1beta/models?key=API_KEY
                await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
                return true;
            } else if (provider === 'grok') {
                // Grok (xAI): Compatible with OpenAI SDK/Endpoints usually
                // https://api.x.ai/v1/models
                await axios.get('https://api.x.ai/v1/models', {
                    headers: { 'Authorization': `Bearer ${key}` }
                });
                return true;
            }
        } catch (error: any) {
            console.error(`Verification failed for ${provider}:`, error.response?.data || error.message);
            // If it's a 401/403, it's definitely invalid. 
            // 429 might mean valid but rate limited/quota, but for "verification" purposes usually implies "not working".
            // We'll let the caller handle the specific error message if we want, or just return false.
            // For now, return false.
            return false;
        }

        throw new Error(`Provider ${provider} not supported for verification.`);
    }

    async generateVideo(provider: string, prompt: string, onProgress?: (event: TraceEvent) => void): Promise<string> {
        const stepTimers: Record<string, number> = {};
        const emit = (step: string, status: TraceEvent['status'], details?: string) => {
            let durationMs: number | undefined;
            if (status === 'running') stepTimers[step] = Date.now();
            else if (status === 'completed' || status === 'error') {
                durationMs = stepTimers[step] ? Date.now() - stepTimers[step] : 0;
            }
            if (onProgress) onProgress({ step, status, details, durationMs });
        };

        emit('Pre-flight Validation', 'running', `Validating input for provider: ${provider}`);
        if (provider === 'mock') {
            emit('Pre-flight Validation', 'completed', 'Provider is mock.');
            emit('Video Generation', 'running', 'Simulating generation time...');
            // Simulating generation time
            await new Promise(r => setTimeout(r, 1500));
            emit('Video Generation', 'completed', 'Mock video ready.');
            return "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
        }

        const key = await this.identityManager.getKey(provider);
        if (!key) {
            emit('Pre-flight Validation', 'error', `API Key for ${provider} not found.`);
            throw new Error(`API Key for ${provider} not found.`);
        }
        emit('Pre-flight Validation', 'completed', 'Keys validated.');

        if (provider === 'google') {
            try {
                const model = 'veo-2.0-generate-001';
                emit('Job Submission (Veo 2.0)', 'running', 'Sending prompt to Google Veo API...');
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${key}`;

                const initialRes = await axios.post(url, {
                    instances: [{ prompt: prompt }]
                });

                const operationName = initialRes.data.name; // e.g., "operations/..."
                if (!operationName) {
                    emit('Job Submission (Veo 2.0)', 'error', 'Failed to start video generation operation.');
                    throw new Error('Failed to start video generation operation.');
                }

                emit('Job Submission (Veo 2.0)', 'completed', `Operation started: ${operationName}`);

                const maxRetries = 60; // 60 * 2s = 2 minutes timeout
                for (let i = 0; i < maxRetries; i++) {
                    emit(`Polling Status (Attempt ${i + 1}/${maxRetries})`, 'running', `Waiting 2s then checking ${operationName}...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${key}`;
                    const pollRes = await axios.get(pollUrl);
                    const op = pollRes.data;

                    if (op.done) {
                        if (op.error) {
                            emit(`Polling Status (Attempt ${i + 1}/${maxRetries})`, 'error', `Video generation failed: ${op.error.message}`);
                            throw new Error(`Video generation failed: ${op.error.message}`);
                        }

                        let payload = op.response;
                        if (typeof payload === 'string') {
                            try { payload = JSON.parse(payload); } catch (e) { }
                        }

                        const samples = payload?.generateVideoResponse?.generatedSamples
                            || payload?.generatedSamples
                            || op?.generateVideoResponse?.generatedSamples
                            || op?.generatedSamples;

                        if (samples && Array.isArray(samples) && samples.length > 0) {
                            const firstSample = samples[0];
                            if (firstSample?.video?.uri) {
                                emit(`Polling Status (Attempt ${i + 1}/${maxRetries})`, 'completed', 'Video URI resolved.');
                                return firstSample.video.uri;
                            }
                            if (firstSample?.videoUri) {
                                emit(`Polling Status (Attempt ${i + 1}/${maxRetries})`, 'completed', 'Video URI resolved.');
                                return firstSample.videoUri;
                            }
                        }

                        if (payload && payload.predictions && payload.predictions.length > 0) {
                            const pred = payload.predictions[0];
                            if (pred.videoUri) {
                                emit(`Polling Status (Attempt ${i + 1}/${maxRetries})`, 'completed', 'Video URI resolved.');
                                return pred.videoUri;
                            }
                            if (pred.bytesBase64Encoded) {
                                emit(`Polling Status (Attempt ${i + 1}/${maxRetries})`, 'completed', 'Video payload resolved (Base64).');
                                return `data:video/mp4;base64,${pred.bytesBase64Encoded}`;
                            }
                        }

                        if (op.result && op.result.videoUri) {
                            emit(`Polling Status (Attempt ${i + 1}/${maxRetries})`, 'completed', 'Video URI resolved from result.');
                            return op.result.videoUri;
                        }

                        console.error('Unexpected operation result:', JSON.stringify(op, null, 2));
                        emit(`Polling Status (Attempt ${i + 1}/${maxRetries})`, 'error', 'Video generated but result format is unrecognized.');
                        throw new Error('Video generated but result format is unrecognized.');
                    }
                    emit(`Polling Status (Attempt ${i + 1}/${maxRetries})`, 'completed', 'Not done yet, continuing poll.');
                }
                emit('Polling Timeout', 'error', 'Video generation timed out.');
                throw new Error('Video generation timed out.');

            } catch (error: any) {
                let msg = error.response?.data?.error?.message || error.message;
                if (msg.includes('not found') || msg.includes('not supported')) {
                    msg = "Google Veo model (veo-2.0-generate-001) not found. Your key might not have access to this specific model version.";
                }
                console.error('Google Video Error:', error.response?.data || error.message);
                emit('Graph Generation (Google)', 'error', msg);
                throw new Error(`Google Error: ${msg}`);
            }
        }

        if (provider === 'openai') {
            try {
                emit('Video Generation (Sora)', 'running', 'Sending prompt to OpenAI API...');
                const url = 'https://api.openai.com/v1/video/generations';
                const response = await axios.post(url, {
                    model: "sora",
                    prompt: prompt,
                }, {
                    headers: { 'Authorization': `Bearer ${key}` }
                });

                if (response.data.data && response.data.data.length > 0) {
                    emit('Video Generation (Sora)', 'completed', 'Received video link from OpenAI.');
                    return response.data.data[0].url;
                }
                emit('Video Generation (Sora)', 'error', 'No video returned from OpenAI.');
                throw new Error('No video returned from OpenAI.');
            } catch (error: any) {
                let msg = error.response?.data?.error?.message || error.message;
                if (error.response?.status === 404 || msg.includes('not found') || msg.includes('does not exist')) {
                    msg = "OpenAI video model (Sora) is not yet available via public API on your key. Please select 'Mock' provider.";
                }
                console.error('OpenAI Video Error:', error.response?.data || error.message);
                emit('Video Generation (Sora)', 'error', msg);
                throw new Error(`OpenAI Error: ${msg}`);
            }
        }

        throw new Error(`Provider ${provider} not supported for video generation.`);
    }
}
