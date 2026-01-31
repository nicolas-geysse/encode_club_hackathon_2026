
const url = 'http://127.0.0.1:11436/api/tags';
console.log(`Fetching ${url}...`);
try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Status: ${res.status}`);
    const json = await res.json();
    console.log('Success!', json.models.map(m => m.name));
} catch (e) {
    console.error('Fetch failed:', e);
}
