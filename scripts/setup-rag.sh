#!/bin/bash
# Setup script for RAG infrastructure

set -e

echo "=== RAG Setup Script ==="

# Create data directory for vector store
DATA_DIR="./data"
mkdir -p "$DATA_DIR"
echo "Created data directory: $DATA_DIR"

# Create models directory (for optional local ONNX models)
MODELS_DIR="./models"
mkdir -p "$MODELS_DIR"
echo "Created models directory: $MODELS_DIR"

# Optional: Convert Mod2Vec model to ONNX for faster inference
# Uncomment to use local model instead of HuggingFace download
# echo "Converting Mod2Vec model to ONNX..."
# pip install model2vec onnx
# cat > "$MODELS_DIR/export_model.py" << 'EOF'
# from model2vec import StaticModel
# import os
#
# os.makedirs("./models", exist_ok=True)
# model = StaticModel.from_pretrained("tss-deposium/m2v-bge-m3-1024d")
# model.export_onnx("./models/m2v-bge-m3-1024d.onnx")
# print("Exported to ./models/m2v-bge-m3-1024d.onnx")
# EOF
# python "$MODELS_DIR/export_model.py"

echo ""
echo "=== RAG Setup Complete ==="
echo ""
echo "The RAG system will use:"
echo "  - Vector Store: $DATA_DIR/stride-vectors.duckdb"
echo "  - Embedding Model: Xenova/bge-m3 (downloaded on first use)"
echo ""
echo "To test RAG, use the MCP tools:"
echo "  - index_student_profile: Index a profile"
echo "  - get_rag_context: Query similar context"
echo "  - find_similar_students: Find similar profiles"
echo ""
