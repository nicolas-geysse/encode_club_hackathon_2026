
async function checkDim() {
    try {
        const response = await fetch('http://localhost:11435/api/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'm2v-bge-m3-1024d',
                prompt: 'test'
            })
        });
        const data = await response.json();
        if (data.embedding) {
            console.log('Dimension:', data.embedding.length);
        } else {
            console.error('No embedding in response:', data);
        }
    } catch (e) {
        console.error('Error:', e);
    }
}
checkDim();
