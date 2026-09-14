'use client';
import { useState } from 'react';
import { Play } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function RunTestButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRun = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal_file: '.barely/goals/example.md' })
      });
      
      if (res.ok) {
        // Refresh the page data after a slight delay to let the worker start
        setTimeout(() => router.refresh(), 2000);
      } else {
        alert("Failed to queue the test. Check API logs.");
      }
    } catch (e) {
      alert("Error connecting to the API.");
    }
    setLoading(false);
  };

  return (
    <button 
      onClick={handleRun} 
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
    >
      <Play className="w-4 h-4 fill-current" />
      {loading ? 'Queueing Job...' : 'Run Example Test'}
    </button>
  );
}
