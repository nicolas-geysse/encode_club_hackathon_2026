import duckdb from 'duckdb';
const { Database } = duckdb;

console.log('Checking DuckDB VSS extension...');
const db = new Database(':memory:');

db.all('INSTALL vss; LOAD vss;', (err) => {
    if (err) {
        console.error('VSS Install/Load Failed:', err);
        process.exit(1);
    }
    console.log('VSS Extension Loaded Successfully!');

    // Test a vector operation (cosine similarity)
    // VSS typically adds functions like array_cosine_similarity
    db.all('SELECT array_cosine_similarity([1.0, 0.0, 0.0]::FLOAT[3], [1.0, 0.0, 0.0]::FLOAT[3]) as sim', (err, res) => {
        if (err) {
            console.error('Vector Op Failed:', err);
            process.exit(1);
        }
        console.log('Vector ops working:', res);
        process.exit(0);
    });
});
