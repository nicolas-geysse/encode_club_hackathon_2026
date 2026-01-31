
// Using native fetch in Node 20+

async function testChatHistory() {
    const url = 'http://localhost:3006/api/chat-history';

    // Test case from user report: JSON with quoted strings
    const payload = {
        profile_id: 'test-debug-13-15',
        role: 'user',
        content: 'Test with "quotes"',
        extracted_data: {
            subscription: 'Netflix "Premium"'
        },
        ui_resource: {
            element: 'button',
            label: "Don't click \"me\""
        }
    };

    try {
        console.log('Sending payload:', JSON.stringify(payload, null, 2));
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`Error ${response.status}:`, text);
        } else {
            const json = await response.json();
            console.log('Success:', json);
        }
    } catch (error) {
        console.error('Fetch error:', error);
    }
}

testChatHistory();
