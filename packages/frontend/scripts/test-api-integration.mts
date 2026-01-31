
async function testApi() {
    const profileId = 'user-test-api-' + Date.now();
    console.log(`Testing API with profileId: ${profileId}`);

    const payload = {
        message: "I love coding in Python",
        step: "greeting",
        mode: "conversation",
        profileId: profileId,
        threadId: "test-thread",
        context: {
            name: "Test User",
            city: "Paris"
        },
        conversationHistory: []
    };

    try {
        const response = await fetch('http://localhost:3006/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        console.log(`Response Status: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.log(`Response Body Preview: ${text.substring(0, 500)}`);

        if (!response.ok) {
            throw new Error(`API failed with status ${response.status}`);
        }

        const json = JSON.parse(text);
        console.log('Parsed JSON Success:', Object.keys(json));

        if (json.extractedData && json.extractedData.workingMemoryUpdates) {
            console.log('Working Memory Updates:', json.extractedData.workingMemoryUpdates);
        }

    } catch (error) {
        console.error('Test Failed:', error);
        process.exit(1);
    }
}

testApi();
