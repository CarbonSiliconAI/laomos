
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';

async function listModels() {
    try {
        const keysPath = path.join(process.cwd(), 'storage/system/keys.json');
        if (!fs.existsSync(keysPath)) {
            console.log('No keys file found.');
            return;
        }
        const keys = await fs.readJson(keysPath);
        const googleKey = keys['google'];

        if (!googleKey) {
            console.log('No Google key found.');
            return;
        }

        console.log('Listing models for key starting with:', googleKey.substring(0, 5) + '...');
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${googleKey}`;

        try {
            const response = await axios.get(url);
            console.log('\n--- AVAILABLE MODELS ---');
            response.data.models.forEach((m: any) => {
                console.log(`- ${m.name} (${m.supportedGenerationMethods.join(', ')})`);
            });
            console.log('------------------------\n');
        } catch (apiError: any) {
            console.error('API Error:', apiError.response?.data || apiError.message);
        }

    } catch (e) {
        console.error(e);
    }
}

listModels();
