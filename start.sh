#!/bin/bash
echo "🚀 Starting Grocery WMS..."

# Start backend
cd "$(dirname "$0")/backend"

# Seed data if DB doesn't exist
if [ ! -f "wms.db" ]; then
  echo "📦 Creating database and seeding sample data..."
  python3 seed.py
fi

echo "🔧 Starting API server on http://localhost:8000 ..."
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Start frontend
cd "$(dirname "$0")/frontend"
echo "🌐 Starting frontend on http://localhost:5173 ..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ WMS is running!"
echo "   Frontend: http://localhost:5173"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

# Wait and cleanup
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Servers stopped.'" EXIT
wait
