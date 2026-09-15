import io
import json
import zipfile
import html as html_lib
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse
from barely_core.db import SessionLocal, RunRecord, RunStep

router = APIRouter()

def extract_goal_instructions(goal_text: str) -> list:
    import re
    if not goal_text:
        return []
    instructions = []
    for line in goal_text.splitlines():
        line = line.strip()
        m = re.match(r'^\d+[\.\)]\s*(.+)$', line)
        if m:
            instructions.append(m.group(1).strip())
        elif line.startswith("- ") or line.startswith("* "):
            instructions.append(line[2:].strip())
    return instructions

def generate_report_html(run, steps) -> str:
    is_success = run.status == "completed" and run.success
    status_bg = "#10b981" if is_success else "#f43f5e" if run.status == "completed" else "#64748b" if run.status == "cancelled" else "#f59e0b"
    status_label = "PASSED" if is_success else "FAILED" if run.status == "completed" else run.status.upper()

    failure_html = ""
    if not run.success and run.failure_reason:
        escaped_reason = html_lib.escape(run.failure_reason)
        failure_html = f"""
        <div class="failure-box">
            <div class="failure-title">
                <span>🚨</span>
                <span>Root Cause Diagnostic & Failure Reason</span>
            </div>
            <div class="failure-content">
                {escaped_reason}
            </div>
        </div>
        """

    goal_instructions = extract_goal_instructions(run.goal or "")

    steps_html = ""
    for s in steps:
        target_instruction = goal_instructions[s.step_index] if s.step_index < len(goal_instructions) else None
        target_html = ""
        if target_instruction:
            target_html = f"""
            <div class="step-target">
                <span class="target-tag">🎯 Goal Instruction (Step {s.step_index + 1})</span>
                <p class="target-text">{html_lib.escape(target_instruction)}</p>
            </div>
            """

        thought_snippet = ""
        if s.thought:
            thought_snippet = f"""
            <div class="step-thought">
                <span class="thought-tag">💭 AI Agent Reasoning</span>
                <p class="thought-text">"{html_lib.escape(s.thought)}"</p>
            </div>
            """

        action_snippet = f"""
        <div class="step-action-box">
            <span class="action-tag">⚡ Action Executed</span>
            <p class="action-text">{html_lib.escape(s.description)}</p>
        </div>
        """

        img_snippet = ""
        if s.screenshot_base64:
            img_snippet = f"""
            <div class="step-screenshot">
                <img src="data:image/jpeg;base64,{s.screenshot_base64}" alt="Step {s.step_index + 1} Visual" />
            </div>
            """

        steps_html += f"""
        <div class="step-card">
            <div class="step-header">
                <span class="step-pill">Execution Step {s.step_index + 1}</span>
            </div>
            {target_html}
            {thought_snippet}
            {action_snippet}
            {img_snippet}
        </div>
        """

    tags_html = ""
    if getattr(run, "tags", None):
        tag_items = "".join([f'<span class="tag-pill">#{html_lib.escape(t.strip())}</span>' for t in run.tags.split(",") if t.strip()])
        if tag_items:
            tags_html = f'<div class="meta-item"><strong>Tags:</strong> {tag_items}</div>'

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Barely Audit: {html_lib.escape(run.name or run.id)}</title>
    <style>
        :root {{
            --bg: #090d16;
            --card-bg: #0d1322;
            --border: #1e293b;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --accent: #0278ff;
            --danger: #f43f5e;
            --success: #10b981;
        }}
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: var(--bg);
            color: var(--text-primary);
            padding: 32px 16px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }}
        .container {{
            max-width: 960px;
            margin: 0 auto;
        }}
        .header {{
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
        }}
        .header-top {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }}
        .title {{
            font-size: 20px;
            font-weight: 700;
        }}
        .status-badge {{
            background-color: {status_bg};
            color: #ffffff;
            font-size: 12px;
            font-weight: 800;
            padding: 4px 12px;
            border-radius: 20px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }}
        .meta-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 12px;
            font-size: 12px;
            color: var(--text-secondary);
            border-top: 1px solid var(--border);
            padding-top: 16px;
        }}
        .meta-item strong {{ color: #e2e8f0; }}
        .tag-pill {{
            display: inline-block;
            font-size: 11px;
            font-family: monospace;
            padding: 2px 8px;
            border-radius: 4px;
            background: rgba(2, 120, 255, 0.15);
            color: #60a5fa;
            border: 1px solid rgba(2, 120, 255, 0.3);
            margin-right: 4px;
        }}
        .goal-box {{
            background-color: rgba(15, 23, 42, 0.6);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 14px;
            margin-top: 16px;
            font-family: monospace;
            font-size: 12px;
            color: #cbd5e1;
            white-space: pre-wrap;
        }}
        .failure-box {{
            background-color: rgba(244, 63, 94, 0.1);
            border: 1px solid rgba(244, 63, 94, 0.4);
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 24px;
        }}
        .failure-title {{
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            font-weight: 700;
            color: var(--danger);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 10px;
        }}
        .failure-content {{
            font-family: monospace;
            font-size: 12px;
            color: #fecdd3;
            background: rgba(0,0,0,0.3);
            padding: 12px;
            border-radius: 6px;
            line-height: 1.6;
            white-space: pre-wrap;
        }}
        .section-title {{
            font-size: 16px;
            font-weight: 700;
            margin: 32px 0 16px 0;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--border);
        }}
        .step-card {{
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 16px;
            page-break-inside: avoid;
            break-inside: avoid;
        }}
        .step-header {{
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
        }}
        .step-pill {{
            background: #1e293b;
            color: #38bdf8;
            font-size: 11px;
            font-weight: 700;
            padding: 3px 10px;
            border-radius: 4px;
            font-family: monospace;
        }}
        .step-target {{
            background: rgba(16, 185, 129, 0.08);
            border-left: 3px solid var(--success);
            border-radius: 4px;
            padding: 10px 14px;
            margin-bottom: 12px;
        }}
        .target-tag {{
            display: block;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #34d399;
            margin-bottom: 4px;
        }}
        .target-text {{
            font-size: 13px;
            color: #e2e8f0;
            font-weight: 600;
            line-height: 1.4;
        }}
        .step-thought {{
            background: rgba(2, 120, 255, 0.08);
            border-left: 3px solid var(--accent);
            border-radius: 4px;
            padding: 10px 14px;
            margin-bottom: 12px;
        }}
        .thought-tag {{
            display: block;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #38bdf8;
            margin-bottom: 4px;
        }}
        .thought-text {{
            font-size: 12px;
            color: #94a3b8;
            font-style: italic;
            line-height: 1.5;
        }}
        .step-action-box {{
            background: rgba(245, 158, 11, 0.08);
            border-left: 3px solid #f59e0b;
            border-radius: 4px;
            padding: 10px 14px;
            margin-bottom: 14px;
        }}
        .action-tag {{
            display: block;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #fbbf24;
            margin-bottom: 4px;
        }}
        .action-text {{
            font-size: 13px;
            color: #f8fafc;
            font-weight: 600;
            line-height: 1.4;
        }}
        .step-screenshot {{
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid var(--border);
            background: #000;
        }}
        .step-screenshot img {{
            display: block;
            width: 100%;
            height: auto;
            max-height: 480px;
            object-fit: contain;
        }}
        .footer {{
            text-align: center;
            margin-top: 40px;
            font-size: 11px;
            color: var(--text-secondary);
            font-family: monospace;
        }}

        @media print {{
            @page {{
                margin: 15mm;
                size: portrait;
            }}
            body {{
                background: #ffffff !important;
                color: #0f172a !important;
                padding: 0 !important;
            }}
            .header, .step-card, .goal-box {{
                background: #ffffff !important;
                border: 1px solid #cbd5e1 !important;
                color: #0f172a !important;
                box-shadow: none !important;
                page-break-inside: avoid;
                break-inside: avoid;
            }}
            .title {{ color: #0f172a !important; }}
            .meta-item strong {{ color: #0f172a !important; }}
            .meta-item {{ color: #475569 !important; }}
            .step-target {{ background: #f0fdf4 !important; border-left: 3px solid #10b981 !important; }}
            .target-tag {{ color: #059669 !important; }}
            .target-text {{ color: #065f46 !important; }}
            .step-thought {{ background: #f1f5f9 !important; border-left: 3px solid #0278ff !important; }}
            .thought-tag {{ color: #0284c7 !important; }}
            .thought-text {{ color: #475569 !important; }}
            .step-action-box {{ background: #fffbeb !important; border-left: 3px solid #f59e0b !important; }}
            .action-tag {{ color: #d97706 !important; }}
            .action-text {{ color: #92400e !important; }}
            .tag-pill {{ background: #eff6ff !important; color: #1d4ed8 !important; border: 1px solid #bfdbfe !important; }}
            .step-screenshot {{ background: #f8fafc !important; border: 1px solid #cbd5e1 !important; }}
            .failure-content {{ background: #fff1f2 !important; color: #9f1239 !important; border: 1px solid #fecdd3 !important; }}
            .step-pill {{ background: #e2e8f0 !important; color: #334155 !important; }}
            .section-title {{ color: #0f172a !important; }}
            .footer {{ color: #94a3b8 !important; }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-top">
                <div class="title">{html_lib.escape(run.name or run.id)}</div>
                <div class="status-badge">{status_label}</div>
            </div>
            <div class="meta-grid">
                <div class="meta-item"><strong>Run ID:</strong> {run.id}</div>
                <div class="meta-item"><strong>Target URL:</strong> {run.start_url}</div>
                <div class="meta-item"><strong>Device Profile:</strong> {run.device}</div>
                <div class="meta-item"><strong>Strict Mode:</strong> {'Enabled' if run.strict_mode else 'Disabled (Auto-Healing)'}</div>
                <div class="meta-item"><strong>Executed At:</strong> {run.created_at}</div>
                <div class="meta-item"><strong>Steps Executed:</strong> {len(steps)}</div>
                {tags_html}
            </div>
            <div class="goal-box">{html_lib.escape(run.goal)}</div>
        </div>

        {failure_html}

        <div class="section-title">Execution Steps & Visual Timeline ({len(steps)})</div>
        {steps_html if steps_html else '<p style="color: #64748b; font-size: 13px;">No execution steps were recorded.</p>'}

        <div class="footer">
            Generated by Barely v1.0 "Baby Kangaroo" Autonomous E2E QA Agent
        </div>
    </div>

    <script>
        if (window.location.search.includes('print=true')) {{
            window.addEventListener('load', function() {{
                setTimeout(function() {{ window.print(); }}, 400);
            }});
        }}
    </script>
</body>
</html>"""

@router.get("/api/runs/{run_id}/report", response_class=HTMLResponse)
def get_run_report(run_id: str):
    db = SessionLocal()
    try:
        run = db.query(RunRecord).filter(RunRecord.id == run_id).first()
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
            
        steps = db.query(RunStep).filter(RunStep.run_id == run_id).order_by(RunStep.step_index).all()
        return generate_report_html(run, steps)
    finally:
        db.close()

@router.get("/api/runs/{run_id}/download")
def download_report(run_id: str):
    db = SessionLocal()
    try:
        run = db.query(RunRecord).filter(RunRecord.id == run_id).first()
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
            
        steps = db.query(RunStep).filter(RunStep.run_id == run_id).order_by(RunStep.step_index).all()
        goal_instructions = extract_goal_instructions(run.goal or "")
        
        # 1. JSON payload
        run_data = {
            "id": run.id,
            "name": run.name,
            "goal": run.goal,
            "start_url": run.start_url,
            "device": run.device,
            "status": run.status,
            "success": run.success,
            "failure_reason": run.failure_reason,
            "strict_mode": bool(run.strict_mode),
            "tags": [t.strip() for t in run.tags.split(",") if t.strip()] if getattr(run, "tags", None) else [],
            "created_at": str(run.created_at),
            "total_steps": len(steps),
            "steps": [
                {
                    "step_index": s.step_index,
                    "target_instruction": goal_instructions[s.step_index] if s.step_index < len(goal_instructions) else None,
                    "action_executed": s.description,
                    "thought": s.thought
                } for s in steps
            ]
        }
        
        # 2. Markdown Report
        status_badge = "✅ PASSED" if (run.status == "completed" and run.success) else "❌ FAILED" if run.status == "completed" else f"⚠️ {run.status.upper()}"
        md_lines = [
            f"# Barely Test Execution Report: {run.name or run.id}",
            f"\n**Status:** {status_badge}  ",
            f"**Run ID:** `{run.id}`  ",
            f"**Target URL:** {run.start_url}  ",
            f"**Device Profile:** {run.device}  ",
            f"**Strict Mode:** {'Enabled' if run.strict_mode else 'Disabled (Auto-Healing)'}  ",
        ]
        if getattr(run, "tags", None):
            tags_str = ", ".join([f"`#{t.strip()}`" for t in run.tags.split(",") if t.strip()])
            if tags_str:
                md_lines.append(f"**Tags:** {tags_str}  ")
        md_lines.extend([
            f"**Timestamp:** {run.created_at}  \n",
            "## 🎯 Test Goal & Instructions",
            f"```text\n{run.goal}\n```\n"
        ])

        if not run.success and run.failure_reason:
            md_lines.extend([
                "## 🚨 Failure Analysis & Root Cause",
                "> **The agent halted execution with the following diagnostic reason:**",
                f"```text\n{run.failure_reason}\n```\n"
            ])

        md_lines.append("## 📋 Execution Steps Audit")
        if steps:
            for s in steps:
                md_lines.append(f"### Step {s.step_index + 1}")
                if s.step_index < len(goal_instructions):
                    md_lines.append(f"- **🎯 Target Goal Instruction:** `{goal_instructions[s.step_index]}`")
                if s.thought:
                    md_lines.append(f"- **💭 AI Agent Reasoning:** _{s.thought}_")
                md_lines.append(f"- **⚡ Action Executed:** `{s.description}`\n")
        else:
            md_lines.append("*(No execution steps were recorded)*\n")

        markdown_content = "\n".join(md_lines)
        html_content = generate_report_html(run, steps)

        # 3. Create Zip archive
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            zip_file.writestr('run_data.json', json.dumps(run_data, indent=2))
            zip_file.writestr('REPORT.md', markdown_content)
            zip_file.writestr('report.html', html_content)
            
        zip_buffer.seek(0)
        
        return StreamingResponse(
            iter([zip_buffer.getvalue()]), 
            media_type="application/zip", 
            headers={"Content-Disposition": f"attachment; filename=barely_report_{run_id}.zip"}
        )
    finally:
        db.close()
