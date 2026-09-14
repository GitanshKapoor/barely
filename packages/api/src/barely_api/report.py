import io
import json
import zipfile
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
            "created_at": str(run.created_at)
        }
        
        # 2. Generate HTML Report
        status_color = "green" if run.success else "red" if run.status == "completed" else "orange"
        html = f"""
        <html>
        <head>
            <style>
                body {{ font-family: -apple-system, sans-serif; margin: 40px; color: #333; }}
                .header {{ border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 20px; }}
                .status {{ display: inline-block; padding: 4px 12px; border-radius: 12px; background: {status_color}; color: white; font-weight: bold; }}
                .step {{ margin-bottom: 40px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }}
                img {{ max-width: 100%; border: 1px solid #ccc; margin-top: 10px; border-radius: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Barely Test Report: {run.name or run.id}</h1>
                <p><strong>Goal:</strong> {run.goal}</p>
                <p><strong>Device:</strong> {run.device} | <strong>URL:</strong> {run.start_url}</p>
                <p><strong>Status:</strong> <span class="status">{run.status.upper()}</span></p>
                {f'<p><strong>Error:</strong> {run.failure_reason}</p>' if run.failure_reason else ''}
            </div>
            <h2>Execution Steps</h2>
        """
        
        for step in steps:
            html += f"""
            <div class="step">
                <h3>Step {step.step_index}</h3>
                <p>{step.description}</p>
            """
            if step.screenshot_base64:
                html += f'<img src="data:image/jpeg;base64,{step.screenshot_base64}" />'
            html += "</div>"
            
        html += "</body></html>"
        
        # 3. Create Zip file in memory
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            zip_file.writestr('run_data.json', json.dumps(run_data, indent=2))
            zip_file.writestr('report.html', html)
            
        zip_buffer.seek(0)
        
        return StreamingResponse(
            iter([zip_buffer.getvalue()]), 
            media_type="application/zip", 
            headers={"Content-Disposition": f"attachment; filename=barely_report_{run_id}.zip"}
        )
    finally:
        db.close()
