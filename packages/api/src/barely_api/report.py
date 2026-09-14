import io
import json
import zipfile
import html as html_lib
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from barely_core.db import SessionLocal, RunRecord, RunStep

router = APIRouter()

@router.get("/api/runs/{run_id}/download")
def download_run_report(run_id: str):
    db = SessionLocal()
    try:
        run = db.query(RunRecord).filter(RunRecord.id == run_id).first()
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
            
        steps = db.query(RunStep).filter(RunStep.run_id == run_id).order_by(RunStep.step_index).all()
        
        # 1. Generate JSON payload
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
            "created_at": str(run.created_at),
            "total_steps": len(steps),
            "steps": [
                {
                    "step_index": s.step_index,
                    "description": s.description,
                    "thought": s.thought
                } for s in steps
            ]
        }
        
        # 2. Generate Markdown Report (REPORT.md)
        status_badge = "✅ PASSED" if run.success else "❌ FAILED" if run.status == "completed" else f"⚠️ {run.status.upper()}"
        
        md_lines = [
            f"# Barely Test Execution Report: {run.name or run.id}",
            f"\n**Status:** {status_badge}  ",
            f"**Run ID:** `{run.id}`  ",
            f"**Target URL:** {run.start_url}  ",
            f"**Device Profile:** {run.device}  ",
            f"**Strict Mode:** {'Enabled' if run.strict_mode else 'Disabled (Auto-Healing)'}  ",
            f"**Timestamp:** {run.created_at}  \n",
            "## 🎯 Test Goal & Instructions",
            f"```text\n{run.goal}\n```\n"
        ]

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
                if s.thought:
                    md_lines.append(f"*AI Agent Thought:* _{s.thought}_")
                md_lines.append(f"**Action:** `{s.description}`\n")
        else:
            md_lines.append("*(No execution steps were recorded)*\n")

        markdown_content = "\n".join(md_lines)

        # 3. Generate High-Fidelity Standalone HTML Report (report.html)
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
                    <span>Root Cause & Failure Diagnostic</span>
                </div>
                <div class="failure-content">
                    {escaped_reason}
                </div>
            </div>
            """

        steps_html = ""
        for s in steps:
            thought_snippet = ""
            if s.thought:
                thought_snippet = f"""
                <div class="step-thought">
                    <span class="thought-tag">AI Agent Thought</span>
                    <p class="thought-text">"{html_lib.escape(s.thought)}"</p>
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
                    <span class="step-pill">Step {s.step_index + 1}</span>
                    <span class="step-action">{html_lib.escape(s.description)}</span>
                </div>
                {thought_snippet}
                {img_snippet}
            </div>
            """

        html_content = f"""<!DOCTYPE html>
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
            line-height: 1.5;
            padding: 40px 20px;
        }}
        .container {{
            max-width: 900px;
            margin: 0 auto;
        }}
        .header {{
            background-color: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }}
        .header-top {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
            flex-wrap: wrap;
            gap: 12px;
        }}
        .title {{
            font-size: 22px;
            font-weight: 700;
            color: #fff;
        }}
        .status-badge {{
            background-color: {status_bg};
            color: white;
            font-size: 11px;
            font-weight: 800;
            padding: 4px 12px;
            border-radius: 20px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }}
        .meta-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
            font-size: 12px;
            color: var(--text-secondary);
            border-top: 1px solid var(--border);
            padding-top: 16px;
        }}
        .meta-item strong {{ color: #e2e8f0; }}
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
            font-size: 14px;
            font-weight: 700;
            color: var(--danger);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 10px;
        }}
        .failure-content {{
            font-family: monospace;
            font-size: 13px;
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
            margin-bottom: 16px;
            color: #cbd5e1;
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        .step-card {{
            background-color: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 16px;
            margin-bottom: 16px;
        }}
        .step-header {{
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
        }}
        .step-pill {{
            background-color: #1e293b;
            color: #94a3b8;
            font-size: 11px;
            font-family: monospace;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 4px;
        }}
        .step-action {{
            font-family: monospace;
            font-size: 13px;
            font-weight: 600;
            color: #f1f5f9;
        }}
        .step-thought {{
            background: rgba(2, 120, 255, 0.08);
            border-left: 3px solid var(--accent);
            padding: 8px 12px;
            border-radius: 0 6px 6px 0;
            margin-bottom: 12px;
        }}
        .thought-tag {{
            font-size: 9px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--accent);
            display: block;
            margin-bottom: 2px;
        }}
        .thought-text {{
            font-size: 11px;
            color: #94a3b8;
            font-style: italic;
        }}
        .step-screenshot {{
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid var(--border);
            background: #000;
            text-align: center;
            padding: 8px;
        }}
        .step-screenshot img {{
            max-width: 100%;
            height: auto;
            border-radius: 4px;
        }}
        .footer {{
            text-align: center;
            margin-top: 40px;
            font-size: 11px;
            color: var(--text-secondary);
            font-family: monospace;
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
            </div>
            <div class="goal-box">{html_lib.escape(run.goal)}</div>
        </div>

        {failure_html}

        <div class="section-title">Execution Steps ({len(steps)})</div>
        {steps_html if steps_html else '<p style="color: #64748b; font-size: 13px;">No execution steps were recorded.</p>'}

        <div class="footer">
            Generated by Barely v1.0 "Jumping Joey" Autonomous E2E QA Agent
        </div>
    </div>
</body>
</html>"""

        # 4. Pack into ZIP archive
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
