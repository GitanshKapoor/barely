import { Key, Cpu, Database, Globe } from 'lucide-react';

const sections = [
  {
    icon: Key,
    title: 'API Keys',
    description: 'Configure your LLM provider API key. Barely supports any provider via LiteLLM (Anthropic, OpenAI, Groq, Gemini).',
    fields: [
      { label: 'ANTHROPIC_API_KEY', placeholder: 'sk-ant-...', type: 'password' },
      { label: 'OPENAI_API_KEY', placeholder: 'sk-...', type: 'password' },
      { label: 'GROQ_API_KEY', placeholder: 'gsk_...', type: 'password' },
    ]
  },
  {
    icon: Cpu,
    title: 'AI Model',
    description: 'Set the LiteLLM model string for the agent. Prefix with the provider (e.g. anthropic/claude-sonnet-4-5).',
    fields: [
      { label: 'Model', placeholder: 'anthropic/claude-sonnet-4-5', type: 'text' },
    ]
  },
  {
    icon: Database,
    title: 'Database',
    description: 'PostgreSQL connection string. Configured via the DATABASE_URL environment variable in docker-compose.',
    fields: [
      { label: 'DATABASE_URL', placeholder: 'postgresql://barely:...@barely-db:5432/barelydb', type: 'text' },
    ]
  },
  {
    icon: Globe,
    title: 'Agent Defaults',
    description: 'Default settings applied to new test runs.',
    fields: [
      { label: 'Default Device', placeholder: 'desktop', type: 'text' },
      { label: 'Max Steps', placeholder: '20', type: 'number' },
    ]
  },
];

export default function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Settings</h2>
        <p className="text-sm text-slate-500 mt-1">Configure Barely platform settings.</p>
      </div>

      <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-5 py-4 text-sm text-yellow-300">
        ⚠️ Settings are currently read from environment variables. UI-based persistence is coming soon.
      </div>

      <div className="space-y-4">
        {sections.map((s) => (
          <div key={s.title} className="rounded-xl border border-slate-800 bg-slate-900/20 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-3">
              <s.icon className="w-4 h-4 text-blue-400" />
              <div>
                <p className="text-sm font-semibold text-slate-200">{s.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.description}</p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              {s.fields.map((f) => (
                <div key={f.label} className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    disabled
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-500 placeholder-slate-700 cursor-not-allowed"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
